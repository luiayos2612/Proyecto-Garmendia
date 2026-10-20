import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { verifyToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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

  if (!['director', 'secretaria'].includes(actor.rol)) {
    return NextResponse.json(
      { error: 'No tiene permisos para gestionar asignaciones.' },
      { status: 403 }
    );
  }

  try {
    const resultado = await pool.query(`
      WITH registros AS (
        SELECT valor AS ano
        FROM configuracion
        WHERE clave = 'ano_escolar'

        UNION ALL

        SELECT ano_escolar AS ano
        FROM asignaciones_docentes

        UNION ALL

        SELECT ano_escolar AS ano
        FROM inscripciones_materias

        UNION ALL

        SELECT ano_escolar AS ano
        FROM intentos_academicos
      ),
      configurado AS (
        SELECT BTRIM(valor) AS ano
        FROM configuracion
        WHERE clave = 'ano_escolar'
      )
      SELECT
        registros.ano,
        registros.ano = (
          SELECT ano
          FROM configurado
          LIMIT 1
        ) AS es_configurado
      FROM (
        SELECT DISTINCT BTRIM(ano) AS ano
        FROM registros
        WHERE ano IS NOT NULL
          AND BTRIM(ano) <> ''
      ) registros
      ORDER BY
        es_configurado DESC NULLS LAST,
        registros.ano DESC
    `);

    const anos = resultado.rows.map(
      (fila) => String(fila.ano)
    );

    const configurado = resultado.rows.find(
      (fila) => fila.es_configurado === true
    )?.ano;

    return NextResponse.json(
      {
        anos,
        configurado: configurado ?? null,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('Error al consultar años escolares:', error);

    return NextResponse.json(
      { error: 'No se pudieron cargar los años escolares.' },
      { status: 500 }
    );
  }
}