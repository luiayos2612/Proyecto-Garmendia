import { NextRequest, NextResponse } from 'next/server';
import { Pool, type PoolClient } from 'pg';
import { verifyToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const ROLES_GESTION = ['director', 'secretaria'];

class ErrorGestion extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

function esUuid(valor: unknown): valor is string {
  return (
    typeof valor === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      valor
    )
  );
}

function validarAno(valor: unknown): string {
  if (
    typeof valor !== 'string' ||
    valor.trim() === '' ||
    valor.trim().length > 30
  ) {
    throw new ErrorGestion(
      400,
      'Seleccione un año escolar válido.'
    );
  }

  return valor.trim();
}

function respuestaError(error: unknown) {
  if (error instanceof ErrorGestion) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }

  console.error('Gestión de asignaciones:', error);

  return NextResponse.json(
    {
      error:
        'No se pudo completar la operación. Revise la terminal del servidor.',
    },
    { status: 500 }
  );
}

export async function GET(request: NextRequest) {
  const actor = verifyToken(
    request.cookies.get('token')?.value ?? ''
  );

  if (!actor) {
    return NextResponse.json(
      { error: 'No autorizado.' },
      { status: 401 }
    );
  }

  if (!ROLES_GESTION.includes(actor.rol)) {
    return NextResponse.json(
      { error: 'No tiene permisos para gestionar asignaciones.' },
      { status: 403 }
    );
  }

  try {
    const ano = validarAno(
      request.nextUrl.searchParams.get('ano_escolar')
    );

    const [
      periodos,
      materias,
      docentes,
      asignaciones,
      anos,
    ] = await Promise.all([
      pool.query(`
        SELECT numero, nombre
        FROM periodos
        WHERE activo = true
        ORDER BY numero
      `),

      pool.query(`
        SELECT
          pm.periodo_id,
          pm.materia_id,
          pm.es_obligatoria,
          m.nombre,
          m.codigo
        FROM periodo_materia pm
        JOIN materias m
          ON m.id = pm.materia_id
        JOIN periodos p
          ON p.numero = pm.periodo_id
        WHERE m.activa = true
          AND p.activo = true
        ORDER BY
          pm.periodo_id,
          pm.orden NULLS LAST,
          m.nombre
      `),

      pool.query(`
        SELECT
          id,
          apellidos,
          nombres,
          especialidad
        FROM docentes
        WHERE activo = true
        ORDER BY apellidos, nombres
      `),

      pool.query(
        `
          SELECT
            a.id,
            a.periodo_id,
            a.materia_id,
            a.docente_id,
            d.apellidos || ' ' || d.nombres AS docente,
            d.activo AS docente_activo
          FROM asignaciones_docentes a
          LEFT JOIN docentes d
            ON d.id = a.docente_id
          WHERE a.activa = true
            AND a.ano_escolar = $1
          ORDER BY a.periodo_id, a.materia_id
        `,
        [ano]
      ),

      pool.query(`
        SELECT ano_escolar
        FROM (
          SELECT ano_escolar
          FROM asignaciones_docentes

          UNION

          SELECT ano_escolar
          FROM inscripciones_materias
        ) anos
        WHERE ano_escolar IS NOT NULL
        ORDER BY ano_escolar DESC
      `),
    ]);

    const claves = new Set<string>();

    for (const asignacion of asignaciones.rows) {
      const clave =
        `${asignacion.periodo_id}:${asignacion.materia_id}`;

      if (claves.has(clave)) {
        throw new ErrorGestion(
          409,
          'Existen varias asignaciones activas para una misma materia, período y año escolar. No se mostrará una selección arbitraria. Hay que revisar esos registros antes de continuar.'
        );
      }

      claves.add(clave);
    }

    const catalogo = new Set(
      materias.rows.map(
        (materia) =>
          `${materia.periodo_id}:${materia.materia_id}`
      )
    );

    const fueraCatalogo = asignaciones.rows.filter(
      (asignacion) =>
        !catalogo.has(
          `${asignacion.periodo_id}:${asignacion.materia_id}`
        )
    );

    return NextResponse.json(
      {
        periodos: periodos.rows,
        materias: materias.rows,
        docentes: docentes.rows,
        asignaciones: asignaciones.rows,
        anos: anos.rows.map((fila) => fila.ano_escolar),
        fuera_catalogo: fueraCatalogo,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    return respuestaError(error);
  }
}

interface Cambio {
  materia_id: string;
  docente_id: string | null;
  asignacion_anterior_id: string | null;
}

export async function PATCH(request: NextRequest) {
  const actor = verifyToken(
    request.cookies.get('token')?.value ?? ''
  );

  if (!actor) {
    return NextResponse.json(
      { error: 'No autorizado.' },
      { status: 401 }
    );
  }

  if (!ROLES_GESTION.includes(actor.rol)) {
    return NextResponse.json(
      { error: 'No tiene permisos para gestionar asignaciones.' },
      { status: 403 }
    );
  }

  let client: PoolClient | undefined;
  let abierta = false;

  try {
    let recibido: unknown;

    try {
      recibido = await request.json();
    } catch {
      throw new ErrorGestion(400, 'JSON no válido.');
    }

    if (
      typeof recibido !== 'object' ||
      recibido === null ||
      Array.isArray(recibido)
    ) {
      throw new ErrorGestion(
        400,
        'Solicitud no válida.'
      );
    }

    const body = recibido as Record<string, unknown>;
    const ano = validarAno(body.ano_escolar);

    const periodo = body.periodo_id;

    if (
      typeof periodo !== 'number' ||
      !Number.isInteger(periodo) ||
      periodo < 1 ||
      periodo > 6
    ) {
      throw new ErrorGestion(
        400,
        'Seleccione un período entre 1 y 6.'
      );
    }

    if (
      !Array.isArray(body.cambios) ||
      body.cambios.length === 0 ||
      body.cambios.length > 100
    ) {
      throw new ErrorGestion(
        400,
        'La solicitud debe contener entre 1 y 100 cambios.'
      );
    }

    const materiasRepetidas = new Set<string>();

    const cambios: Cambio[] = body.cambios.map(
      (entrada: unknown) => {
        if (
          typeof entrada !== 'object' ||
          entrada === null ||
          Array.isArray(entrada)
        ) {
          throw new ErrorGestion(
            400,
            'Existe un cambio con formato incorrecto.'
          );
        }

        const item = entrada as Record<string, unknown>;

        if (
          !esUuid(item.materia_id) ||
          !(
            item.docente_id === null ||
            esUuid(item.docente_id)
          ) ||
          !(
            item.asignacion_anterior_id === null ||
            esUuid(item.asignacion_anterior_id)
          )
        ) {
          throw new ErrorGestion(
            400,
            'Los identificadores enviados no son válidos.'
          );
        }

        const materiaId = item.materia_id.toLowerCase();

        if (materiasRepetidas.has(materiaId)) {
          throw new ErrorGestion(
            400,
            'Una materia aparece repetida en la solicitud.'
          );
        }

        materiasRepetidas.add(materiaId);

        return {
          materia_id: materiaId,
          docente_id:
            typeof item.docente_id === 'string'
              ? item.docente_id.toLowerCase()
              : null,
          asignacion_anterior_id:
            typeof item.asignacion_anterior_id === 'string'
              ? item.asignacion_anterior_id.toLowerCase()
              : null,
        };
      }
    );

    client = await pool.connect();

    await client.query('BEGIN');
    abierta = true;

    await client.query(
      "SET LOCAL lock_timeout = '5s'"
    );

    // Serializa los cambios de asignaciones durante el guardado.
    await client.query(`
      LOCK TABLE asignaciones_docentes
      IN SHARE ROW EXCLUSIVE MODE
    `);

    const periodoResult = await client.query(
      `
        SELECT numero
        FROM periodos
        WHERE numero = $1
          AND activo = true
        FOR SHARE
      `,
      [periodo]
    );

    if (periodoResult.rows.length !== 1) {
      throw new ErrorGestion(
        409,
        'El período no está disponible.'
      );
    }

    const catalogo = await client.query(
      `
        SELECT pm.materia_id
        FROM periodo_materia pm
        JOIN materias m
          ON m.id = pm.materia_id
        WHERE pm.periodo_id = $1
          AND m.activa = true
        FOR SHARE OF pm, m
      `,
      [periodo]
    );

    const permitidas = new Set<string>(
      catalogo.rows.map((fila) => fila.materia_id)
    );

    for (const cambio of cambios) {
      if (!permitidas.has(cambio.materia_id)) {
        throw new ErrorGestion(
          409,
          'Una materia ya no pertenece al catálogo activo de este período. Vuelva a cargar la pantalla.'
        );
      }
    }

    const docentesIds = Array.from(
      new Set(
        cambios
          .map((cambio) => cambio.docente_id)
          .filter((id): id is string => id !== null)
      )
    ).sort();

    if (docentesIds.length > 0) {
      const docentes = await client.query(
        `
          SELECT id
          FROM docentes
          WHERE id = ANY($1::uuid[])
            AND activo = true
          ORDER BY id
          FOR SHARE
        `,
        [docentesIds]
      );

      if (docentes.rows.length !== docentesIds.length) {
        throw new ErrorGestion(
          409,
          'Uno de los profesores ya no está activo. Vuelva a cargar la pantalla.'
        );
      }
    }

    const detalles: Array<Record<string, unknown>> = [];

    for (const cambio of cambios) {
      const actualResult = await client.query(
        `
          SELECT id, docente_id
          FROM asignaciones_docentes
          WHERE materia_id = $1::uuid
            AND periodo_id = $2
            AND ano_escolar = $3
            AND activa = true
          FOR UPDATE
        `,
        [cambio.materia_id, periodo, ano]
      );

      if (actualResult.rows.length > 1) {
        throw new ErrorGestion(
          409,
          'Esta materia tiene más de una asignación activa. Deben revisarse sus registros.'
        );
      }

      const actual = actualResult.rows[0];

      if (
        (actual?.id ?? null) !==
        cambio.asignacion_anterior_id
      ) {
        throw new ErrorGestion(
          409,
          'Otra operación cambió una asignación mientras usted editaba. No se guardó ningún cambio. Vuelva a cargar la pantalla.'
        );
      }

      if (
        (actual?.docente_id ?? null) ===
        cambio.docente_id
      ) {
        continue;
      }

      if (actual) {
        await client.query(
          `
            UPDATE asignaciones_docentes
            SET activa = false
            WHERE id = $1::uuid
          `,
          [actual.id]
        );
      }

      let nuevaId: string | null = null;

      if (cambio.docente_id) {
        const previa = await client.query(
          `
            SELECT id
            FROM asignaciones_docentes
            WHERE docente_id = $1::uuid
              AND materia_id = $2::uuid
              AND periodo_id = $3
              AND ano_escolar = $4
            FOR UPDATE
          `,
          [
            cambio.docente_id,
            cambio.materia_id,
            periodo,
            ano,
          ]
        );

        if (previa.rows.length > 1) {
          throw new ErrorGestion(
            409,
            'Hay asignaciones históricas duplicadas que deben revisarse.'
          );
        }

        if (previa.rows.length === 1) {
          nuevaId = previa.rows[0].id;

          await client.query(
            `
              UPDATE asignaciones_docentes
              SET activa = true
              WHERE id = $1::uuid
            `,
            [nuevaId]
          );
        } else {
          const nueva = await client.query(
            `
              INSERT INTO asignaciones_docentes (
                docente_id,
                materia_id,
                periodo_id,
                ano_escolar,
                activa
              )
              VALUES (
                $1::uuid,
                $2::uuid,
                $3,
                $4,
                true
              )
              RETURNING id
            `,
            [
              cambio.docente_id,
              cambio.materia_id,
              periodo,
              ano,
            ]
          );

          nuevaId = nueva.rows[0].id;
        }
      }

      detalles.push({
        materia_id: cambio.materia_id,
        asignacion_anterior_id: actual?.id ?? null,
        docente_anterior_id: actual?.docente_id ?? null,
        asignacion_nueva_id: nuevaId,
        docente_nuevo_id: cambio.docente_id,
      });
    }

    if (detalles.length > 0) {
      await client.query(
        `
          INSERT INTO auditoria (
            tabla_afectada,
            accion,
            usuario_id,
            datos_nuevos
          )
          VALUES (
            'asignaciones_docentes',
            'UPDATE',
            $1,
            $2
          )
        `,
        [
          actor.userId,
          JSON.stringify({
            periodo_id: periodo,
            ano_escolar: ano,
            cambios: detalles,
            resumen:
              'Gestión de asignaciones sin borrar calificaciones ni evaluaciones.',
          }),
        ]
      );
    }

    await client.query('COMMIT');
    abierta = false;

    return NextResponse.json({
      success: true,
      modificadas: detalles.length,
      message:
        detalles.length > 0
          ? 'Asignaciones guardadas correctamente.'
          : 'No había cambios por guardar.',
    });
  } catch (error) {
    if (client && abierta) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(
          'Rollback de asignaciones:',
          rollbackError
        );
      }
    }

    return respuestaError(error);
  } finally {
    client?.release();
  }
}