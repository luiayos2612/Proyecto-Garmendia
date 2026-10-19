import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { verifyToken } from '@/lib/auth';
import { registrarPagoPorCuotas } from '@/lib/pagosPorCuota';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function obtenerActor(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value ?? '';
    return verifyToken(token);
  } catch {
    return null;
  }
}

function esUuid(valor: unknown): valor is string {
  return (
    typeof valor === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      valor
    )
  );
}

export async function GET(request: NextRequest) {
  const actor = obtenerActor(request);

  if (!actor) {
    return NextResponse.json(
      { error: 'No autorizado.' },
      { status: 401 }
    );
  }

  if (!['director', 'secretaria'].includes(actor.rol)) {
    return NextResponse.json(
      { error: 'No tiene permisos para consultar pagos.' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado');
    const busqueda = searchParams.get('q')?.trim();

    let query = `
      SELECT
        e.id,
        e.nombres,
        e.apellidos,
        e.cedula,
        e.periodo_id,
        e.estado,
        e.created_at,
        p.nombre AS periodo_nombre,

        COALESCE(
          (
            SELECT SUM(pg.monto)
            FROM pagos pg
            WHERE pg.estudiante_id = e.id
              AND pg.periodo_id = e.periodo_id
              AND pg.estado = 'confirmado'
          ),
          0
        ) AS total_pagado,

        (
          SELECT COUNT(*)
          FROM pagos pg
          WHERE pg.estudiante_id = e.id
            AND pg.periodo_id = e.periodo_id
            AND pg.tipo = 'mensualidad'
            AND pg.estado = 'confirmado'
        ) AS mensualidades_pagadas,

        (
          SELECT COUNT(*)
          FROM pagos pg
          WHERE pg.estudiante_id = e.id
            AND pg.periodo_id = e.periodo_id
            AND pg.estado = 'verificacion'
        ) AS pagos_por_verificar,

        (
          SELECT json_build_object(
            'id', pg.id,
            'concepto', pg.concepto,
            'monto', pg.monto,
            'estado', pg.estado,
            'fecha_pago', pg.fecha_pago
          )
          FROM pagos pg
          WHERE pg.estudiante_id = e.id
            AND pg.periodo_id = e.periodo_id
          ORDER BY pg.created_at DESC, pg.id DESC
          LIMIT 1
        ) AS ultimo_pago

      FROM estudiantes e
      LEFT JOIN periodos p ON p.numero = e.periodo_id
      WHERE 1 = 1
    `;

    const values: string[] = [];

    if (estado) {
      if (!['activo', 'verificacion', 'deuda'].includes(estado)) {
        return NextResponse.json(
          { error: 'Filtro de estado inválido.' },
          { status: 400 }
        );
      }

      values.push(estado);
      query += ` AND e.estado = $${values.length}`;
    }

    if (busqueda) {
      values.push(`%${busqueda}%`);
      const posicion = values.length;

      query += `
        AND (
          e.nombres ILIKE $${posicion}
          OR e.apellidos ILIKE $${posicion}
          OR e.cedula ILIKE $${posicion}
        )
      `;
    }

    query += ` ORDER BY e.created_at DESC LIMIT 100`;

    const result = await pool.query(query, values);

    return NextResponse.json(
      { estudiantes: result.rows },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('[GET /api/pagos]', error);

    return NextResponse.json(
      { error: 'No se pudo cargar el seguimiento de pagos.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return registrarPagoPorCuotas(request);
}
