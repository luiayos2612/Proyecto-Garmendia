import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export const COOKIE_NAME = 'token';

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 8 * 60 * 60,
};

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET no está definido en el entorno');
  }
  return secret;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  rol: string;
  nombre: string;
  docenteId?: string; // ✅ NUEVO: solo presente cuando rol === 'docente'
  iat: number;
  exp: number;
}

export function signToken(payload: Record<string, unknown>) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '8h' });
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
  } catch {
    return null;
  }
}

export function comparePassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}