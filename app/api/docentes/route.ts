import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT d.*, u.email as usuario_email
      FROM docentes d
      LEFT JOIN usuarios u ON d.usuario_id = u.id
      WHERE d.activo = true
      ORDER BY d.apellidos, d.nombres
    `);
    return NextResponse.json({ docentes: result.rows });
  } catch (error) {
    return NextResponse.json({ error: 'Error al cargar docentes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cedula, apellidos, nombres, especialidad, telefono, email } = body;
    
    const result = await pool.query(
      `INSERT INTO docentes (cedula, apellidos, nombres, especialidad, telefono, email)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [cedula, apellidos, nombres, especialidad, telefono, email]
    );
    
    // ✅ Auditoría con nombre legible
    await pool.query(
      `INSERT INTO auditoria (tabla_afectada, accion, usuario_id, datos_nuevos)
       VALUES ('docentes','INSERT','sistema',$1)`,
      [JSON.stringify({
        ...result.rows[0],
        resumen: `Docente ${apellidos} ${nombres} registrado (${especialidad})`
      })]
    );
    
    return NextResponse.json({ docente: result.rows[0] });
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear docente' }, { status: 500 });
  }
}