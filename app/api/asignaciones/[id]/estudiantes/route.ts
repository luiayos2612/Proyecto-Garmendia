import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

import { verifyToken } from '@/lib/auth';
import { tipoEvaluacionMateria } from '@/lib/evaluacionMaterias';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
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

  if (
    !['director', 'secretaria', 'docente'].includes(
      actor.rol
    )
  ) {
    return NextResponse.json(
      { error: 'No tiene permisos para consultar esta asignación.' },
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

  const { id: asignacionId } = await params;

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      asignacionId
    )
  ) {
    return NextResponse.json(
      { error: 'Identificador de asignación inválido.' },
      { status: 400 }
    );
  }

  try {
    const asignacionResult = await pool.query(
      `
        SELECT
          a.id,
          a.docente_id,
          a.materia_id,
          a.periodo_id,
          a.ano_escolar,
          a.activa,
          d.activo AS docente_activo,
          d.apellidos || ' ' || d.nombres
            AS docente_nombre,
          m.nombre AS materia_nombre,
          m.codigo AS materia_codigo,
          m.activa AS materia_activa
        FROM asignaciones_docentes a
        JOIN docentes d
          ON d.id = a.docente_id
        JOIN materias m
          ON m.id = a.materia_id
        WHERE a.id = $1::uuid
      `,
      [asignacionId]
    );

    if (asignacionResult.rows.length !== 1) {
      return NextResponse.json(
        { error: 'Asignación no encontrada.' },
        { status: 404 }
      );
    }

    const asignacion =
      asignacionResult.rows[0];

    if (
      asignacion.activa !== true ||
      asignacion.docente_activo !== true ||
      asignacion.materia_activa !== true
    ) {
      return NextResponse.json(
        {
          error:
            'La asignación, el profesor y la materia deben estar activos.',
        },
        { status: 409 }
      );
    }

    if (
      actor.rol === 'docente' &&
      asignacion.docente_id !==
        actor.docenteId?.toLowerCase()
    ) {
      return NextResponse.json(
        {
          error:
            'No tiene permiso para consultar una asignación de otro docente.',
        },
        { status: 403 }
      );
    }

    const estudiantesResult = await pool.query(
      `
        SELECT
          e.id,
          e.apellidos,
          e.nombres,
          e.cedula,

          im.id AS inscripcion_id,
          im.intento_id,
          im.tipo_inscripcion,
          im.tutoria_id,
          t.estado AS estado_tutoria,

          ia.numero_intento,
          ia.periodo_id,
          ia.ano_escolar,

          origen.periodo_id AS periodo_origen_tutoria,
          origen.numero_intento AS intento_origen_tutoria,

          c.id AS calificacion_id,
          c.docente_id AS docente_calificacion_id,
          c.nota AS nota_existente,
          c.resultado_cualitativo
            AS resultado_cualitativo_existente,
          c.observaciones
            AS observaciones_existentes

        FROM inscripciones_materias im

        JOIN estudiantes e
          ON e.id = im.estudiante_id

        JOIN intentos_academicos ia
          ON ia.id = im.intento_id

        LEFT JOIN tutorias_academicas t
          ON t.id = im.tutoria_id

        LEFT JOIN intentos_academicos origen
          ON origen.id = t.intento_origen_id

        LEFT JOIN calificaciones c
          ON c.inscripcion_id = im.id

        WHERE im.materia_id = $1::uuid
          AND im.periodo_id = $2::integer
          AND im.ano_escolar = $3::varchar
          AND ia.ano_escolar = $3::varchar
          AND ia.estado = 'en_curso'
          AND im.activa = true
          AND e.activo = true
          AND e.periodo_id = ia.periodo_id

        ORDER BY
          e.apellidos,
          e.nombres,
          im.tipo_inscripcion,
          im.id
      `,
      [
        asignacion.materia_id,
        asignacion.periodo_id,
        asignacion.ano_escolar,
      ]
    );

    const estudiantes =
      estudiantesResult.rows.map((fila) => {
        const notaDeOtroDocente =
          actor.rol === 'docente' &&
          fila.docente_calificacion_id != null &&
          fila.docente_calificacion_id !==
            actor.docenteId?.toLowerCase();

        const tutoriaAprobada =
          fila.tipo_inscripcion === 'tutoria' &&
          fila.estado_tutoria === 'aprobada';

        return {
          ...fila,

          puede_calificar:
            !notaDeOtroDocente &&
            !tutoriaAprobada,

          motivo_bloqueo: tutoriaAprobada
            ? 'Tutoría aprobada. Su resultado final ya fue aplicado a la materia de origen.'
            : notaDeOtroDocente
              ? 'La nota fue registrada por otro docente; administración debe revisar su corrección.'
              : null,
        };
      });

    return NextResponse.json(
      {
        asignacion: {
          ...asignacion,
          tipo_evaluacion:
            tipoEvaluacionMateria(
              asignacion.materia_nombre
            ),
        },
        estudiantes,
        total: estudiantes.length,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error(
      'Error GET alumnos por inscripción:',
      error
    );

    return NextResponse.json(
      {
        error:
          'No se pudieron cargar las inscripciones de la asignación.',
      },
      { status: 500 }
    );
  }
}