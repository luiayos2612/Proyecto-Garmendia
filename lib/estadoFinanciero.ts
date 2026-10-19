import type { PoolClient } from 'pg';

interface ResumenFinanciero {
  total_pagado: number;
  deuda_total: number;
  deuda_exigible: number;
  cuotas_pendientes: number;
  cuotas_exigibles_pendientes: number;
  mensualidades_pagadas: number;
  inscripcion_pagada: boolean;
  estado: 'activo' | 'deuda';
}

export async function obtenerResumenFinanciero(
  client: PoolClient,
  estudianteId: string,
  intentoId: string,
  fechaReferencia?: string
): Promise<ResumenFinanciero> {
  const resultado = await client.query(
    `
      WITH contexto AS (
        SELECT
          $1::uuid AS estudiante_id,
          $2::uuid AS intento_id,
          COALESCE(
            $3::date,
            (
              CURRENT_TIMESTAMP
              AT TIME ZONE 'America/Caracas'
            )::date
          ) AS fecha
      ),
      obligaciones AS (
        SELECT
          COALESCE(
            SUM(c.monto) FILTER (
              WHERE c.estado IN ('pendiente', 'vencida')
            ),
            0
          ) AS deuda_total,

          COALESCE(
            SUM(c.monto) FILTER (
              WHERE c.estado IN ('pendiente', 'vencida')
                AND c.fecha_vencimiento <= contexto.fecha
            ),
            0
          ) AS deuda_exigible,

          COUNT(*) FILTER (
            WHERE c.estado IN ('pendiente', 'vencida')
          ) AS cuotas_pendientes,

          COUNT(*) FILTER (
            WHERE c.estado IN ('pendiente', 'vencida')
              AND c.fecha_vencimiento <= contexto.fecha
          ) AS cuotas_exigibles_pendientes,

          COUNT(*) FILTER (
            WHERE c.tipo_cuota = 'mensualidad'
              AND c.estado = 'pagada'
          ) AS mensualidades_pagadas
        FROM contexto
        LEFT JOIN cuotas c
          ON c.estudiante_id = contexto.estudiante_id
         AND c.intento_id = contexto.intento_id
      )
      SELECT
        obligaciones.*,

        COALESCE(
          (
            SELECT SUM(p.monto)
            FROM pagos p
            JOIN contexto ctx
              ON ctx.estudiante_id = p.estudiante_id
             AND ctx.intento_id = p.intento_id
            WHERE p.estado = 'confirmado'
          ),
          0
        ) AS total_pagado,

        EXISTS (
          SELECT 1
          FROM cuotas c
          JOIN contexto ctx
            ON ctx.estudiante_id = c.estudiante_id
          WHERE c.tipo_cuota = 'inscripcion'
            AND c.estado = 'pagada'
        ) AS inscripcion_pagada

      FROM obligaciones
    `,
    [
      estudianteId,
      intentoId,
      fechaReferencia ?? null,
    ]
  );

  const fila = resultado.rows[0];

  const deudaExigible = Number(
    fila.deuda_exigible ?? 0
  );

  const inscripcionPagada =
    fila.inscripcion_pagada === true;

  return {
    total_pagado: Number(fila.total_pagado ?? 0),
    deuda_total: Number(fila.deuda_total ?? 0),
    deuda_exigible: deudaExigible,
    cuotas_pendientes: Number(
      fila.cuotas_pendientes ?? 0
    ),
    cuotas_exigibles_pendientes: Number(
      fila.cuotas_exigibles_pendientes ?? 0
    ),
    mensualidades_pagadas: Number(
      fila.mensualidades_pagadas ?? 0
    ),
    inscripcion_pagada: inscripcionPagada,
    estado:
      inscripcionPagada && deudaExigible === 0
        ? 'activo'
        : 'deuda',
  };
}