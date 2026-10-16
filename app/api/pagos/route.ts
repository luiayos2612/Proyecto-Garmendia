import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { verifyToken } from '@/lib/auth';

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
  const actor = obtenerActor(request);

  if (!actor) {
    return NextResponse.json(
      { error: 'No autorizado.' },
      { status: 401 }
    );
  }

  if (!['director', 'secretaria'].includes(actor.rol)) {
    return NextResponse.json(
      { error: 'No tiene permisos para registrar pagos.' },
      { status: 403 }
    );
  }

  let body: any;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'El cuerpo de la solicitud no es un JSON válido.' },
      { status: 400 }
    );
  }

  const estudianteId = body.estudiante_id;
  const tipo = body.tipo ?? 'mensualidad';
  const concepto =
    typeof body.concepto === 'string'
      ? body.concepto.trim()
      : '';
  const metodoPago =
    typeof body.metodo_pago === 'string'
      ? body.metodo_pago.trim()
      : '';

  const monto = Number(body.monto);
  const montoOriginal = Number(body.monto_original_usd ?? body.monto);
  const descuento = Number(body.descuento_aplicado ?? 0);

  if (
    !esUuid(estudianteId) ||
    !concepto ||
    concepto.length > 100 ||
    !metodoPago ||
    metodoPago.length > 50
  ) {
    return NextResponse.json(
      { error: 'Revise estudiante, concepto y método de pago.' },
      { status: 400 }
    );
  }

  if (!['inscripcion', 'mensualidad', 'otro'].includes(tipo)) {
    return NextResponse.json(
      { error: 'Tipo de pago inválido.' },
      { status: 400 }
    );
  }

  if (
    !Number.isFinite(monto) ||
    monto <= 0 ||
    !Number.isFinite(montoOriginal) ||
    montoOriginal <= 0 ||
    !Number.isFinite(descuento) ||
    descuento < 0 ||
    descuento > montoOriginal ||
    Math.abs(montoOriginal - descuento - monto) > 0.011
  ) {
    return NextResponse.json(
      { error: 'Monto original, descuento y monto neto no coinciden.' },
      { status: 400 }
    );
  }

  const esPagoBs = ['Pago Móvil', 'Transferencia Bs'].includes(
    metodoPago
  );

  let montoBs: number | null = null;
  let tasaCambio: number | null = null;

  if (esPagoBs) {
    montoBs = Number(body.monto_bs);
    tasaCambio = Number(body.tasa_cambio_usada);

    if (
      !Number.isFinite(montoBs) ||
      montoBs <= 0 ||
      !Number.isFinite(tasaCambio) ||
      tasaCambio <= 0 ||
      Math.abs(monto * tasaCambio - montoBs) > 0.011
    ) {
      return NextResponse.json(
        { error: 'Revise el monto en bolívares y la tasa utilizada.' },
        { status: 400 }
      );
    }
  }

  const referencia =
    typeof body.referencia === 'string'
      ? body.referencia.trim() || null
      : null;

  if (referencia && referencia.length > 100) {
    return NextResponse.json(
      { error: 'La referencia no puede superar 100 caracteres.' },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const estudianteResult = await client.query(
      `
        SELECT id, periodo_id
        FROM estudiantes
        WHERE id = $1
        FOR UPDATE
      `,
      [estudianteId]
    );

    if (estudianteResult.rows.length === 0) {
      await client.query('ROLLBACK');

      return NextResponse.json(
        { error: 'Estudiante no encontrado.' },
        { status: 404 }
      );
    }

    const periodoActual = estudianteResult.rows[0].periodo_id;

    if (periodoActual === null || periodoActual === undefined) {
      await client.query('ROLLBACK');

      return NextResponse.json(
        { error: 'El estudiante no tiene un período asignado.' },
        { status: 400 }
      );
    }

    if (
      body.periodo_id !== undefined &&
      Number(body.periodo_id) !== Number(periodoActual)
    ) {
      await client.query('ROLLBACK');

      return NextResponse.json(
        {
          error:
            'El período del estudiante cambió. Recargue la ficha antes de registrar el pago.',
        },
        { status: 409 }
      );
    }

    const result = await client.query(
      `
        INSERT INTO pagos (
          estudiante_id,
          periodo_id,
          tipo,
          concepto,
          monto,
          monto_original_usd,
          descuento_aplicado,
          monto_bs,
          tasa_cambio_usada,
          metodo_pago,
          referencia,
          fecha_pago,
          estado
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11,
          CURRENT_DATE,
          'verificacion'
        )
        RETURNING *
      `,
      [
        estudianteId,
        periodoActual,
        tipo,
        concepto,
        monto,
        montoOriginal,
        descuento,
        montoBs,
        tasaCambio,
        metodoPago,
        referencia,
      ]
    );

    const pago = result.rows[0];

    await client.query(
      `
        INSERT INTO auditoria (
          tabla_afectada,
          accion,
          usuario_id,
          datos_nuevos
        )
        VALUES ('pagos', 'INSERT', $1, $2)
      `,
      [
        actor.userId ?? null,
        JSON.stringify(pago),
      ]
    );

    await client.query('COMMIT');

    return NextResponse.json(
      {
        success: true,
        message: 'Pago registrado y pendiente de verificación.',
        pago,
      },
      { status: 201 }
    );
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[POST /api/pagos]', error);

    return NextResponse.json(
      { error: 'No se pudo registrar el pago.' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}