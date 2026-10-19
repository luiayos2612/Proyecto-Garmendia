import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

import { verifyToken } from '@/lib/auth';

import {
  ErrorCierreAcademico,
  evaluarCierreAcademico,
} from '@/lib/cierreAcademico';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = verifyToken(
    request.cookies.get('token')?.value ?? ''
  );

  if (!actor) {
    return NextResponse.json(
      { error: 'No autorizado.' },
      { status: 401 }
    );
  }

  if (actor.rol !== 'director') {
    return NextResponse.json(
      {
        error:
          'Solo el director puede preparar el cierre académico.',
      },
      { status: 403 }
    );
  }

  const { id: estudianteId } =
    await params;

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      estudianteId
    )
  ) {
    return NextResponse.json(
      { error: 'Identificador de estudiante inválido.' },
      { status: 400 }
    );
  }

  let client:
    import('pg').PoolClient | undefined;

  let transaccionAbierta = false;

  try {
    client = await pool.connect();

    await client.query('BEGIN');
    transaccionAbierta = true;

    await client.query(
      "SET LOCAL TIME ZONE 'America/Caracas'"
    );

    const evaluacion =
      await evaluarCierreAcademico(
        client,
        estudianteId
      );

    if (!evaluacion.puede_preparar) {
      await client.query('ROLLBACK');
      transaccionAbierta = false;

      return NextResponse.json(
        {
          error:
            evaluacion.bloqueos.join(' '),
          evaluacion,
        },
        { status: 409 }
      );
    }

    const procesadoResult =
      await client.query(
        `
          SELECT id
          FROM cupos
          WHERE intento_origen_id = $1::uuid
            AND estado = 'aprobado'
          LIMIT 1
        `,
        [evaluacion.intento_origen_id]
      );

    if (procesadoResult.rows.length > 0) {
      throw new ErrorCierreAcademico(
        409,
        'Este intento ya tiene una transición aprobada.'
      );
    }

    const descripciones = {
      avance:
        'Avance al siguiente período.',
      avance_con_tutorias:
        'Avance al siguiente período con tutorías.',
      repeticion:
        'Repetición del período actual.',
      recuperacion_final:
        'Continuidad en el período 6 para completar pendientes.',
      culminacion:
        'Cumple los requisitos para culminar los estudios.',
    };

    const observaciones =
      descripciones[
        evaluacion.tipo_transicion
      ];

    const cupoResult = await client.query(
      `
        INSERT INTO cupos (
          estudiante_id,
          intento_origen_id,
          periodo_origen,
          periodo_destino,
          tipo_transicion,
          estado,
          pagos_solvencia,
          materias_aprobadas,
          promedio_general,
          observaciones
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::integer,
          $4::integer,
          $5::varchar,
          'pendiente',
          true,
          $6::boolean,
          $7::numeric,
          $8::text
        )
        ON CONFLICT (intento_origen_id)
        WHERE estado = 'pendiente'
        DO UPDATE SET
          periodo_destino =
            EXCLUDED.periodo_destino,
          tipo_transicion =
            EXCLUDED.tipo_transicion,
          pagos_solvencia =
            EXCLUDED.pagos_solvencia,
          materias_aprobadas =
            EXCLUDED.materias_aprobadas,
          promedio_general =
            EXCLUDED.promedio_general,
          observaciones =
            EXCLUDED.observaciones
        RETURNING *
      `,
      [
        estudianteId,
        evaluacion.intento_origen_id,
        evaluacion.periodo_origen,
        evaluacion.periodo_destino,
        evaluacion.tipo_transicion,
        evaluacion.materias_numericas_aprobadas,
        evaluacion.promedio_general,
        observaciones,
      ]
    );

    const cupo = cupoResult.rows[0];

    await client.query(
      `
        INSERT INTO auditoria (
          tabla_afectada,
          accion,
          usuario_id,
          datos_nuevos
        )
        VALUES (
          'cupos',
          'UPDATE',
          $1,
          $2
        )
      `,
      [
        actor.userId,
        JSON.stringify({
          cupo_id: cupo.id,
          ...evaluacion,
          resumen:
            'Cierre evaluado y cupo pendiente preparado. ' +
            observaciones,
        }),
      ]
    );

    await client.query('COMMIT');
    transaccionAbierta = false;

    return NextResponse.json({
      success: true,
      message:
        observaciones +
        ' Se preparó la solicitud pendiente en Cupos. ' +
        'El estudiante todavía no cambió de intento.',
      data: {
        cupo,
        periodo_destino:
          evaluacion.periodo_destino,
        tipo_transicion:
          evaluacion.tipo_transicion,
        promedio_general:
          evaluacion.promedio_general,
      },
      evaluacion,
    });
  } catch (error: unknown) {
    if (
      client &&
      transaccionAbierta
    ) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(
          'Error revirtiendo preparación de cierre:',
          rollbackError
        );
      }
    }

    if (
      error instanceof ErrorCierreAcademico
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error(
      'Error preparando cierre académico:',
      error
    );

    return NextResponse.json(
      {
        error:
          'No se pudo preparar el cierre. Revise la terminal.',
      },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}