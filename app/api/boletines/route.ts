import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// GET /api/boletines?periodo_id=1&search=carlos&page=1&limit=20&ano_escolar=2025-2026
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const periodoId = searchParams.get('periodo_id');
    const search = searchParams.get('search') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const offset = (page - 1) * limit;
    const anoEscolar = searchParams.get('ano_escolar') || '2025-2026';

    // Query principal: Extraer estudiantes Y TODAS sus notas (períodos actuales y anteriores)
    const query = `
      WITH notas_validas AS (
        -- Obtener TODAS las calificaciones válidas del estudiante, sin restricción de período actual
        -- Agrupamos por (estudiante, materia, período) para evitar duplicados
        SELECT
          cal.estudiante_id,
          cal.materia_id,
          MAX(cal.nota) as nota,
          ad.periodo_id,
          m.nombre as materia,
          m.codigo
        FROM calificaciones cal
        JOIN asignaciones_docentes ad ON cal.asignacion_id = ad.id
        JOIN materias m ON cal.materia_id = m.id
        WHERE ad.ano_escolar = $2
          -- NO validamos que periodo_id coincida con e.periodo_id
          -- Permitimos cargar notas de períodos anteriores
          AND ($1::int IS NULL OR ad.periodo_id = $1::int)
        GROUP BY cal.estudiante_id, cal.materia_id, ad.periodo_id, m.nombre, m.codigo
      ),
      estudiantes_filtrados AS (
        -- Obtener estudiantes ACTIVOS que se ajusten a los filtros de búsqueda
        SELECT DISTINCT
          e.id,
          e.cedula,
          e.apellidos,
          e.nombres,
          e.periodo_id,
          p.nombre as periodo_nombre
        FROM estudiantes e
        LEFT JOIN periodos p ON e.periodo_id = p.numero
        WHERE e.activo = true
          AND ($1::int IS NULL OR e.periodo_id = $1::int)
          AND (
            $3 = '' OR
            e.nombres ILIKE '%' || $3 || '%' OR
            e.apellidos ILIKE '%' || $3 || '%' OR
            e.cedula ILIKE '%' || $3 || '%'
          )
        ORDER BY e.apellidos, e.nombres
        LIMIT $4 OFFSET $5
      )
      SELECT
        ef.id,
        ef.cedula,
        ef.apellidos,
        ef.nombres,
        ef.periodo_id,
        ef.periodo_nombre,
        COALESCE(
          json_agg(
            json_build_object(
              'materia_id', nv.materia_id,
              'materia', nv.materia,
              'codigo', nv.codigo,
              'nota', nv.nota,
              'tiene_nota', nv.nota IS NOT NULL,
              'es_complementaria', false,
              'origen', CASE WHEN nv.periodo_id < ef.periodo_id THEN 'historico' ELSE 'actual' END,
              'periodo_id', nv.periodo_id
            ) ORDER BY nv.materia
          ) FILTER (WHERE nv.materia_id IS NOT NULL),
          '[]'
        ) as notas
      FROM estudiantes_filtrados ef
      LEFT JOIN notas_validas nv ON ef.id = nv.estudiante_id
      GROUP BY ef.id, ef.cedula, ef.apellidos, ef.nombres, ef.periodo_id, ef.periodo_nombre
      ORDER BY ef.apellidos, ef.nombres
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM estudiantes e
      WHERE e.activo = true
        AND ($1::int IS NULL OR e.periodo_id = $1::int)
        AND (
          $2 = '' OR
          e.nombres ILIKE '%' || $2 || '%' OR
          e.apellidos ILIKE '%' || $2 || '%' OR
          e.cedula ILIKE '%' || $2 || '%'
        )
    `;

    const [dataRes, countRes] = await Promise.all([
      pool.query(query, [periodoId, anoEscolar, search, limit, offset]),
      pool.query(countQuery, [periodoId, search])
    ]);

    const total = parseInt(countRes.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      estudiantes: dataRes.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Error GET boletines:', error);
    return NextResponse.json(
      { error: 'Error al cargar boletines: ' + (error as Error).message },
      { status: 500 }
    );
  }
}