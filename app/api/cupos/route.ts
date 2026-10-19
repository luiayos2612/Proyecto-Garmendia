import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

import { verifyToken } from '@/lib/auth';

import {
  obtenerDetalleCupo,
  ejecutarCupoAcademico,
  ErrorCupoAcademico,
  ErrorCierreAcademico,
} from '@/lib/cuposAcademicos';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const esUuid = (
  valor: unknown
): valor is string =>
  typeof valor === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    valor
  );

export async function GET(
  request: NextRequest
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

  if (
    !['director', 'secretaria'].includes(
      actor.rol
    )
  ) {
    return NextResponse.json(
      { error: 'No tiene permisos para consultar cupos.' },
      { status: 403 }
    );
  }

  let client:
    import('pg').PoolClient | undefined;

  let abierta = false;

  try {
    client = await pool.connect();

    const result = await client.query(
      `
        SELECT
          c.*,
          e.nombres,
          e.apellidos,
          e.cedula,
          origen.nombre AS periodo_origen_nombre
        FROM cupos c
        JOIN estudiantes e
          ON e.id = c.estudiante_id
        LEFT JOIN periodos origen
          ON origen.numero = c.periodo_origen
        WHERE c.estado = 'pendiente'
        ORDER BY c.estudiante_id, c.id
      `
    );

    const cupos = [];

    for (const cupo of result.rows) {
      try {
        await client.query('BEGIN');
        abierta = true;

        await client.query(
          "SET LOCAL TIME ZONE 'America/Caracas'"
        );

        const detalle =
          await obtenerDetalleCupo(
            client,
            cupo
          );

        await client.query('COMMIT');
        abierta = false;

        cupos.push({
          ...cupo,
          periodo_destino:
            detalle.periodo_destino,
          tipo_transicion:
            detalle.tipo_transicion,
          promedio_general:
            detalle.evaluacion.promedio_general,
          detalle,
          error_detalle: null,
        });
      } catch (error: unknown) {
        if (abierta) {
          await client.query('ROLLBACK');
          abierta = false;
        }

        cupos.push({
          ...cupo,
          detalle: null,
          error_detalle:
            error instanceof Error
              ? error.message
              : 'No se pudo evaluar este cupo.',
        });
      }
    }

    return NextResponse.json(
      {
        cupos,
        puede_procesar:
          actor.rol === 'director',
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    if (client && abierta) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(rollbackError);
      }
    }

    console.error('Error GET cupos:', error);

    return NextResponse.json(
      { error: 'No se pudieron cargar los cupos.' },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}

export async function PATCH(
  request: NextRequest
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
      { error: 'Solo el director puede procesar cupos.' },
      { status: 403 }
    );
  }

  let client:
    import('pg').PoolClient | undefined;

  let abierta = false;

  try {
    let body;

    try {
      body = await request.json();
    } catch {
      throw new ErrorCupoAcademico(
        400,
        'JSON no válido.'
      );
    }

    if (
      !esUuid(body?.cupo_id) ||
      !['aprobar', 'rechazar'].includes(
        body?.accion
      )
    ) {
      throw new ErrorCupoAcademico(
        400,
        'Cupo o acción inválidos.'
      );
    }

    client = await pool.connect();

    await client.query('BEGIN');
    abierta = true;

    await client.query(
      "SET LOCAL TIME ZONE 'America/Caracas'"
    );

    let respuesta;

    if (body.accion === 'rechazar') {
      const resultado = await client.query(
        `
          UPDATE cupos
          SET estado = 'rechazado'
          WHERE id = $1::uuid
            AND estado = 'pendiente'
          RETURNING *
        `,
        [body.cupo_id]
      );

      if (resultado.rows.length !== 1) {
        throw new ErrorCupoAcademico(
          409,
          'El cupo no existe o ya fue procesado.'
        );
      }

      await client.query(
        `
          INSERT INTO auditoria (
            tabla_afectada,
            accion,
            usuario_id,
            datos_nuevos
          )
          VALUES ('cupos', 'UPDATE', $1, $2)
        `,
        [
          actor.userId,
          JSON.stringify({
            ...resultado.rows[0],
            resumen:
              'Solicitud rechazada sin cambiar el intento del alumno.',
          }),
        ]
      );

      respuesta = {
        success: true,
        message:
          'Solicitud rechazada. El alumno conserva su intento actual.',
      };
    } else {
      const seleccion =
        body.materias_complementarias ?? [];

      if (
        !Array.isArray(seleccion) ||
        seleccion.length > 2 ||
        seleccion.some(
          (id: unknown) => !esUuid(id)
        ) ||
        typeof body.version_evaluacion !==
          'string'
      ) {
        throw new ErrorCupoAcademico(
          400,
          'La selección o la versión de evaluación no son válidas.'
        );
      }

      respuesta =
        await ejecutarCupoAcademico(
          client,
          {
            cupoId: body.cupo_id,
            usuarioId: actor.userId,
            version:
              body.version_evaluacion,
            complementarias: seleccion,
          }
        );
    }

    await client.query('COMMIT');
    abierta = false;

    return NextResponse.json(respuesta);
  } catch (error: unknown) {
    if (client && abierta) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(rollbackError);
      }
    }

    if (
      error instanceof ErrorCupoAcademico ||
      error instanceof ErrorCierreAcademico
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error('Error PATCH cupos:', error);

    return NextResponse.json(
      {
        error:
          'No se pudo procesar el cupo. Revise la terminal.',
      },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}