import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { verifyToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 8000,
  query_timeout: 10000,
});

export async function GET(request: NextRequest) {
  const actor = verifyToken(
    request.cookies.get('token')?.value ?? ''
  );

  if (!actor) {
    return NextResponse.json(
      { error: 'Debe iniciar sesión.' },
      { status: 401 }
    );
  }

  try {
    /*
     * Comprobar que la cuenta siga activa y utilizar
     * su rol actual, no solamente el contenido del JWT.
     */
    const usuarioResult = await pool.query(
      `
        SELECT id, rol
        FROM usuarios
        WHERE id = $1::uuid
          AND activo = true
      `,
      [actor.userId]
    );

    const usuario = usuarioResult.rows[0];

    if (!usuario) {
      return NextResponse.json(
        { error: 'La cuenta no está activa.' },
        { status: 401 }
      );
    }

    if (
      !['director', 'secretaria', 'docente'].includes(
        usuario.rol
      )
    ) {
      return NextResponse.json(
        { error: 'No tiene permisos para consultar el dashboard.' },
        { status: 403 }
      );
    }

    const esDocente = usuario.rol === 'docente';

    let docenteId: string | null = null;

    if (esDocente) {
      const docenteResult = await pool.query(
        `
          SELECT id
          FROM docentes
          WHERE usuario_id = $1::uuid
            AND activo = true
        `,
        [actor.userId]
      );

      if (docenteResult.rows.length !== 1) {
        return NextResponse.json(
          {
            error:
              'No existe un único perfil docente activo vinculado a esta cuenta.',
          },
          { status: 403 }
        );
      }

      docenteId = docenteResult.rows[0].id;
    }

    /*
     * Estudiantes:
     * - Administración: estudiantes activos.
     * - Docente: estudiantes activos de sus asignaciones
     *   vigentes, con inscripción del intento en curso.
     *
     * Promedio:
     * - Solo notas numéricas de inscripciones regulares
     *   activas, dentro de intentos en curso.
     * - No incluye tutorías ni AP/IN.
     * - Para el docente, solo notas registradas por él
     *   en sus asignaciones actualmente vigentes.
     */
    const resultado = await pool.query(
      `
        WITH estudiantes_visibles AS (
          SELECT e.id
          FROM estudiantes e
          WHERE e.activo = true
            AND (
              $1::uuid IS NULL

              OR EXISTS (
                SELECT 1
                FROM inscripciones_materias im

                JOIN intentos_academicos ia
                  ON ia.id = im.intento_id
                  AND ia.estudiante_id = im.estudiante_id

                JOIN asignaciones_docentes a
                  ON a.materia_id = im.materia_id
                  AND a.periodo_id = im.periodo_id
                  AND a.ano_escolar = im.ano_escolar
                  AND a.activa = true

                WHERE im.estudiante_id = e.id
                  AND im.activa = true
                  AND ia.estado = 'en_curso'
                  AND a.docente_id = $1::uuid
              )
            )
        ),

        notas_vigentes AS (
          SELECT c.nota

          FROM calificaciones c

          JOIN inscripciones_materias im
            ON im.id = c.inscripcion_id
            AND im.estudiante_id = c.estudiante_id
            AND im.materia_id = c.materia_id

          JOIN intentos_academicos ia
            ON ia.id = im.intento_id
            AND ia.estudiante_id = im.estudiante_id

          JOIN estudiantes_visibles ev
            ON ev.id = c.estudiante_id

          WHERE im.activa = true
            AND im.tipo_inscripcion = 'regular'
            AND ia.estado = 'en_curso'
            AND c.nota IS NOT NULL
            AND c.nota BETWEEN 1 AND 5

            AND (
              $1::uuid IS NULL

              OR (
                c.docente_id = $1::uuid

                AND EXISTS (
                  SELECT 1
                  FROM asignaciones_docentes a
                  WHERE a.id = c.asignacion_id
                    AND a.docente_id = $1::uuid
                    AND a.activa = true
                    AND a.materia_id = im.materia_id
                    AND a.periodo_id = im.periodo_id
                    AND a.ano_escolar = im.ano_escolar
                )
              )
            )
        )

        SELECT
          (
            SELECT COUNT(*)
            FROM estudiantes_visibles
          ) AS total_estudiantes,

          (
            SELECT COUNT(*)
            FROM docentes
            WHERE activo = true
              AND (
                $1::uuid IS NULL
                OR id = $1::uuid
              )
          ) AS total_docentes,

          (
            SELECT AVG(nota)
            FROM notas_vigentes
          ) AS promedio_general,

          (
            SELECT COUNT(*)
            FROM notas_vigentes
          ) AS total_notas,

          (
            SELECT COUNT(*)
            FROM asignaciones_docentes a
            JOIN docentes d
              ON d.id = a.docente_id
              AND d.activo = true
            JOIN materias m
              ON m.id = a.materia_id
              AND m.activa = true
            WHERE a.activa = true
              AND (
                $1::uuid IS NULL
                OR a.docente_id = $1::uuid
              )
          ) AS total_asignaciones
      `,
      [docenteId]
    );

    const fila = resultado.rows[0];

    return NextResponse.json(
      {
        totalEstudiantes: Number(
          fila.total_estudiantes
        ),
        totalDocentes: Number(
          fila.total_docentes
        ),
        promedioGeneral:
          fila.promedio_general === null
            ? null
            : Number(
                Number(
                  fila.promedio_general
                ).toFixed(2)
              ),
        totalNotas: Number(fila.total_notas),
        totalAsignaciones: Number(
          fila.total_asignaciones
        ),
        alcance: esDocente
          ? 'docente'
          : 'administracion',
        actualizadoEn: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control':
            'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Error al consultar dashboard:', error);

    return NextResponse.json(
      {
        error:
          'No se pudieron consultar los indicadores. Revise la conexión y los registros del servidor.',
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}