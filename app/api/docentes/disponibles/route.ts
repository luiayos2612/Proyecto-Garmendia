import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { verifyToken } from '@/lib/auth';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ROLES_PERMITIDOS = ['director', 'secretaria'];

export async function GET(request: NextRequest) {
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);
  if (!actor) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
  }

  if (!ROLES_PERMITIDOS.includes(actor.rol)) {
    return NextResponse.json({ message: 'No tiene permisos' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const conAsignacion = searchParams.get('con_asignacion') === 'true';

    const query = `
      SELECT
        d.id,
        d.cedula,
        d.apellidos,
        d.nombres,
        d.especialidad,
        d.email,
        COALESCE(
          STRING_AGG(
            DISTINCT m.nombre || ' (Periodo ' || ad.periodo_id || ')',
            ', '
            ORDER BY m.nombre || ' (Periodo ' || ad.periodo_id || ')'
          ),
          'Sin asignaciones registradas'
        ) AS materias_resumen,
        COUNT(DISTINCT ad.id) AS total_asignaciones
      FROM docentes d
      LEFT JOIN asignaciones_docentes ad ON ad.docente_id = d.id AND ad.activa = true
      LEFT JOIN materias m ON m.id = ad.materia_id
      WHERE d.activo = true
        AND d.usuario_id IS NULL
      GROUP BY d.id, d.cedula, d.apellidos, d.nombres, d.especialidad, d.email
      ${conAsignacion ? 'HAVING COUNT(DISTINCT ad.id) > 0' : ''}
      ORDER BY d.apellidos, d.nombres
    `;

    const result = await pool.query(query);

    return NextResponse.json({ docentes: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Error GET docentes/disponibles:', error);
    return NextResponse.json(
      { message: 'Error al cargar profesores disponibles' },
      { status: 500 }
    );
  }
}