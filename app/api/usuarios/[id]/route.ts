import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { hash } from 'bcryptjs';
import { verifyToken } from '@/lib/auth';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);
  if (!actor) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
  }

  const { id } = params;
  if (!id) {
    return NextResponse.json({ message: 'ID de usuario requerido' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const updates: string[] = [];
    const values: any[] = [];

    if (body.password) {
      const password_hash = await hash(body.password, 10);
      values.push(password_hash);
      updates.push(`password_hash = $${values.length}`);
    }

    if (typeof body.activo === 'boolean') {
      values.push(body.activo);
      updates.push(`activo = $${values.length}`);
    }

    if (typeof body.rol === 'string') {
      values.push(body.rol);
      updates.push(`rol = $${values.length}`);
    }

    if (typeof body.nombre_completo === 'string') {
      values.push(body.nombre_completo);
      updates.push(`nombre_completo = $${values.length}`);
    }

    if (updates.length === 0) {
      return NextResponse.json({ message: 'No hay datos para actualizar' }, { status: 400 });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE usuarios SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING id, email, nombre_completo, rol, activo`,
      values
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ message: 'Usuario no encontrado' }, { status: 404 });
    }

    const auditPayload = {
      id,
      cambios: {
        ...(body.nombre_completo ? { nombre_completo: body.nombre_completo } : {}),
        ...(typeof body.activo === 'boolean' ? { activo: body.activo } : {}),
        ...(body.rol ? { rol: body.rol } : {}),
        ...(body.password ? { password: '********' } : {}),
      },
      timestamp: new Date(),
      tipo: 'actualizar_usuario',
    };

    await pool.query(
      `INSERT INTO auditoria (tabla_afectada, accion, usuario_id, datos_nuevos)
       VALUES ($1, $2, $3, $4)`,
      ['usuarios', 'UPDATE', actor.userId, JSON.stringify(auditPayload)]
    );

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error PATCH usuarios:', error);
    return NextResponse.json({ message: 'Error al actualizar usuario' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);
  if (!actor) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
  }

  const { id } = params;
  if (!id) {
    return NextResponse.json({ message: 'ID de usuario requerido' }, { status: 400 });
  }

  try {
    const result = await pool.query('DELETE FROM usuarios WHERE id = $1 RETURNING id, email', [id]);

    if (result.rowCount === 0) {
      return NextResponse.json({ message: 'Usuario no encontrado' }, { status: 404 });
    }

    await pool.query(
      `INSERT INTO auditoria (tabla_afectada, accion, usuario_id, datos_nuevos)
       VALUES ($1, $2, $3, $4)`,
      ['usuarios', 'DELETE', actor.userId, JSON.stringify({ id, email: result.rows[0].email, timestamp: new Date(), tipo: 'eliminar_usuario' })]
    );

    return NextResponse.json({ message: 'Usuario eliminado' });
  } catch (error) {
    console.error('Error DELETE usuarios:', error);
    return NextResponse.json({ message: 'Error al eliminar usuario' }, { status: 500 });
  }
}
