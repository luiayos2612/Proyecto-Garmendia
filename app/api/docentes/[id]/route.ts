import { NextRequest, NextResponse } from 'next/server';
import { Pool, type PoolClient } from 'pg';
import { verifyToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

type Contexto = {
  params: {
    id: string;
  };
};

class ErrorDocente extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

function esUuid(valor: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    valor
  );
}

function leerTexto(
  valor: unknown,
  nombre: string,
  maximo: number,
  obligatorio = false
) {
  if (
    valor !== undefined &&
    valor !== null &&
    typeof valor !== 'string'
  ) {
    throw new ErrorDocente(
      400,
      `${nombre} debe ser texto.`
    );
  }

  const texto =
    typeof valor === 'string' ? valor.trim() : '';

  if (obligatorio && !texto) {
    throw new ErrorDocente(
      400,
      `${nombre} es obligatorio.`
    );
  }

  if (texto.length > maximo) {
    throw new ErrorDocente(
      400,
      `${nombre} no puede superar ${maximo} caracteres.`
    );
  }

  return texto;
}

async function obtenerActor(request: NextRequest) {
  const actor = verifyToken(
    request.cookies.get('token')?.value ?? ''
  );

  if (!actor) {
    throw new ErrorDocente(
      401,
      'La sesión no es válida.'
    );
  }

  if (!['director', 'secretaria'].includes(actor.rol)) {
    throw new ErrorDocente(
      403,
      'No tiene permisos para administrar docentes.'
    );
  }

  const usuario = await pool.query(
    `
      SELECT id, rol
      FROM usuarios
      WHERE id = $1::uuid
        AND activo = true
    `,
    [actor.userId]
  );

  const actual = usuario.rows[0];

  if (!actual) {
    throw new ErrorDocente(
      401,
      'Su usuario no está activo.'
    );
  }

  if (
    !['director', 'secretaria'].includes(actual.rol)
  ) {
    throw new ErrorDocente(
      403,
      'Su usuario no tiene permisos para esta operación.'
    );
  }

  return {
    ...actor,
    rol: actual.rol as string,
  };
}

function responderError(error: unknown) {
  if (error instanceof ErrorDocente) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }

  const codigo =
    typeof error === 'object' &&
    error !== null &&
    'code' in error
      ? String(error.code)
      : '';

  console.error('Administración de docentes:', error);

  if (codigo === '23505') {
    return NextResponse.json(
      {
        error:
          'Ya existe un docente con esa cédula u otro valor único ingresado.',
      },
      { status: 409 }
    );
  }

  if (codigo === '22001') {
    return NextResponse.json(
      {
        error:
          'Un campo supera la longitud admitida por la base de datos. Revise los datos ingresados.',
      },
      { status: 400 }
    );
  }

  if (codigo === '55P03' || codigo === '40P01') {
    return NextResponse.json(
      {
        error:
          'Otro proceso está utilizando estos registros. Espere unos segundos y vuelva a intentarlo.',
      },
      { status: 409 }
    );
  }

  return NextResponse.json(
    {
      error:
        'No se pudo completar la operación. Revise la terminal del servidor.',
    },
    { status: 500 }
  );
}

async function revertir(
  client: PoolClient | undefined,
  abierta: boolean
) {
  if (!client || !abierta) return;

  try {
    await client.query('ROLLBACK');
  } catch (error) {
    console.error('Rollback de docentes:', error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: Contexto
) {
  let client: PoolClient | undefined;
  let abierta = false;

  try {
    const actor = await obtenerActor(request);

    if (!esUuid(params.id)) {
      throw new ErrorDocente(
        400,
        'El identificador del docente no es válido.'
      );
    }

    let recibido: unknown;

    try {
      recibido = await request.json();
    } catch {
      throw new ErrorDocente(
        400,
        'La solicitud no contiene un JSON válido.'
      );
    }

    if (
      typeof recibido !== 'object' ||
      recibido === null ||
      Array.isArray(recibido)
    ) {
      throw new ErrorDocente(
        400,
        'La solicitud tiene un formato incorrecto.'
      );
    }

    const body = recibido as Record<string, unknown>;

    const cedula = leerTexto(
      body.cedula,
      'Cédula',
      20,
      true
    );

    const nombres = leerTexto(
      body.nombres,
      'Nombres',
      100,
      true
    );

    const apellidos = leerTexto(
      body.apellidos,
      'Apellidos',
      100,
      true
    );

    const especialidad = leerTexto(
      body.especialidad,
      'Especialidad',
      100
    );

    const telefono = leerTexto(
      body.telefono,
      'Teléfono',
      30
    );

    const email = leerTexto(
      body.email,
      'Correo de contacto',
      100
    );

    if (
      email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      throw new ErrorDocente(
        400,
        'El correo de contacto no es válido.'
      );
    }

    client = await pool.connect();

    await client.query('BEGIN');
    abierta = true;

    await client.query(
      "SET LOCAL lock_timeout = '5s'"
    );

    const anteriorResult = await client.query(
      `
        SELECT
          id,
          cedula,
          nombres,
          apellidos,
          especialidad,
          telefono,
          email,
          activo,
          usuario_id
        FROM docentes
        WHERE id = $1::uuid
        FOR UPDATE
      `,
      [params.id]
    );

    const anterior = anteriorResult.rows[0];

    if (!anterior) {
      throw new ErrorDocente(
        404,
        'El docente no existe.'
      );
    }

    if (anterior.activo !== true) {
      throw new ErrorDocente(
        409,
        'El docente ya está retirado. Actualice el listado.'
      );
    }

    const resultado = await client.query(
      `
        UPDATE docentes
        SET
          cedula = $1,
          nombres = $2,
          apellidos = $3,
          especialidad = $4,
          telefono = $5,
          email = $6
        WHERE id = $7::uuid
        RETURNING
          id,
          cedula,
          nombres,
          apellidos,
          especialidad,
          telefono,
          email,
          activo,
          usuario_id
      `,
      [
        cedula,
        nombres,
        apellidos,
        especialidad || null,
        telefono || null,
        email || null,
        params.id,
      ]
    );

    const docente = resultado.rows[0];

    await client.query(
      `
        INSERT INTO auditoria (
          tabla_afectada,
          accion,
          usuario_id,
          datos_nuevos
        )
        VALUES (
          'docentes',
          'UPDATE',
          $1,
          $2
        )
      `,
      [
        actor.userId,
        JSON.stringify({
          anterior,
          nuevo: docente,
          resumen:
            'Edición de datos del docente. No se modificó su cuenta de acceso.',
        }),
      ]
    );

    await client.query('COMMIT');
    abierta = false;

    return NextResponse.json({
      success: true,
      message: 'Datos del docente actualizados.',
      docente,
    });
  } catch (error) {
    await revertir(client, abierta);
    return responderError(error);
  } finally {
    client?.release();
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: Contexto
) {
  let client: PoolClient | undefined;
  let abierta = false;

  try {
    const actor = await obtenerActor(request);

    if (!esUuid(params.id)) {
      throw new ErrorDocente(
        400,
        'El identificador del docente no es válido.'
      );
    }

    client = await pool.connect();

    await client.query('BEGIN');
    abierta = true;

    await client.query(
      "SET LOCAL lock_timeout = '5s'"
    );

    /*
     * Se usa el mismo orden de bloqueo que en
     * la gestión de asignaciones.
     */
    await client.query(`
      LOCK TABLE asignaciones_docentes
      IN SHARE ROW EXCLUSIVE MODE
    `);

    const docenteResult = await client.query(
      `
        SELECT
          id,
          nombres,
          apellidos,
          activo,
          usuario_id
        FROM docentes
        WHERE id = $1::uuid
        FOR UPDATE
      `,
      [params.id]
    );

    const docente = docenteResult.rows[0];

    if (!docente) {
      throw new ErrorDocente(
        404,
        'El docente no existe.'
      );
    }

    let usuarioDesactivado = false;

    if (docente.usuario_id) {
      if (docente.usuario_id === actor.userId) {
        throw new ErrorDocente(
          409,
          'No puede retirar un docente vinculado a su propia cuenta desde esta operación.'
        );
      }

      const usuarioResult = await client.query(
        `
          SELECT id, rol
          FROM usuarios
          WHERE id = $1::uuid
          FOR UPDATE
        `,
        [docente.usuario_id]
      );

      const usuario = usuarioResult.rows[0];

      if (!usuario || usuario.rol !== 'docente') {
        throw new ErrorDocente(
          409,
          'La cuenta vinculada no es una cuenta docente válida. Revise el vínculo en Usuarios antes de retirarlo.'
        );
      }

      const compartido = await client.query(
        `
          SELECT id
          FROM docentes
          WHERE usuario_id = $1::uuid
            AND id <> $2::uuid
            AND activo = true
          LIMIT 1
        `,
        [docente.usuario_id, docente.id]
      );

      if (compartido.rows.length > 0) {
        throw new ErrorDocente(
          409,
          'La cuenta está vinculada a otro docente activo. Revise ese vínculo antes de continuar.'
        );
      }

      await client.query(
        `
          UPDATE usuarios
          SET activo = false
          WHERE id = $1::uuid
            AND rol = 'docente'
        `,
        [docente.usuario_id]
      );

      usuarioDesactivado = true;
    }

    const asignaciones = await client.query(
      `
        UPDATE asignaciones_docentes
        SET activa = false
        WHERE docente_id = $1::uuid
          AND activa = true
        RETURNING
          id,
          materia_id,
          periodo_id,
          ano_escolar
      `,
      [docente.id]
    );

    await client.query(
      `
        UPDATE docentes
        SET activo = false
        WHERE id = $1::uuid
      `,
      [docente.id]
    );

    await client.query(
      `
        INSERT INTO auditoria (
          tabla_afectada,
          accion,
          usuario_id,
          datos_nuevos
        )
        VALUES (
          'docentes',
          'UPDATE',
          $1,
          $2
        )
      `,
      [
        actor.userId,
        JSON.stringify({
          docente_id: docente.id,
          nombres: docente.nombres,
          apellidos: docente.apellidos,
          activo: false,
          asignaciones_inactivadas: asignaciones.rows,
          usuario_desactivado: usuarioDesactivado,
          resumen:
            'Retiro del plantel sin borrar notas ni historial.',
        }),
      ]
    );

    await client.query('COMMIT');
    abierta = false;

    return NextResponse.json({
      success: true,
      message:
        'Docente retirado del plantel sin borrar su historial.',
      asignaciones_inactivadas:
        asignaciones.rows.length,
      usuario_desactivado: usuarioDesactivado,
    });
  } catch (error) {
    await revertir(client, abierta);
    return responderError(error);
  } finally {
    client?.release();
  }
}