import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { signToken, COOKIE_NAME, cookieOptions, comparePassword } from '@/lib/auth';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { message: 'Email y contraseña son requeridos' },
        { status: 400 }
      );
    }

    const result = await pool.query(
      'SELECT id, email, rol, nombre_completo, password_hash FROM usuarios WHERE email = $1 AND activo = true',
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      return NextResponse.json({ message: 'Usuario no encontrado' }, { status: 401 });
    }

    if (!user.password_hash || !(await comparePassword(password, user.password_hash))) {
      return NextResponse.json({ message: 'Contraseña incorrecta' }, { status: 401 });
    }

    // ✅ NUEVO: si el rol es docente, buscamos su docenteId vinculado
    let docenteId: string | undefined = undefined;

    if (user.rol === 'docente') {
      const docenteRes = await pool.query(
        'SELECT id FROM docentes WHERE usuario_id = $1 AND activo = true',
        [user.id]
      );

      if (docenteRes.rowCount === 0) {
        return NextResponse.json(
          { message: 'Su perfil de docente no está activo. Contacte al administrador.' },
          { status: 403 }
        );
      }

      docenteId = docenteRes.rows[0].id;
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      rol: user.rol,
      nombre: user.nombre_completo,
      ...(docenteId ? { docenteId } : {}),
    });

    await pool.query(
      `INSERT INTO auditoria (tabla_afectada, accion, usuario_id, datos_nuevos)
       VALUES ($1, $2, $3, $4)`,
      ['usuarios', 'INSERT', user.id, JSON.stringify({ email: user.email, timestamp: new Date(), tipo: 'login' })]
    );

    const response = NextResponse.json({
      message: 'Login exitoso',
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre_completo,
        rol: user.rol,
        docenteId: docenteId ?? null,
      },
    });

    response.cookies.set(COOKIE_NAME, token, cookieOptions);
    return response;
  } catch (error) {
    console.error('Error en login:', error);
    return NextResponse.json({ message: 'Error interno del servidor' }, { status: 500 });
  }
}