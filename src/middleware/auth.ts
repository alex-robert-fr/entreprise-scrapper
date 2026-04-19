import type { RequestHandler } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth";

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const requireAuth: RequestHandler = (req, res, next) => {
  auth.api
    .getSession({ headers: fromNodeHeaders(req.headers) })
    .then((result) => {
      if (!result) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      req.user = {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role ?? "user",
      };
      next();
    })
    .catch(next);
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
};
