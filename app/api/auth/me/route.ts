import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);

  if (!actor) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
  }

  return NextResponse.json({
    userId: actor.userId,
    email: actor.email,
    nombre: actor.nombre,
    rol: actor.rol,
    docenteId: actor.docenteId ?? null,
  });
}