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
      {
        error: 'Debe iniciar sesión.',
      },
      { status: 401 }
    );
  }

  if (
    !['director', 'secretaria'].includes(
      actor.rol
    )
  ) {
    return NextResponse.json(
      {
        error:
          'No tiene permisos para consultar auditoría.',
      },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = request.nextUrl;

    const tabla = searchParams.get('tabla');
    const accion = searchParams.get('accion');

    const limiteRecibido = Number(
      searchParams.get('limit') || '50'
    );

    if (
      !Number.isInteger(limiteRecibido) ||
      limiteRecibido < 1 ||
      limiteRecibido > 500
    ) {
      return NextResponse.json(
        {
          error:
            'El límite debe ser un entero entre 1 y 500.',
        },
        { status: 400 }
      );
    }

    let consulta = `
      SELECT
        a.id,
        a.tabla_afectada,
        a.accion,
        a.usuario_id,
        a.datos_nuevos,
        a.fecha_hora,
        COALESCE(
          a.usuario_id,
          'Sistema'
        ) AS usuario_email
      FROM auditoria a
      WHERE 1 = 1
    `;

    const valores: Array<string | number> = [];

    if (tabla) {
      valores.push(tabla);

      consulta += `
        AND a.tabla_afectada = $${valores.length}
      `;
    }

    if (accion) {
      valores.push(accion);

      consulta += `
        AND a.accion = $${valores.length}
      `;
    }

    valores.push(limiteRecibido);

    consulta += `
      ORDER BY a.fecha_hora DESC
      LIMIT $${valores.length}
    `;

    const consultaEstadisticas = `
      SELECT
        tabla_afectada,
        COUNT(*) AS total,
        accion
      FROM auditoria
      GROUP BY
        tabla_afectada,
        accion
      ORDER BY tabla_afectada
    `;

    const [
      registrosResult,
      estadisticasResult,
    ] = await Promise.all([
      pool.query(consulta, valores),
      pool.query(consultaEstadisticas),
    ]);

    return NextResponse.json(
      {
        registros: registrosResult.rows,
        stats: estadisticasResult.rows,
        total: registrosResult.rows.length,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error(
      'Error GET auditoría:',
      error
    );

    return NextResponse.json(
      {
        error:
          'No se pudo cargar la auditoría. Revise la terminal del servidor.',
      },
      { status: 500 }
    );
  }
}