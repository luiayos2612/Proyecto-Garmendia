import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { verifyToken } from '@/lib/auth';
import {
  ErrorTutoria,
  procesarResultadoTutoria,
} from '@/lib/tutoriasAcademicas';
import {
  tipoEvaluacionMateria,
  validarResultadoMateria,
} from '@/lib/evaluacionMaterias';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(request: NextRequest) {
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);
  if (!actor) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (actor.rol === 'docente' && !actor.docenteId) {
    return NextResponse.json({ error: 'Perfil de docente no vinculado' }, { status: 403 });
  }

  try {
    const { searchParams } = request.nextUrl;
    const periodoId = searchParams.get('periodo_id');
    const materiaId = searchParams.get('materia_id');

    const docenteId = actor.rol === 'docente' ? actor.docenteId : searchParams.get('docente_id');

    const filters: string[] = ['1=1'];
    const values: Array<string | number> = [];

    if (periodoId) {
      values.push(Number(periodoId));
      filters.push(`a.periodo_id = $${values.length}`);
    }

    if (docenteId) {
      values.push(docenteId);
      filters.push(`c.docente_id = $${values.length}`);
    }

    if (materiaId) {
      values.push(materiaId);
      filters.push(`c.materia_id = $${values.length}`);
    }

    const whereClause = filters.join(' AND ');

    const calificacionesResult = await pool.query(
      `SELECT
        c.id,
        e.apellidos || ' ' || e.nombres AS estudiante,
        e.id AS estudiante_id,
        m.nombre AS materia,
        m.codigo AS materia_codigo,
        d.apellidos || ' ' || d.nombres AS docente,
        c.nota AS nota_original,
        COALESCE(
          recuperacion.nota_final,
          c.nota
        ) AS nota,
        (
          recuperacion.id IS NOT NULL
        ) AS recuperada_por_tutoria,
        c.resultado_cualitativo,
        a.periodo_id,
        p.nombre as periodo_nombre,
        c.observaciones,
        c.fecha_cierre as fecha_registro
      FROM calificaciones c
      JOIN estudiantes e ON c.estudiante_id = e.id
      JOIN materias m ON c.materia_id = m.id
      JOIN docentes d ON c.docente_id = d.id
      JOIN asignaciones_docentes a ON c.asignacion_id = a.id
      JOIN periodos p ON a.periodo_id = p.numero
      LEFT JOIN tutorias_academicas recuperacion
        ON recuperacion.inscripcion_origen_id =
          c.inscripcion_id
      AND recuperacion.estado = 'aprobada'
      WHERE ${whereClause}
      ORDER BY a.periodo_id, e.apellidos, e.nombres, m.nombre`,
      values
    );

    const statsResult = await pool.query(
      `SELECT a.periodo_id, p.nombre, COUNT(*) AS total
      FROM calificaciones c
      JOIN asignaciones_docentes a ON c.asignacion_id = a.id
      JOIN periodos p ON a.periodo_id = p.numero

      WHERE ${whereClause}
      GROUP BY a.periodo_id, p.nombre
      ORDER BY a.periodo_id`,
      values
    );

    return NextResponse.json({
      calificaciones: calificacionesResult.rows.map((fila) => ({
          ...fila,
          tipo_evaluacion: tipoEvaluacionMateria(fila.materia),
        })),
      stats: statsResult.rows.map((row) => ({
        periodo_id: row.periodo_id,
        periodo_nombre: row.nombre,
        total: String(row.total),
      })),
    });
  } catch (error) {
    console.error('Error GET calificaciones:', error);
    return NextResponse.json({ error: 'Error al cargar calificaciones' }, { status: 500 });
  }
}

async function validarAsignacionParaActor(
  client: any,
  asignacionId: string,
  actor: { rol: string; docenteId?: string }
): Promise<{ ok: true; asignacion: any } | { ok: false; response: NextResponse }> {
  const asigRes = await client.query(
    `
      SELECT
        a.docente_id,
        a.materia_id,
        a.periodo_id,
        m.nombre AS materia_nombre
      FROM asignaciones_docentes a
      JOIN materias m ON m.id = a.materia_id
      WHERE a.id = $1
    `,
    [asignacionId]
  );

  if (asigRes.rows.length === 0) {
    return { ok: false, response: NextResponse.json({ error: 'Asignación no encontrada' }, { status: 404 }) };
  }

  const asignacion = asigRes.rows[0];

  if (actor.rol === 'docente' && asignacion.docente_id !== actor.docenteId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'No puede calificar una asignación que no le pertenece' },
        { status: 403 }
      ),
    };
  }

  return { ok: true, asignacion };
}

async function estudianteInscrito(client: any, estudianteId: string, materiaId: string, periodoId: number) {
  const res = await client.query(
    `SELECT 1 FROM inscripciones_materias
     WHERE estudiante_id = $1 AND materia_id = $2 AND periodo_id = $3 AND activa = true`,
    [estudianteId, materiaId, periodoId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function POST(request: NextRequest) {
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
    !['director', 'secretaria', 'docente'].includes(
      actor.rol
    )
  ) {
    return NextResponse.json(
      { error: 'No tiene permisos para registrar calificaciones.' },
      { status: 403 }
    );
  }

  if (
    actor.rol === 'docente' &&
    !actor.docenteId
  ) {
    return NextResponse.json(
      { error: 'El usuario no tiene un perfil docente vinculado.' },
      { status: 403 }
    );
  }

  class ErrorCalificacion extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  }

  const esUuid = (
    valor: unknown
  ): valor is string =>
    typeof valor === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      valor
    );

  interface EntradaCalificacion {
    estudiante_id: string;
    inscripcion_id?: string;
    nota: unknown;
    resultado_cualitativo: unknown;
    observaciones: string;
  }

  let client: import('pg').PoolClient | undefined;
  let transaccionAbierta = false;

  try {
    let recibido: unknown;

    try {
      recibido = await request.json();
    } catch {
      throw new ErrorCalificacion(
        400,
        'La solicitud no contiene un JSON válido.'
      );
    }

    if (
      typeof recibido !== 'object' ||
      recibido === null ||
      Array.isArray(recibido)
    ) {
      throw new ErrorCalificacion(
        400,
        'La solicitud no tiene un formato válido.'
      );
    }

    const body = recibido as Record<string, unknown>;

    if (!esUuid(body.asignacion_id)) {
      throw new ErrorCalificacion(
        400,
        'Seleccione una asignación válida.'
      );
    }

    const asignacionId =
      body.asignacion_id.toLowerCase();

    // Se mantienen ambos formatos:
    // carga de un grupo y carga individual.
    const entradasRecibidas: unknown[] =
      body.calificaciones === undefined
        ? [body]
        : Array.isArray(body.calificaciones)
          ? body.calificaciones
          : [];

    if (
      entradasRecibidas.length === 0 ||
      entradasRecibidas.length > 300
    ) {
      throw new ErrorCalificacion(
        400,
        'La solicitud debe contener entre 1 y 300 calificaciones.'
      );
    }

    const entradas: EntradaCalificacion[] =
      entradasRecibidas.map((entrada) => {
        if (
          typeof entrada !== 'object' ||
          entrada === null ||
          Array.isArray(entrada)
        ) {
          throw new ErrorCalificacion(
            400,
            'Existe una calificación con formato inválido.'
          );
        }

        const item =
          entrada as Record<string, unknown>;

        if (!esUuid(item.estudiante_id)) {
          throw new ErrorCalificacion(
            400,
            'Existe un identificador de estudiante inválido.'
          );
        }

        if (
          item.inscripcion_id !== undefined &&
          !esUuid(item.inscripcion_id)
        ) {
          throw new ErrorCalificacion(
            400,
            'Existe un identificador de inscripción inválido.'
          );
        }

        if (
          item.observaciones != null &&
          typeof item.observaciones !== 'string'
        ) {
          throw new ErrorCalificacion(
            400,
            'Las observaciones deben ser texto.'
          );
        }

        return {
          estudiante_id:
            item.estudiante_id.toLowerCase(),

          inscripcion_id:
            typeof item.inscripcion_id === 'string'
              ? item.inscripcion_id.toLowerCase()
              : undefined,

          nota: item.nota,

          resultado_cualitativo:
            item.resultado_cualitativo,

          observaciones:
            typeof item.observaciones === 'string'
              ? item.observaciones
              : '',
        };
      });

    client = await pool.connect();

    await client.query('BEGIN');
    transaccionAbierta = true;

    await client.query(
      "SET LOCAL TIME ZONE 'America/Caracas'"
    );

    // Bloquear alumnos en un orden estable.
    const estudiantesIds = Array.from(
      new Set(
        entradas.map(
          (entrada) => entrada.estudiante_id
        )
      )
    ).sort();

    const estudiantesResult = await client.query(
      `
        SELECT id, activo, periodo_id
        FROM estudiantes
        WHERE id = ANY($1::uuid[])
        ORDER BY id
        FOR UPDATE
      `,
      [estudiantesIds]
    );

    if (
      estudiantesResult.rows.length !==
      estudiantesIds.length
    ) {
      throw new ErrorCalificacion(
        404,
        'Uno o más estudiantes no existen.'
      );
    }

    if (
      estudiantesResult.rows.some(
        (estudiante) =>
          estudiante.activo !== true
      )
    ) {
      throw new ErrorCalificacion(
        409,
        'No se pueden cargar notas a estudiantes inactivos.'
      );
    }

    const asignacionResult = await client.query(
      `
        SELECT
          a.id,
          a.docente_id,
          a.materia_id,
          a.periodo_id,
          a.ano_escolar,
          a.activa,
          d.activo AS docente_activo,
          m.nombre AS materia_nombre,
          m.activa AS materia_activa
        FROM asignaciones_docentes a
        JOIN docentes d
          ON d.id = a.docente_id
        JOIN materias m
          ON m.id = a.materia_id
        WHERE a.id = $1::uuid
        FOR SHARE OF a, d, m
      `,
      [asignacionId]
    );

    if (asignacionResult.rows.length !== 1) {
      throw new ErrorCalificacion(
        404,
        'La asignación no existe o está incompleta.'
      );
    }

    const asignacion =
      asignacionResult.rows[0];

    if (
      asignacion.activa !== true ||
      asignacion.docente_activo !== true ||
      asignacion.materia_activa !== true
    ) {
      throw new ErrorCalificacion(
        409,
        'La asignación, el profesor y la materia deben estar activos.'
      );
    }

    if (
      actor.rol === 'docente' &&
      asignacion.docente_id !==
        actor.docenteId?.toLowerCase()
    ) {
      throw new ErrorCalificacion(
        403,
        'No puede calificar una asignación de otro docente.'
      );
    }

    const inscripcionesProcesadas =
      new Set<string>();

    const resultados = [];

    for (const entrada of entradas) {
      const resultadoValidado =
        validarResultadoMateria(
          asignacion.materia_nombre,
          entrada.nota,
          entrada.resultado_cualitativo
        );

      if (!resultadoValidado.ok) {
        throw new ErrorCalificacion(
          400,
          `Estudiante ${entrada.estudiante_id}: ` +
            resultadoValidado.error
        );
      }

      const inscripcionResult =
        await client.query(
          `
            SELECT
              im.id,
              im.estudiante_id,
              im.materia_id,
              im.periodo_id,
              im.intento_id,
              im.tipo_inscripcion,
              im.tutoria_id,
              ia.numero_intento
            FROM inscripciones_materias im
            JOIN intentos_academicos ia
              ON ia.id = im.intento_id
            WHERE im.estudiante_id = $1::uuid
              AND im.materia_id = $2::uuid
              AND im.periodo_id = $3::integer
              AND im.ano_escolar = $4::varchar
              AND ia.ano_escolar = $4::varchar
              AND ia.estado = 'en_curso'
              AND im.activa = true
              AND (
                $5::uuid IS NULL
                OR im.id = $5::uuid
              )
            FOR UPDATE OF im, ia
          `,
          [
            entrada.estudiante_id,
            asignacion.materia_id,
            asignacion.periodo_id,
            asignacion.ano_escolar,
            entrada.inscripcion_id ?? null,
          ]
        );

      if (inscripcionResult.rows.length === 0) {
        throw new ErrorCalificacion(
          409,
          'No existe una inscripción activa del intento abierto ' +
            'compatible con esta materia, período y año escolar. ' +
            `Estudiante: ${entrada.estudiante_id}.`
        );
      }

      if (inscripcionResult.rows.length > 1) {
        throw new ErrorCalificacion(
          409,
          'El estudiante tiene varias inscripciones compatibles. ' +
            'Debe enviarse inscripcion_id para distinguir la materia regular de la tutoría.'
        );
      }

      const inscripcion =
        inscripcionResult.rows[0];

      const estudiante =
        estudiantesResult.rows.find(
          (fila) =>
            fila.id === entrada.estudiante_id
        );

      if (
        !estudiante ||
        Number(estudiante.periodo_id) !==
          Number(inscripcion.periodo_id)
      ) {
        throw new ErrorCalificacion(
          409,
          'El período del estudiante no coincide con la inscripción.'
        );
      }

      

      if (
        inscripcionesProcesadas.has(
          inscripcion.id
        )
      ) {
        throw new ErrorCalificacion(
          400,
          'La misma inscripción aparece más de una vez en la solicitud.'
        );
      }

      inscripcionesProcesadas.add(
        inscripcion.id
      );

      const existenteResult =
        await client.query(
          `
            SELECT *
            FROM calificaciones
            WHERE inscripcion_id = $1::uuid
            FOR UPDATE
          `,
          [inscripcion.id]
        );

      const existente =
        existenteResult.rows[0];

      if (
        existente &&
        actor.rol === 'docente' &&
        existente.docente_id !==
          asignacion.docente_id
      ) {
        throw new ErrorCalificacion(
          403,
          'La inscripción ya tiene una nota registrada por otro docente. ' +
            'La corrección debe revisarla administración.'
        );
      }

      const mismoResultado =
        existente &&
        (
          existente.nota == null
            ? resultadoValidado.nota === null
            : resultadoValidado.nota !== null &&
              Number(existente.nota) ===
                resultadoValidado.nota
        ) &&
        (existente.resultado_cualitativo ?? null) ===
          resultadoValidado.resultado_cualitativo &&
        (existente.observaciones ?? '') ===
          entrada.observaciones;

      if (mismoResultado) {
        resultados.push(existente);
        continue;
      }

      const resultadoTutoria =
        inscripcion.tipo_inscripcion === 'tutoria'
          ? await procesarResultadoTutoria(
              client,
              {
                inscripcionId: inscripcion.id,
                estudianteId:
                  entrada.estudiante_id,
                nota: resultadoValidado.nota,
                usuarioId: actor.userId,
              }
            )
          : null;

      const guardadoResult =
        await client.query(
          `
            INSERT INTO calificaciones (
              estudiante_id,
              materia_id,
              docente_id,
              asignacion_id,
              intento_id,
              inscripcion_id,
              nota,
              resultado_cualitativo,
              observaciones
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              $3::uuid,
              $4::uuid,
              $5::uuid,
              $6::uuid,
              $7::numeric,
              $8::varchar,
              $9::text
            )
            ON CONFLICT (inscripcion_id)
            DO UPDATE SET
              docente_id = EXCLUDED.docente_id,
              asignacion_id = EXCLUDED.asignacion_id,
              nota = EXCLUDED.nota,
              resultado_cualitativo =
                EXCLUDED.resultado_cualitativo,
              observaciones = EXCLUDED.observaciones,
              fecha_cierre = CURRENT_TIMESTAMP
            RETURNING *
          `,
          [
            entrada.estudiante_id,
            asignacion.materia_id,
            asignacion.docente_id,
            asignacionId,
            inscripcion.intento_id,
            inscripcion.id,
            resultadoValidado.nota,
            resultadoValidado.resultado_cualitativo,
            entrada.observaciones || null,
          ]
        );

      const guardada =
        guardadoResult.rows[0];

      await client.query(
        `
          INSERT INTO evaluaciones_academicas (
            inscripcion_id,
            asignacion_id,
            nota,
            resultado_cualitativo,
            observaciones,
            tipo_registro,
            usuario_id
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3::numeric,
            $4::varchar,
            $5::text,
            $6::varchar,
            $7::text
          )
        `,
        [
          inscripcion.id,
          asignacionId,
          resultadoValidado.nota,
          resultadoValidado.resultado_cualitativo,
          entrada.observaciones || null,
          existente ? 'correccion' : 'carga',
          actor.userId,
        ]
      );

      await client.query(
        `
          INSERT INTO auditoria (
            tabla_afectada,
            accion,
            usuario_id,
            datos_nuevos
          )
          VALUES (
            'calificaciones',
            $1::varchar,
            $2,
            $3
          )
        `,
        [
          existente ? 'UPDATE' : 'INSERT',
          actor.userId,
          JSON.stringify({
            ...guardada,
            recuperacion: resultadoTutoria,
            resultado_anterior:
              existente
                ? {
                    nota: existente.nota,
                    resultado_cualitativo:
                      existente.resultado_cualitativo,
                    docente_id:
                      existente.docente_id,
                    asignacion_id:
                      existente.asignacion_id,
                  }
                : null,
            numero_intento:
              inscripcion.numero_intento,
            tipo_evaluacion:
              tipoEvaluacionMateria(
                asignacion.materia_nombre
              ),
            resumen:
              `Calificación ${resultadoValidado.texto} ` +
              `registrada en su inscripción e intento.`,
          }),
        ]
      );

      resultados.push(guardada);
    }

    await client.query('COMMIT');
    transaccionAbierta = false;

    return NextResponse.json({
      success: true,
      guardadas: resultados.length,
      calificaciones: resultados,
      calificacion:
        resultados.length === 1
          ? resultados[0]
          : undefined,
    });
  }   catch (error: unknown) {
        if (client && transaccionAbierta) {
          try {
            await client.query('ROLLBACK');
          } catch (rollbackError) {
            console.error(
              'Error revirtiendo calificaciones:',
              rollbackError
            );
          }
        }

        if (error instanceof ErrorTutoria) {
          return NextResponse.json(
            { error: error.message },
            { status: error.status }
          );
        }

        if (error instanceof ErrorCalificacion) {
          return NextResponse.json(
            { error: error.message },
            { status: error.status }
          );
        }

        console.error(
          'Error POST calificaciones por inscripción:',
          error
        );

        return NextResponse.json(
          {
            error:
              'No se pudieron guardar las calificaciones. ' +
              'Revise la terminal.',
          },
          { status: 500 }
        );
      } finally {
        client?.release();
      }
}
