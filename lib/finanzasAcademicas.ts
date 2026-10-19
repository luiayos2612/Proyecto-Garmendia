import type { PoolClient } from 'pg';

interface DatosMensualidades {
  estudianteId: string;
  intentoId: string;
  periodoId: number;
  montoMensualidad: number;
}

export async function crearMensualidadesDelIntento(
  client: PoolClient,
  datos: DatosMensualidades
): Promise<number> {
  const {
    estudianteId,
    intentoId,
    periodoId,
    montoMensualidad,
  } = datos;

  if (
    !Number.isInteger(periodoId) ||
    periodoId < 1 ||
    periodoId > 6
  ) {
    throw new Error(
      'El período para generar mensualidades no es válido.'
    );
  }

  if (
    !Number.isFinite(montoMensualidad) ||
    montoMensualidad <= 0 ||
    Math.abs(
      montoMensualidad * 100 -
      Math.round(montoMensualidad * 100)
    ) > 0.000001
  ) {
    throw new Error(
      'La mensualidad debe ser positiva y tener máximo dos decimales.'
    );
  }

  let etapa = 'validar intento';

  // Temporal: permite confirmar qué versión carga el servidor.
  console.info('[mensualidades-v2] Iniciando generación');

  try {
    const intentoResult = await client.query(
      `
        SELECT id
        FROM intentos_academicos
        WHERE id = $1::uuid
          AND estudiante_id = $2::uuid
          AND periodo_id = $3::integer
          AND estado = 'en_curso'
        FOR UPDATE
      `,
      [
        intentoId,
        estudianteId,
        periodoId,
      ]
    );

    if (intentoResult.rows.length === 0) {
      throw new Error(
        'No existe un intento abierto compatible con el alumno y período.'
      );
    }

    let creadas = 0;

    for (let numero = 1; numero <= 6; numero++) {
      etapa = `insertar mensualidad ${numero}`;

      const concepto =
        `Mensualidad ${numero} - Período ${periodoId}`;

      const resultado = await client.query(
        `
            WITH vencimiento AS (
            SELECT
                CASE
                WHEN $5::smallint = 1
                    THEN ia.fecha_inicio
                ELSE (
                    date_trunc(
                    'month',
                    ia.fecha_inicio::timestamp
                    )
                    + ($5::smallint - 1) * INTERVAL '1 month'
                )::date
                END AS fecha
            FROM intentos_academicos ia
            WHERE ia.id = $2::uuid
                AND ia.estudiante_id = $1::uuid
                AND ia.periodo_id = $3::integer
                AND ia.estado = 'en_curso'
            )
            INSERT INTO cuotas (
            estudiante_id,
            intento_id,
            periodo_id,
            tipo_cuota,
            numero_mensualidad,
            concepto,
            monto,
            fecha_vencimiento,
            estado,
            mes,
            ano
            )
            SELECT
            $1::uuid,
            $2::uuid,
            $3::integer,
            'mensualidad',
            $5::smallint,
            $6::text,
            $4::numeric,
            vencimiento.fecha,
            'pendiente',
            EXTRACT(MONTH FROM vencimiento.fecha)::integer,
            EXTRACT(YEAR FROM vencimiento.fecha)::integer
            FROM vencimiento
            ON CONFLICT (intento_id, numero_mensualidad)
            WHERE intento_id IS NOT NULL
            AND numero_mensualidad IS NOT NULL
            DO NOTHING
            RETURNING id
        `,
        [
            estudianteId,
            intentoId,
            periodoId,
            montoMensualidad,
            numero,
            concepto,
        ]
        );

      creadas += resultado.rowCount ?? 0;
    }

    console.info(
      '[mensualidades-v2] Finalizado:',
      { mensualidadesCreadas: creadas }
    );

    return creadas;
  } catch (error: unknown) {
    console.error(
      `[mensualidades-v2] Falló la etapa: ${etapa}`
    );

    throw error;
  }
}