import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET() {
  try {
    const result = await pool.query(`SELECT clave, valor FROM configuracion`);
    const config = result.rows.reduce((acc, row) => {
      acc[row.clave] = row.valor;
      return acc;
    }, {} as Record<string, string>);
    return NextResponse.json(config);
  } catch (error) {
    console.error('Error GET configuracion:', error);
    return NextResponse.json({ error: 'Error al cargar configuración' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const body = await request.json();
    
    // Validar que los valores sean números positivos
    const numericKeys = ['costo_inscripcion', 'costo_semestre', 'tasa_cambio', 'monto_mensualidad'];
    for (const key of numericKeys) {
      if (body[key] !== undefined) {
        const val = parseFloat(body[key]);
        if (isNaN(val) || val < 0) {
          await client.query('ROLLBACK');
          return NextResponse.json({ error: `El valor de ${key} debe ser un número positivo` }, { status: 400 });
        }
      }
    }

    // Si cambia costo_semestre y no envió mensualidad, recalcular automáticamente
    if (body.costo_semestre && !body.monto_mensualidad) {
      body.monto_mensualidad = (parseFloat(body.costo_semestre) / 6).toFixed(2);
    }

    for (const [clave, valor] of Object.entries(body)) {
      await client.query(
        `INSERT INTO configuracion (clave, valor) VALUES ($1, $2)
         ON CONFLICT (clave) DO UPDATE SET valor = $2`,
        [clave, valor]
      );
    }

    await client.query('COMMIT');

    // Auditoría
    await pool.query(
      `INSERT INTO auditoria (tabla_afectada, accion, usuario_id, datos_nuevos)
       VALUES ('configuracion','UPDATE','sistema',$1)`,
      [JSON.stringify(body)]
    );

    return NextResponse.json({ success: true, message: 'Configuración actualizada' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error PATCH configuracion:', error);
    return NextResponse.json({ error: 'Error al actualizar configuración' }, { status: 500 });
  } finally {
    client.release();
  }
}