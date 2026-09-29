import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { hash } from 'bcryptjs';
import { verifyToken } from '@/lib/auth';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const validRoles = ['director', 'docente', 'secretaria'];
const ROLES_QUE_PUEDEN_CREAR_USUARIOS = ['director', 'secretaria'];

export async function GET(request: NextRequest) {
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);
  if (!actor) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
  }

  if (!ROLES_QUE_PUEDEN_CREAR_USUARIOS.includes(actor.rol)) {
    return NextResponse.json({ message: 'No tiene permisos para ver usuarios' }, { status: 403 });
  }

  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.nombre_completo, u.rol, u.activo, u.created_at,
              d.id as docente_id,
              d.apellidos as docente_apellidos,
              d.nombres as docente_nombres
       FROM usuarios u
       LEFT JOIN docentes d ON d.usuario_id = u.id
       ORDER BY u.email`
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error GET usuarios:', error);
    return NextResponse.json({ message: 'Error al cargar usuarios' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);
  if (!actor) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
  }

  if (!ROLES_QUE_PUEDEN_CREAR_USUARIOS.includes(actor.rol)) {
    return NextResponse.json({ message: 'No tiene permisos para crear usuarios' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    const body = await request.json();
    const { email, password, nombre_completo, rol, docente_id } = body;

    if (!email || !password || !nombre_completo || !rol) {
      return NextResponse.json(
        { message: 'Todos los campos son obligatorios' },
        { status: 400 }
      );
    }

    if (!validRoles.includes(rol)) {
      return NextResponse.json({ message: 'Rol inválido' }, { status: 400 });
    }

    if (rol === 'docente' && !docente_id) {
      return NextResponse.json(
        { message: 'Debe seleccionar el profesor a vincular con este usuario' },
        { status: 400 }
      );
    }

    const existing = await client.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if ((existing.rowCount ?? 0) > 0) {
      return NextResponse.json({ message: 'El correo ya está registrado' }, { status: 409 });
    }

    if (rol === 'docente') {
      const docenteRes = await client.query(
        'SELECT id, usuario_id, activo FROM docentes WHERE id = $1',
        [docente_id]
      );

      if (docenteRes.rowCount === 0) {
        return NextResponse.json({ message: 'El profesor seleccionado no existe' }, { status: 404 });
      }

      const docente = docenteRes.rows[0];

      if (!docente.activo) {
        return NextResponse.json({ message: 'El profesor seleccionado está inactivo' }, { status: 400 });
      }

      if (docente.usuario_id) {
        return NextResponse.json(
          { message: 'Este profesor ya tiene un usuario asignado' },
          { status: 409 }
        );
      }
    }

    const password_hash = await hash(password, 10);

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO usuarios (email, password_hash, nombre_completo, rol, activo)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, email, nombre_completo, rol, activo`,
      [email, password_hash, nombre_completo, rol]
    );

    const nuevoUsuario = result.rows[0];

    if (rol === 'docente') {
      await client.query(
        'UPDATE docentes SET usuario_id = $1 WHERE id = $2',
        [nuevoUsuario.id, docente_id]
      );
    }

    await client.query(
      `INSERT INTO auditoria (tabla_afectada, accion, usuario_id, datos_nuevos)
       VALUES ($1, $2, $3, $4)`,
      [
        'usuarios',
        'INSERT',
        actor.userId,
        JSON.stringify({
          email,
          nombre_completo,
          rol,
          docente_id: docente_id ?? null,
          timestamp: new Date(),
          tipo: rol === 'docente' ? 'crear_usuario_docente' : 'crear_usuario',
        }),
      ]
    );

    await client.query('COMMIT');

    return NextResponse.json(
      { ...nuevoUsuario, docente_id: docente_id ?? null },
      { status: 201 }
    );
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error POST usuarios:', error);
    return NextResponse.json({ message: 'Error al crear usuario' }, { status: 500 });
  } finally {
    client.release();
  }
}