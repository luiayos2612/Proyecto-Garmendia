import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim() ?? '';

    if (q.length < 2) {
      return NextResponse.json({
        estudiantes: [],
        docentes: [],
        materias: [],
        asignaciones: [],
        pagos: [],
        calificaciones: [],
      });
    }

    const termino = `%${q}%`;

    const [
      estudiantesResult,
      docentesResult,
      materiasResult,
      asignacionesResult,
      pagosResult,
      calificacionesResult,
    ] = await Promise.all([
      pool.query(
        `
          SELECT
            id,
            nombres || ' ' || apellidos AS nombre,
            cedula,
            email
          FROM estudiantes
          WHERE
            nombres ILIKE $1
            OR apellidos ILIKE $1
            OR cedula ILIKE $1
            OR cedula_escolar ILIKE $1
            OR email ILIKE $1
          ORDER BY nombres, apellidos
          LIMIT 5
        `,
        [termino]
      ),

      pool.query(
        `
          SELECT
            id,
            nombres || ' ' || apellidos AS nombre,
            cedula,
            email,
            especialidad
          FROM docentes
          WHERE
            nombres ILIKE $1
            OR apellidos ILIKE $1
            OR cedula ILIKE $1
            OR email ILIKE $1
            OR especialidad ILIKE $1
          ORDER BY nombres, apellidos
          LIMIT 5
        `,
        [termino]
      ),

      pool.query(
        `
          SELECT
            id,
            nombre,
            codigo,
            descripcion
          FROM materias
          WHERE
            nombre ILIKE $1
            OR codigo ILIKE $1
            OR descripcion ILIKE $1
          ORDER BY nombre
          LIMIT 5
        `,
        [termino]
      ),

      pool.query(
        `
          SELECT
            ad.id,
            d.nombres || ' ' || d.apellidos AS docente,
            m.nombre AS materia,
            ad.ano_escolar,
            ad.activa
          FROM asignaciones_docentes ad
          INNER JOIN docentes d ON d.id = ad.docente_id
          INNER JOIN materias m ON m.id = ad.materia_id
          WHERE
            d.nombres ILIKE $1
            OR d.apellidos ILIKE $1
            OR m.nombre ILIKE $1
            OR m.codigo ILIKE $1
            OR ad.ano_escolar ILIKE $1
          ORDER BY ad.created_at DESC
          LIMIT 5
        `,
        [termino]
      ),

      pool.query(
        `
          SELECT
            p.id,
            p.referencia,
            p.concepto,
            p.monto,
            p.estado,
            p.fecha_pago,
            e.nombres || ' ' || e.apellidos AS estudiante
          FROM pagos p
          INNER JOIN estudiantes e ON e.id = p.estudiante_id
          WHERE
            p.referencia ILIKE $1
            OR p.concepto ILIKE $1
            OR p.estado ILIKE $1
            OR CAST(p.monto AS TEXT) ILIKE $1
            OR e.nombres ILIKE $1
            OR e.apellidos ILIKE $1
            OR e.cedula ILIKE $1
          ORDER BY p.fecha_pago DESC, p.created_at DESC
          LIMIT 5
        `,
        [termino]
      ),

      pool.query(
        `
          SELECT
            c.id,
            c.nota,
            c.fecha_cierre,
            e.nombres || ' ' || e.apellidos AS estudiante,
            m.nombre AS materia,
            d.nombres || ' ' || d.apellidos AS docente
          FROM calificaciones c
          INNER JOIN estudiantes e ON e.id = c.estudiante_id
          INNER JOIN materias m ON m.id = c.materia_id
          INNER JOIN docentes d ON d.id = c.docente_id
          WHERE
            e.nombres ILIKE $1
            OR e.apellidos ILIKE $1
            OR e.cedula ILIKE $1
            OR m.nombre ILIKE $1
            OR m.codigo ILIKE $1
            OR d.nombres ILIKE $1
            OR d.apellidos ILIKE $1
            OR CAST(c.nota AS TEXT) ILIKE $1
          ORDER BY c.fecha_cierre DESC
          LIMIT 5
        `,
        [termino]
      ),
    ]);

    return NextResponse.json({
      estudiantes: estudiantesResult.rows,
      docentes: docentesResult.rows,
      materias: materiasResult.rows,
      asignaciones: asignacionesResult.rows,
      pagos: pagosResult.rows,
      calificaciones: calificacionesResult.rows,
    });
  } catch (error) {
    console.error('Error en búsqueda global:', error);

    return NextResponse.json(
      {
        error: 'No se pudo realizar la búsqueda.',
        estudiantes: [],
        docentes: [],
        materias: [],
        asignaciones: [],
        pagos: [],
        calificaciones: [],
      },
      { status: 500 }
    );
  }
}