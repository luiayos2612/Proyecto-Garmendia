import { NextResponse } from 'next/server';
import { COOKIE_NAME, cookieOptions, verifyToken } from '@/lib/auth';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function POST(request: Request) {
  const token = request.headers.get('cookie')?.split(';').find((cookie) => cookie.trim().startsWith(`${COOKIE_NAME}=`))?.split('=')[1] || '';
  const payload = token ? verifyToken(token) : null;

  if (payload) {
    await pool.query(
      `INSERT INTO auditoria (tabla_afectada, accion, usuario_id, datos_nuevos)
       VALUES ($1, $2, $3, $4)`,
      ['usuarios', 'INSERT', payload.userId, JSON.stringify({ email: payload.email, timestamp: new Date(), tipo: 'logout' })]
    );
  }

  const response = NextResponse.json({ message: 'Logout exitoso' });
  response.cookies.set(COOKIE_NAME, '', {
    ...cookieOptions,
    maxAge: 0,
  });
  return response;
}
