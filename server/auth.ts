import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import { AppError } from "./http";
import { getAdminServices } from "./firebaseAdmin";

export interface AuthenticatedRequest extends Request {
  user: DecodedIdToken;
}

function bearerToken(req: Request): string | null {
  const value = req.header("authorization");
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

async function verifyRequest(req: Request): Promise<DecodedIdToken | null> {
  const token = bearerToken(req);
  if (!token) return null;
  try {
    return await getAdminServices().auth.verifyIdToken(token, true);
  } catch {
    throw new AppError(401, "INVALID_AUTH_TOKEN", "Your session is invalid or expired.");
  }
}

export const optionalUser: RequestHandler = async (req, _res, next) => {
  try {
    const user = await verifyRequest(req);
    if (user) (req as AuthenticatedRequest).user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireUser: RequestHandler = async (req, _res, next) => {
  try {
    const user = await verifyRequest(req);
    if (!user) throw new AppError(401, "AUTH_REQUIRED", "Please sign in to continue.");
    (req as AuthenticatedRequest).user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export function currentUser(req: Request): DecodedIdToken {
  const user = (req as AuthenticatedRequest).user;
  if (!user) throw new AppError(401, "AUTH_REQUIRED", "Please sign in to continue.");
  return user;
}

export function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}
