import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function recalcularEstadoEstudiante(
  client: any,
  estudianteId: string
) {
  const estudianteResult = await client.query(
    `
      SELECT periodo_id
      FROM estudiantes
      WHERE id = $1
    `,
    [estudianteId]
  );

  if (estudianteResult.rows.length === 0) {
    return null;
  }

  const periodoActual = estudianteResult.rows[0].periodo_id;

  const deudaResult = await client.query(
    `
      SELECT
        COALESCE(
          SUM(monto) FILTER (
            WHERE estado IN ('pendiente', 'vencida')
          ),
          0
        ) AS deuda_total,

        COUNT(*) FILTER (
          WHERE estado IN ('pendiente', 'vencida')
        ) AS cuotas_pendientes
      FROM cuotas
      WHERE estudiante_id = $1
        AND periodo_id = $2
    `,
    [estudianteId, periodoActual]
  );

  const deudaTotal = Number(deudaResult.rows[0]?.deuda_total ?? 0);
  const cuotasPendientes = Number(
    deudaResult.rows[0]?.cuotas_pendientes ?? 0
  );

  const nuevoEstado = deudaTotal > 0 ? 'deuda' : 'activo';

  await client.query(
    `
      UPDATE estudiantes
      SET
        estado = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `,
    [nuevoEstado, estudianteId]
  );

  return {
    estado: nuevoEstado,
    periodo_id: periodoActual,
    deuda_total: deudaTotal,
    cuotas_pendientes: cuotasPendientes,
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { id: pagoId } = await params;
    const body = await request.json();
    const estado = body?.estado;

    if (!['confirmado', 'rechazado'].includes(estado)) {
      await client.query('ROLLBACK');

      return NextResponse.json(
        {
          error:
            'Estado inválido. Debe indicar "confirmado" o "rechazado".',
        },
        { status: 400 }
      );
    }

    const pagoResult = await client.query(
      `
        UPDATE pagos
        SET estado = $1
        WHERE id = $2
        RETURNING *
      `,
      [estado, pagoId]
    );

    if (pagoResult.rows.length === 0) {
      await client.query('ROLLBACK');

      return NextResponse.json(
        { error: 'Pago no encontrado.' },
        { status: 404 }
      );
    }

    const pago = pagoResult.rows[0];

    if (estado === 'confirmado') {
      await client.query(
        `
          UPDATE cuotas
          SET
            estado = 'pagada',
            pago_id = $1
          WHERE estudiante_id = $2
            AND periodo_id = $3
            AND concepto = $4
            AND estado IN ('pendiente', 'vencida')
        `,
        [
          pago.id,
          pago.estudiante_id,
          pago.periodo_id,
          pago.concepto,
        ]
      );
    }

    const estadoActualizado = await recalcularEstadoEstudiante(
      client,
      pago.estudiante_id
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      pago,
      estado_actualizado: estadoActualizado,
    });
  } catch (error) {
    await client.query('ROLLBACK');

    console.error('Error PATCH pago:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo actualizar el pago.',
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}