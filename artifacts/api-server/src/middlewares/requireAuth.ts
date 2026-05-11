import type { Request, Response, NextFunction } from "express";
import type { UserRow } from "@workspace/db";

type Role = UserRow["role"];

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.session) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.session) {
      res.status(401).json({ error: "Not signed in" });
      return;
    }
    if (!roles.includes(req.session.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
