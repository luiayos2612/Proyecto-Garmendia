import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export type EventoInput = {
  titulo: string;
  descripcion: string | null;
  tipo: 'evento' | 'recordatorio';
  fecha: string;
  hora: string | null;
};

export function usuarioCalendario(request: NextRequest) {
  const token = request.cookies.get('token')?.value;

  if (!token) return null;

  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

export function respuestaNoAutorizada(rol?: string) {
  return NextResponse.json(
    { error: rol ? 'Solo el director puede modificar el calendario.' : 'Inicia sesión.' },
    { status: rol ? 403 : 401 }
  );
}

export function esFechaValida(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return false;
  }

  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));

  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

export function validarEvento(body: unknown): EventoInput | null {
  if (!body || typeof body !== 'object') return null;

  const datos = body as Record<string, unknown>;

  const titulo =
    typeof datos.titulo === 'string' ? datos.titulo.trim() : '';

  const descripcion =
    typeof datos.descripcion === 'string'
      ? datos.descripcion.trim()
      : '';

  const hora =
    typeof datos.hora === 'string' && datos.hora.trim()
      ? datos.hora.trim()
      : null;

  if (titulo.length < 1 || titulo.length > 150) return null;
  if (descripcion.length > 2000) return null;
  if (datos.tipo !== 'evento' && datos.tipo !== 'recordatorio') return null;
  if (!esFechaValida(datos.fecha)) return null;

  if (hora !== null) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return null;
  }

  return {
    titulo,
    descripcion: descripcion || null,
    tipo: datos.tipo,
    fecha: datos.fecha,
    hora,
  };
}