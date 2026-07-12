import type { NextFunction, Request, Response } from "express";
import { prisma } from "../prisma.js";
import { supabaseAdmin } from "../supabase.js";

export interface AuthedRequest extends Request {
  userId?: string;
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing authorization token" });
    return;
  }
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    req.userId = data.user.id;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) {
    try {
      const { data } = await supabaseAdmin.auth.getUser(token);
      if (data.user) req.userId = data.user.id;
    } catch {
      // ignore invalid token for optional auth
    }
  }
  next();
}

// Admin-only gate. Reuses the same Supabase token verification as requireAuth,
// then checks the profile's role — blocks anyone who isn't role='admin'.
export async function isAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing authorization token" });
    return;
  }
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    const profile = await prisma.profile.findUnique({ where: { id: data.user.id } });
    if (!profile || profile.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    req.userId = data.user.id;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
