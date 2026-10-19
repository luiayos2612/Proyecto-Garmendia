import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { verifyToken } from '@/lib/auth';
import { obtenerResumenFinanciero } from '@/lib/estadoFinanciero';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
      { error: 'No tiene permisos para consultar pagos.' },
      { status: 403 }
    );
  }

  const { id: estudianteId } = await params;

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      estudianteId
    )
  ) {
    return NextResponse.json(
      { error: 'Identificador de estudiante inválido.' },
      { status: 400 }
    );
  }

  let client: import('pg').PoolClient | undefined;
  let transaccionAbierta = false;

  try {
    client = await pool.connect();

    // Todas las lecturas pertenecen a una misma instantánea.
    await client.query(
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'
    );
    transaccionAbierta = true;

    const estudianteResult = await client.query(
      `
        SELECT
          id,
          nombres,
          apellidos,
          cedula,
          estado,
          activo,
          periodo_id
        FROM estudiantes
        WHERE id = $1::uuid
      `,
      [estudianteId]
    );

    if (estudianteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      transaccionAbierta = false;

      return NextResponse.json(
        { error: 'Estudiante no encontrado.' },
        { status: 404 }
      );
    }

    const estudiante = estudianteResult.rows[0];

    const intentoResult = await client.query(
      `
        SELECT
          id,
          estudiante_id,
          periodo_id,
          numero_intento,
          ano_escolar,
          estado,
          fecha_inicio
        FROM intentos_academicos
        WHERE estudiante_id = $1::uuid
          AND estado = 'en_curso'
      `,
      [estudianteId]
    );

    if (intentoResult.rows.length !== 1) {
      await client.query('ROLLBACK');
      transaccionAbierta = false;

      return NextResponse.json(
        {
          error:
            'El estudiante no tiene un intento académico abierto. ' +
            'Esta ficha muestra únicamente el intento actual.',
        },
        { status: 409 }
      );
    }

    const intento = intentoResult.rows[0];

    if (
      Number(estudiante.periodo_id) !== Number(intento.periodo_id)
    ) {
      await client.query('ROLLBACK');
      transaccionAbierta = false;

      return NextResponse.json(
        {
          error:
            'El período del estudiante no coincide con su intento abierto.',
        },
        { status: 409 }
      );
    }

    const pagosResult = await client.query(
      `
        SELECT *
        FROM pagos
        WHERE estudiante_id = $1::uuid
          AND intento_id = $2::uuid
        ORDER BY created_at DESC, id DESC
      `,
      [estudianteId, intento.id]
    );

    const cuotasResult = await client.query(
      `
        SELECT
          c.*,
          EXISTS (
            SELECT 1
            FROM pagos_cuotas pc
            WHERE pc.cuota_id = c.id
              AND pc.estado = 'reservada'
          ) AS pago_en_verificacion
        FROM cuotas c
        WHERE c.estudiante_id = $1::uuid
          AND c.intento_id = $2::uuid
        ORDER BY
          CASE
            WHEN c.tipo_cuota = 'inscripcion' THEN 0
            WHEN c.tipo_cuota = 'mensualidad' THEN 1
            ELSE 2
          END,
          c.numero_mensualidad NULLS FIRST,
          c.fecha_vencimiento,
          c.id
      `,
      [estudianteId, intento.id]
    );


    const resumen = await obtenerResumenFinanciero(
      client,
      estudianteId,
      intento.id
    );

    await client.query('COMMIT');
    transaccionAbierta = false;

    return NextResponse.json(
      {
        estudiante: {
          ...estudiante,
          estado: resumen.estado,
          intento_id: intento.id,
          numero_intento: intento.numero_intento,
        },
        intento,
        pagos: pagosResult.rows,
        cuotas: cuotasResult.rows,
        resumen: {
          ...resumen,
          intento_id: intento.id,
          periodo_id: intento.periodo_id,
          numero_intento: intento.numero_intento,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    if (client && transaccionAbierta) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error revirtiendo lectura financiera:', rollbackError);
      }
    }

    console.error('Error GET pagos del estudiante:', error);

    return NextResponse.json(
      { error: 'No se pudo cargar la ficha financiera.' },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}