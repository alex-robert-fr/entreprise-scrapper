import crypto from 'crypto';
import express from 'express';
// Assuming a 'db' object or similar for user credit management
// For this example, we'll use simple in-memory objects for user credits and processed events.
// In a real application, these would be backed by a persistent database.
const usersDb = {}; // { userId: { credits: 0 } }
const processedWebhookEvents = new Set(); // Stores unique identifiers of processed events for idempotency

// Environment variables
// These should be loaded from .env or similar configuration management (e.g., dotenv)
const POLAR_API_KEY = process.env.POLAR_API_KEY;
const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET;
const POLAR_API_BASE_URL = process.env.POLAR_API_BASE_URL || 'https://api.polar.sh';
const APP_BASE_URL = process.env.APP_BASE_URL; // Your application's base URL for success/cancel redirects

const router = express.Router();

// --- Product & Credit Mapping ---
// Map product identifiers to Polar.sh product/price IDs and credit amounts.
// IMPORTANT: Replace placeholder IDs with actual Polar.sh Product and Price IDs.
const productConfig = {
    'starter': { // Keys match `productId` expected in POST /checkout body ('starter', 'pro', 'business')
        polarProductId: 'starter_pack_id_from_polar', // !! REPLACE WITH ACTUAL POLAR.SH PRODUCT ID !!
        priceId: 'starter_price_id_from_polar',     // !! REPLACE WITH ACTUAL POLAR.SH PRICE ID !!
        credits: 500,
        name: 'Starter Pack',
        amount: 1900, // in cents (e.g., 19.00€)
        currency: 'EUR'
    },
    'pro': {
        polarProductId: 'pro_pack_id_from_polar',     // !! REPLACE WITH ACTUAL POLAR.SH PRODUCT ID !!
        priceId: 'pro_price_id_from_polar',         // !! REPLACE WITH ACTUAL POLAR.SH PRICE ID !!
        credits: 2000,
        name: 'Pro Pack',
        amount: 5900, // in cents
        currency: 'EUR'
    },
    'business': {
        polarProductId: 'business_pack_id_from_polar', // !! REPLACE WITH ACTUAL POLAR.SH PRODUCT ID !!
        priceId: 'business_price_id_from_polar',     // !! REPLACE WITH ACTUAL POLAR.SH PRICE ID !!
        credits: 10000,
        name: 'Business Pack',
        amount: 19900, // in cents
        currency: 'EUR'
    },
};

// --- Helper for Webhook Signature Verification (Svix Standard) ---
// IMPORTANT: As per core lessons and bounty instructions, this assumes Polar.sh webhooks
// will adhere to the Svix standard for signature verification using:
// - Header: 'webhook-signature' (format: t=TIMESTAMP,v1=SIGNATURE)
// - Header: 'x-webhook-id' (for message ID)
// - Signed Payload format: `msg_id.timestamp.payload`
// If Polar.sh's actual implementation deviates (e.g., uses X-Polar-Signature or a different payload format),
// an intermediary adapter or adjustment to this function would be required.
function verifyWebhookSignature(req, secret) {
    const signatureHeader = req.headers['webhook-signature'];
    const msgIdHeader = req.headers['x-webhook-id'];
    const rawBody = req.rawBody;

    if (!signatureHeader || !msgIdHeader || !rawBody) {
        throw new Error('Missing webhook signature (webhook-signature), message ID (x-webhook-id), or raw body for verification.');
    }

    const parts = signatureHeader.split(',').reduce((acc, part) => {
        const [key, value] = part.split('=');
        acc[key] = value;
        return acc;
    }, {});

    const timestamp = parts.t;
    const signature = parts.v1; // Assuming v1 as the version of the signature

    if (!timestamp || !signature) {
        throw new Error('Invalid webhook signature header format. Expected t=TIMESTAMP,v1=SIGNATURE.');
    }

    // Construct the signed payload string as per Svix standard: `msg_id.timestamp.payload`
    const signedPayload = `${msgIdHeader}.${timestamp}.${rawBody.toString('utf8')}`;

    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');

    // Compare signatures using a timing-safe function to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
    );

    if (!isValid) {
        throw new Error('Webhook signature mismatch. Verification failed.');
    }

    // Check for replay attacks (recommended)
    const tolerance = 5 * 60 * 1000; // 5 minutes tolerance
    const now = Date.now();
    const eventTimestamp = parseInt(timestamp, 10) * 1000; // Convert to milliseconds

    if (Math.abs(now - eventTimestamp) > tolerance) {
        throw new Error('Webhook timestamp outside tolerance (possible replay attack).');
    }

    return true;
}

// --- Checkout Endpoint ---
// Initiates a Polar.sh checkout session for a user to purchase credits.
// Requires authentication via an upstream middleware (not included in this file).
router.post('/checkout', async (req, res) => {
    // productId (e.g., 'starter', 'pro', 'business'), userId (your internal user ID)
    const { productId, userId } = req.body;

    if (!POLAR_API_KEY || !APP_BASE_URL) {
        return res.status(500).json({ error: 'Server not configured: Missing POLAR_API_KEY or APP_BASE_URL.' });
    }

    if (!productId || !userId) {
        return res.status(400).json({ error: 'Missing productId or userId in request body.' });
    }

    const product = productConfig[productId];
    if (!product) {
        return res.status(400).json({ error: 'Invalid product ID provided.' });
    }

    try {
        const response = await fetch(`${POLAR_API_BASE_URL}/api/v1/checkout/sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${POLAR_API_KEY}`,
            },
            body: JSON.stringify({
                line_items: [{
                    price_id: product.priceId, // Use the configured price_id
                    quantity: 1
                }],
                // Redirect URL after successful payment as per GitHub description: /billing/success
                success_url: `${APP_BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}&user_id=${userId}`,
                cancel_url: `${APP_BASE_URL}/billing/cancel?user_id=${userId}`, // Assuming a /billing/cancel route
                customer_id: userId, // Link to your internal user ID in Polar.sh
                metadata: { // Custom metadata to retrieve in webhook
                    userId: userId,
                    productId: productId,
                    credits: product.credits,
                },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Polar.sh API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        res.status(200).json({ checkoutUrl: data.url }); // Redirect user to this URL

    } catch (error) {
        res.status(500).json({ error: `Failed to create checkout session with Polar.sh: ${error.message}` });
    }
});

// --- Webhook Endpoint ---
// Listens for Polar.sh webhook events to add credits after successful payments.
// IMPORTANT: This route requires the raw request body for signature verification.
// Ensure your main Express app uses `express.raw()` or `body-parser.raw()` for this specific path.
router.post('/polar-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!POLAR_WEBHOOK_SECRET) {
        return res.status(500).send('Server not configured: Missing POLAR_WEBHOOK_SECRET.');
    }

    try {
        // 1. Verify webhook signature using the Svix standard as required
        verifyWebhookSignature(req, POLAR_WEBHOOK_SECRET);

        // 2. Parse the event payload from the raw body (already verified)
        const event = JSON.parse(req.rawBody.toString('utf8'));

        // 3. Process the event based on its type
        // Polar.sh webhook event types documentation: https://polar.sh/docs/webhooks
        if (event.type === 'order.completed') { // The GitHub issue mentions 'order.paid', 'order.completed' is typical for Polar.sh
            const order = event.data;
            const polarOrderId = order.id; // Unique identifier for the Polar order
            const userId = order.customer_id || order.metadata?.userId; // Get userId from customer_id or metadata

            if (!polarOrderId) {
                return res.status(400).send('Webhook received for order.completed but no unique order ID found.');
            }
            if (!userId) {
                return res.status(400).send('Webhook received for order.completed but no user ID found in customer_id or metadata.');
            }

            // 4. Idempotency Check: Prevent processing the same event multiple times
            // In a real database, this would involve checking if `polarOrderId` already exists
            // in your `credit_transactions` table's metadata or as a unique field.
            if (processedWebhookEvents.has(polarOrderId)) {
                return res.status(200).send('Webhook event already processed (idempotent).');
            }

            let creditsToAdd = 0;
            // Iterate over order line items to determine credits to add
            for (const item of order.line_items) {
                // Find the corresponding product config using product_id or price_id
                const purchasedProductKey = Object.keys(productConfig).find(key =>
                    productConfig[key].polarProductId === item.product_id ||
                    productConfig[key].priceId === item.price_id
                );
                if (purchasedProductKey) {
                    creditsToAdd += productConfig[purchasedProductKey].credits * item.quantity;
                }
            }

            // Fallback: If metadata contains credits (might be useful for custom products not in config)
            if (creditsToAdd === 0 && order.metadata?.credits) {
                creditsToAdd = parseInt(order.metadata.credits, 10);
            }

            if (creditsToAdd > 0) {
                // Add credits to the user's account in your database
                if (!usersDb[userId]) {
                    usersDb[userId] = { credits: 0 }; // Initialize if user not present
                }
                usersDb[userId].credits += creditsToAdd;
                // In a real application, replace this with a database update:
                // For example: await db.creditTransactions.insert({ type: 'purchase', userId, amount: creditsToAdd, polarOrderId, metadata: order.metadata });
                //              await db.users.update({ id: userId }, { $inc: { credits: creditsToAdd } });
            }

            // Mark event as processed (after successful database transaction in a real app)
            processedWebhookEvents.add(polarOrderId);
        }
        // Other Polar.sh event types can be handled here if necessary (e.g., 'invoice.paid')

        res.status(200).send('Webhook received and processed successfully.');

    } catch (error) {
        // Return appropriate HTTP status codes based on the error type
        if (error.message.includes('signature') || error.message.includes('replay attack')) {
            return res.status(401).send('Webhook signature verification failed.');
        }
        // Log the error internally for debugging, but avoid exposing sensitive details to the client
        res.status(400).send(`Webhook processing error: ${error.message}`);
    }
});

export default router;

/*
// --- Example for your main Express app (e.g., app.js or server.js) ---
// This section demonstrates how to integrate the billing routes into your main Express application.

import express from 'express';
import billingRoutes from './src/api/billing.js'; // Adjust path as necessary
import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

const app = express();

// Middleware configuration:
// For the webhook endpoint, we need the raw body. For other API endpoints, JSON body parsing is typical.
// This conditional middleware ensures `req.rawBody` is available only for the webhook route
// while other routes benefit from `express.json()`.
app.use((req, res, next) => {
    if (req.originalUrl === '/api/billing/polar-webhook') {
        next(); // Let the specific webhook route handler (router.post('/polar-webhook', express.raw...)) handle raw body
    } else {
        express.json()(req, res, next); // Use JSON body parser for other routes
    }
});

// Mount the billing routes under '/api/billing'
app.use('/api/billing', billingRoutes);

// Basic error handling middleware (optional)
app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }
    // In a production environment, avoid sending stack traces directly to the client.
    // Log the error internally and send a generic message.
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    // Application started successfully
});
*/