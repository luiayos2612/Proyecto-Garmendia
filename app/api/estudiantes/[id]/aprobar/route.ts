import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { verifyToken } from '@/lib/auth';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);

  if (!actor) {
    return NextResponse.json(
      { error: 'No autorizado.' },
      { status: 401 }
    );
  }

  if (actor.rol !== 'director') {
    return NextResponse.json(
      { error: 'Solo el director puede aprobar el siguiente período.' },
      { status: 403 }
    );
  }

  const { id: estudianteId } = await params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const estudianteResult = await client.query(
      `
        SELECT
          id,
          nombres,
          apellidos,
          periodo_id,
          activo,
          estado
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

    const estudiante = estudianteResult.rows[0];
    const periodoActual = Number(estudiante.periodo_id);

    if (!periodoActual) {
      await client.query('ROLLBACK');

      return NextResponse.json(
        { error: 'El estudiante no tiene un período académico asignado.' },
        { status: 400 }
      );
    }

    if (periodoActual >= 6) {
      await client.query('ROLLBACK');

      return NextResponse.json(
        { error: 'El estudiante ya se encuentra en el último período.' },
        { status: 400 }
      );
    }

    const cupoExistente = await client.query(
      `
        SELECT id
        FROM cupos
        WHERE estudiante_id = $1
          AND periodo_destino = $2
          AND estado = 'pendiente'
        LIMIT 1
      `,
      [estudianteId, periodoActual + 1]
    );

    if (cupoExistente.rows.length > 0) {
      await client.query('ROLLBACK');

      return NextResponse.json(
        {
          error: `Ya existe un cupo pendiente para el Período ${
            periodoActual + 1
          }.`,
        },
        { status: 400 }
      );
    }

    /*
      REGLA FINANCIERA ÚNICA:
      aprobar solo cuando la deuda total sea cero.

      Se calcula con cuotas pendientes o vencidas.
      Los pagos individuales y la cantidad de mensualidades
      NO intervienen en esta decisión.
    */
    const deudaResult = await client.query(
      `
        SELECT
          COALESCE(
            SUM(monto) FILTER (
              WHERE estado IN ('pendiente', 'vencida')
            ),
            0
          ) AS deuda_total
        FROM cuotas
        WHERE estudiante_id = $1
      `,
      [estudianteId]
    );

    const deudaTotal = Number(deudaResult.rows[0]?.deuda_total ?? 0);

    if (deudaTotal > 0) {
      await client.query('ROLLBACK');

      return NextResponse.json(
        {
          error: `El estudiante posee una deuda pendiente de ${deudaTotal.toFixed(
            2
          )}. Debe estar solvente para aprobar el período.`,
          requisitos: {
            deuda_total: deudaTotal,
          },
        },
        { status: 400 }
      );
    }

    /*
      REGLA ACADÉMICA:
      todas las materias inscritas y activas del período actual
      deben tener una nota >= 3.00.
    */
    const materiasPendientesResult = await client.query(
      `
        SELECT
          m.nombre,
          m.codigo,
          c.nota
        FROM inscripciones_materias im
        INNER JOIN materias m
          ON m.id = im.materia_id
        LEFT JOIN calificaciones c
          ON c.estudiante_id = im.estudiante_id
          AND c.materia_id = im.materia_id
          AND c.asignacion_id IN (
            SELECT ad.id
            FROM asignaciones_docentes ad
            WHERE ad.periodo_id = im.periodo_id
              AND ad.materia_id = im.materia_id
          )
        WHERE im.estudiante_id = $1
          AND im.periodo_id = $2
          AND im.activa = true
          AND (c.nota IS NULL OR c.nota < 3)
        ORDER BY m.nombre
      `,
      [estudianteId, periodoActual]
    );

    if (materiasPendientesResult.rows.length > 0) {
      await client.query('ROLLBACK');

      const materias = materiasPendientesResult.rows.map((materia) => ({
        nombre: materia.nombre,
        codigo: materia.codigo,
        nota: materia.nota === null ? null : Number(materia.nota),
      }));

      return NextResponse.json(
        {
          error:
            'El estudiante debe tener nota mínima de 3.00 en todas las materias del período.',
          requisitos: {
            deuda_total: deudaTotal,
            materias_pendientes: materias,
          },
        },
        { status: 400 }
      );
    }

    const promedioResult = await client.query(
      `
        SELECT COALESCE(ROUND(AVG(c.nota), 2), 0) AS promedio_general
        FROM calificaciones c
        INNER JOIN asignaciones_docentes ad
          ON ad.id = c.asignacion_id
        WHERE c.estudiante_id = $1
          AND ad.periodo_id = $2
      `,
      [estudianteId, periodoActual]
    );

    const promedioGeneral = Number(
      promedioResult.rows[0]?.promedio_general ?? 0
    );

    const crearCupo = await client.query(
      `
        INSERT INTO cupos (
          estudiante_id,
          periodo_origen,
          periodo_destino,
          estado,
          pagos_solvencia,
          materias_aprobadas,
          promedio_general,
          observaciones
        )
        VALUES ($1, $2, $3, 'pendiente', true, true, $4, $5)
        RETURNING *
      `,
      [
        estudianteId,
        periodoActual,
        periodoActual + 1,
        promedioGeneral,
        `Aprobado académica y financieramente. Deuda total: ${deudaTotal.toFixed(
          2
        )}.`,
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
        VALUES ('cupos', 'INSERT', $1, $2)
      `,
      [
        actor.userId,
        JSON.stringify({
          cupo: crearCupo.rows[0],
          estudiante_id: estudianteId,
          periodo_origen: periodoActual,
          periodo_destino: periodoActual + 1,
          deuda_total: deudaTotal,
          promedio_general: promedioGeneral,
          regla_nota_minima: 3,
          resumen: `Solicitud de cupo creada para Período ${
            periodoActual + 1
          }. Deuda total: ${deudaTotal.toFixed(
            2
          )}. Nota mínima aplicada: 3.00.`,
        }),
      ]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      message: `El estudiante cumple los requisitos. Se creó el cupo pendiente para el Período ${
        periodoActual + 1
      }.`,
      data: {
        cupo: crearCupo.rows[0],
        periodo_destino: periodoActual + 1,
        deuda_total: deudaTotal,
        promedio_general: promedioGeneral,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');

    console.error('Error aprobando período:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo aprobar el período.',
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}