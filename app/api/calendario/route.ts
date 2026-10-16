import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import {
  esFechaValida,
  respuestaNoAutorizada,
  usuarioCalendario,
  validarEvento,
} from '@/lib/calendario';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET(request: NextRequest) {
  const usuario = usuarioCalendario(request);

  if (!usuario) {
    return respuestaNoAutorizada();
  }

  const { searchParams } = new URL(request.url);
  const desde = searchParams.get('desde');
  const hasta = searchParams.get('hasta');

  if (!esFechaValida(desde) || !esFechaValida(hasta) || desde > hasta) {
    return NextResponse.json(
      { error: 'Indica un rango de fechas válido.' },
      { status: 400 }
    );
  }

  try {
    const resultado = await pool.query(
      `
        SELECT
          id,
          titulo,
          descripcion,
          tipo,
          to_char(fecha, 'YYYY-MM-DD') AS fecha,
          to_char(hora, 'HH24:MI') AS hora
        FROM public.eventos_calendario
        WHERE fecha BETWEEN $1::date AND $2::date
        ORDER BY fecha ASC, hora ASC NULLS FIRST, created_at ASC
        LIMIT 500
      `,
      [desde, hasta]
    );

    return NextResponse.json(
      { eventos: resultado.rows },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('GET calendario:', error);

    return NextResponse.json(
      { error: 'No se pudieron cargar los eventos.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const usuario = usuarioCalendario(request);

  if (!usuario || usuario.rol !== 'director') {
    return respuestaNoAutorizada(usuario?.rol);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'JSON inválido.' },
      { status: 400 }
    );
  }

  const evento = validarEvento(body);

  if (!evento) {
    return NextResponse.json(
      { error: 'Revisa título, tipo, fecha y hora del evento.' },
      { status: 400 }
    );
  }

  try {
    const resultado = await pool.query(
      `
        INSERT INTO public.eventos_calendario (
          titulo,
          descripcion,
          tipo,
          fecha,
          hora
        )
        VALUES ($1, $2, $3, $4::date, $5::time)
        RETURNING
          id,
          titulo,
          descripcion,
          tipo,
          to_char(fecha, 'YYYY-MM-DD') AS fecha,
          to_char(hora, 'HH24:MI') AS hora
      `,
      [
        evento.titulo,
        evento.descripcion,
        evento.tipo,
        evento.fecha,
        evento.hora,
      ]
    );

    return NextResponse.json(
      { evento: resultado.rows[0] },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST calendario:', error);

    return NextResponse.json(
      { error: 'No se pudo crear el evento.' },
      { status: 500 }
    );
  }
}