import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { verifyToken } from '@/lib/auth';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get('token')?.value ?? '';
    const actor = verifyToken(token);

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

    const { id: estudianteId } = await params;

    const estudianteResult = await pool.query(
      `
        SELECT
          id,
          nombres,
          apellidos,
          cedula,
          estado,
          periodo_id
        FROM estudiantes
        WHERE id = $1
      `,
      [estudianteId]
    );

    if (estudianteResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Estudiante no encontrado.' },
        { status: 404 }
      );
    }

    const estudiante = estudianteResult.rows[0];
    const periodoActual = estudiante.periodo_id;

    if (periodoActual === null || periodoActual === undefined) {
      return NextResponse.json(
        { error: 'El estudiante no tiene un período asignado.' },
        { status: 400 }
      );
    }

    const [pagosResult, resumenResult] = await Promise.all([
      pool.query(
        `
          SELECT
            id,
            estudiante_id,
            tipo,
            concepto,
            monto,
            monto_bs,
            metodo_pago,
            referencia,
            fecha_pago,
            estado,
            observaciones,
            periodo_id,
            created_at
          FROM pagos
          WHERE estudiante_id = $1
            AND periodo_id = $2
          ORDER BY created_at DESC, id DESC
        `,
        [estudianteId, periodoActual]
      ),

      pool.query(
        `
          SELECT
            COALESCE(
              (
                SELECT SUM(p.monto)
                FROM pagos p
                WHERE p.estudiante_id = $1
                  AND p.periodo_id = $2
                  AND p.estado = 'confirmado'
              ),
              0
            ) AS total_pagado,

            COALESCE(
              (
                SELECT SUM(c.monto)
                FROM cuotas c
                WHERE c.estudiante_id = $1
                  AND c.periodo_id = $2
                  AND c.estado IN ('pendiente', 'vencida')
              ),
              0
            ) AS deuda_total,

            (
              SELECT COUNT(*)
              FROM cuotas c
              WHERE c.estudiante_id = $1
                AND c.periodo_id = $2
                AND c.estado IN ('pendiente', 'vencida')
            ) AS cuotas_pendientes
        `,
        [estudianteId, periodoActual]
      ),
    ]);

    const resumen = resumenResult.rows[0];

    return NextResponse.json(
      {
        estudiante,
        pagos: pagosResult.rows,
        resumen: {
          periodo_id: periodoActual,
          total_pagado: Number(resumen?.total_pagado ?? 0),
          deuda_total: Number(resumen?.deuda_total ?? 0),
          cuotas_pendientes: Number(
            resumen?.cuotas_pendientes ?? 0
          ),
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('Error GET pagos del estudiante:', error);

    return NextResponse.json(
      { error: 'No se pudo cargar el historial de pagos.' },
      { status: 500 }
    );
  }
}