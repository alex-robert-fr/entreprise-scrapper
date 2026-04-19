import type { RequestHandler } from "express";
import type { ZodTypeAny, z } from "zod";

interface ValidationIssue {
  path: string;
  message: string;
}

function formatIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}

export function validateBody<S extends ZodTypeAny>(schema: S): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: "Validation failed",
        issues: formatIssues(result.error),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<S extends ZodTypeAny>(schema: S): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: "Validation failed",
        issues: formatIssues(result.error),
      });
      return;
    }
    req.query = result.data as typeof req.query;
    next();
  };
}
