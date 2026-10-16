import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import {
  respuestaNoAutorizada,
  usuarioCalendario,
  validarEvento,
} from '@/lib/calendario';

export const runtime = 'nodejs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

type Context = {
  params: Promise<{ id: string }> | { id: string };
};

function esUuid(valor: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    valor
  );
}

export async function PUT(request: NextRequest, context: Context) {
  const usuario = usuarioCalendario(request);
  if (!usuario || usuario.rol !== 'director') {
    return respuestaNoAutorizada(usuario?.rol);
  }

  const { id } = await context.params;

  if (!esUuid(id)) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
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
        UPDATE public.eventos_calendario
        SET
          titulo = $1,
          descripcion = $2,
          tipo = $3,
          fecha = $4::date,
          hora = $5::time,
          updated_at = now()
        WHERE id = $6::uuid
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
        id,
      ]
    );

    if (!resultado.rows[0]) {
      return NextResponse.json(
        { error: 'Evento no encontrado.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ evento: resultado.rows[0] });
  } catch (error) {
    console.error('PUT calendario:', error);
    return NextResponse.json(
      { error: 'No se pudo editar el evento.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const usuario = usuarioCalendario(request);
  if (!usuario || usuario.rol !== 'director') {
    return respuestaNoAutorizada(usuario?.rol);
  }

  const { id } = await context.params;

  if (!esUuid(id)) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  }

  try {
    const resultado = await pool.query(
      'DELETE FROM public.eventos_calendario WHERE id = $1::uuid RETURNING id',
      [id]
    );

    if (!resultado.rows[0]) {
      return NextResponse.json(
        { error: 'Evento no encontrado.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE calendario:', error);
    return NextResponse.json(
      { error: 'No se pudo eliminar el evento.' },
      { status: 500 }
    );
  }
}