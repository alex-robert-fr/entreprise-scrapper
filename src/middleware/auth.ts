import type { RequestHandler } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth.js";

export type UserRole = "user" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

const toUserRole = (raw: string | null | undefined): UserRole =>
  raw === "admin" ? "admin" : "user";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function makeAuthGuard(onUnauth: RequestHandler): RequestHandler {
  return (req, res, next) => {
    auth.api
      .getSession({ headers: fromNodeHeaders(req.headers) })
      .then((result) => {
        if (!result) {
          onUnauth(req, res, next);
          return;
        }
        req.user = {
          id: result.user.id,
          email: result.user.email,
          role: toUserRole(result.user.role),
        };
        next();
      })
      .catch(next);
  };
}

export const requireAuth = makeAuthGuard((_req, res) => {
  res.status(401).json({ error: "Unauthorized" });
});

export const dashboardGuard = makeAuthGuard((_req, res) => {
  res.redirect(302, "/login");
});

export const alreadyAuthGuard: RequestHandler = (req, res, next) => {
  auth.api
    .getSession({ headers: fromNodeHeaders(req.headers) })
    .then((result) => {
      if (result) {
        res.redirect(302, "/");
        return;
      }
      next();
    })
    .catch(next);
};

export const adminDashboardGuard: RequestHandler = (req, res, next) => {
  auth.api
    .getSession({ headers: fromNodeHeaders(req.headers) })
    .then((result) => {
      if (!result) {
        res.redirect(302, "/login");
        return;
      }
      const role = toUserRole(result.user.role);
      if (role !== "admin") {
        res.status(403).send("Accès refusé");
        return;
      }
      req.user = {
        id: result.user.id,
        email: result.user.email,
        role,
      };
      next();
    })
    .catch(next);
};

export const requireAdminAuth: RequestHandler = (req, res, next) => {
  auth.api
    .getSession({ headers: fromNodeHeaders(req.headers) })
    .then((result) => {
      if (!result) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const role = toUserRole(result.user.role);
      if (role !== "admin") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      req.user = {
        id: result.user.id,
        email: result.user.email,
        role,
      };
      next();
    })
    .catch(next);
};
