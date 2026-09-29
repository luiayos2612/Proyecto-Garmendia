import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { verifyToken } from '@/lib/auth';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(request: NextRequest) {
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);
  if (!actor) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (actor.rol === 'docente' && !actor.docenteId) {
    return NextResponse.json({ error: 'Perfil de docente no vinculado' }, { status: 403 });
  }

  try {
    const { searchParams } = request.nextUrl;
    const periodoId = searchParams.get('periodo_id');
    const materiaId = searchParams.get('materia_id');

    const docenteId = actor.rol === 'docente' ? actor.docenteId : searchParams.get('docente_id');

    const filters: string[] = ['1=1'];
    const values: Array<string | number> = [];

    if (periodoId) {
      values.push(Number(periodoId));
      filters.push(`a.periodo_id = $${values.length}`);
    }

    if (docenteId) {
      values.push(docenteId);
      filters.push(`c.docente_id = $${values.length}`);
    }

    if (materiaId) {
      values.push(materiaId);
      filters.push(`c.materia_id = $${values.length}`);
    }

    const whereClause = filters.join(' AND ');

    const calificacionesResult = await pool.query(
      `SELECT
        c.id,
        e.apellidos || ' ' || e.nombres AS estudiante,
        e.id AS estudiante_id,
        m.nombre AS materia,
        m.codigo AS materia_codigo,
        d.apellidos || ' ' || d.nombres AS docente,
        c.nota,
        a.periodo_id,
        p.nombre as periodo_nombre,
        c.observaciones,
        c.fecha_cierre as fecha_registro
      FROM calificaciones c
      JOIN estudiantes e ON c.estudiante_id = e.id
      JOIN materias m ON c.materia_id = m.id
      JOIN docentes d ON c.docente_id = d.id
      JOIN asignaciones_docentes a ON c.asignacion_id = a.id
      JOIN periodos p ON a.periodo_id = p.numero
      WHERE ${whereClause}
      ORDER BY a.periodo_id, e.apellidos, e.nombres, m.nombre`,
      values
    );

    const statsResult = await pool.query(
      `SELECT a.periodo_id, p.nombre, COUNT(*) AS total
      FROM calificaciones c
      JOIN asignaciones_docentes a ON c.asignacion_id = a.id
      JOIN periodos p ON a.periodo_id = p.numero
      WHERE ${whereClause}
      GROUP BY a.periodo_id, p.nombre
      ORDER BY a.periodo_id`,
      values
    );

    return NextResponse.json({
      calificaciones: calificacionesResult.rows,
      stats: statsResult.rows.map((row) => ({
        periodo_id: row.periodo_id,
        periodo_nombre: row.nombre,
        total: String(row.total),
      })),
    });
  } catch (error) {
    console.error('Error GET calificaciones:', error);
    return NextResponse.json({ error: 'Error al cargar calificaciones' }, { status: 500 });
  }
}

async function validarAsignacionParaActor(
  client: any,
  asignacionId: string,
  actor: { rol: string; docenteId?: string }
): Promise<{ ok: true; asignacion: any } | { ok: false; response: NextResponse }> {
  const asigRes = await client.query(
    'SELECT docente_id, materia_id, periodo_id FROM asignaciones_docentes WHERE id = $1',
    [asignacionId]
  );

  if (asigRes.rows.length === 0) {
    return { ok: false, response: NextResponse.json({ error: 'Asignación no encontrada' }, { status: 404 }) };
  }

  const asignacion = asigRes.rows[0];

  if (actor.rol === 'docente' && asignacion.docente_id !== actor.docenteId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'No puede calificar una asignación que no le pertenece' },
        { status: 403 }
      ),
    };
  }

  return { ok: true, asignacion };
}

async function estudianteInscrito(client: any, estudianteId: string, materiaId: string, periodoId: number) {
  const res = await client.query(
    `SELECT 1 FROM inscripciones_materias
     WHERE estudiante_id = $1 AND materia_id = $2 AND periodo_id = $3 AND activa = true`,
    [estudianteId, materiaId, periodoId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);
  if (!actor) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (actor.rol === 'docente' && !actor.docenteId) {
    return NextResponse.json({ error: 'Perfil de docente no vinculado' }, { status: 403 });
  }

  const body = await request.json();

  // ═══════════════════════════════════════════════════════════════
  // INICIO — CARGA MASIVA
  // ═══════════════════════════════════════════════════════════════
  if (body.calificaciones && Array.isArray(body.calificaciones)) {
    const { asignacion_id, calificaciones } = body;

    if (!asignacion_id || calificaciones.length === 0) {
      return NextResponse.json(
        { error: 'Faltan datos para carga masiva (asignacion_id y calificaciones)' },
        { status: 400 }
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const validacion = await validarAsignacionParaActor(client, asignacion_id, actor);
      if (!validacion.ok) {
        await client.query('ROLLBACK');
        return validacion.response;
      }
      const { docente_id, materia_id, periodo_id } = validacion.asignacion;

      const resultados: any[] = [];
      const errores: any[] = [];

      for (const item of calificaciones) {
        const { estudiante_id, nota, observaciones } = item;

        if (!estudiante_id || nota === undefined || nota === '') {
          errores.push({ estudiante_id, error: 'Faltan datos obligatorios' });
          continue;
        }

        const notaNum = parseFloat(nota);
        if (isNaN(notaNum) || notaNum < 0 || notaNum > 20) {
          errores.push({ estudiante_id, error: 'Nota inválida (0-20)' });
          continue;
        }

        const inscrito = await estudianteInscrito(client, estudiante_id, materia_id, periodo_id);
        if (!inscrito) {
          errores.push({ estudiante_id, error: 'El estudiante no está inscrito en esta materia/periodo' });
          continue;
        }

        const existing = await client.query(
          `SELECT c.id FROM calificaciones c
           JOIN asignaciones_docentes a ON c.asignacion_id = a.id
           WHERE c.estudiante_id = $1 AND c.materia_id = $2 AND c.docente_id = $3 AND a.periodo_id = $4`,
          [estudiante_id, materia_id, docente_id, periodo_id]
        );

        let row: any;
        if (existing.rows.length > 0) {
          const upd = await client.query(
            `UPDATE calificaciones
             SET nota = $1, observaciones = $2, fecha_cierre = CURRENT_TIMESTAMP
             WHERE id = $3 RETURNING *`,
            [notaNum, observaciones || null, existing.rows[0].id]
          );
          row = upd.rows[0];
        } else {
          const ins = await client.query(
            `INSERT INTO calificaciones (estudiante_id, materia_id, docente_id, asignacion_id, nota, observaciones)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [estudiante_id, materia_id, docente_id, asignacion_id, notaNum, observaciones || null]
          );
          row = ins.rows[0];
        }

        const [est, mat, doc] = await Promise.all([
          client.query('SELECT nombres, apellidos FROM estudiantes WHERE id = $1', [estudiante_id]),
          client.query('SELECT nombre FROM materias WHERE id = $1', [materia_id]),
          client.query('SELECT nombres, apellidos FROM docentes WHERE id = $1', [docente_id]),
        ]);
        const estudianteNombre = `${est.rows[0]?.apellidos || ''} ${est.rows[0]?.nombres || ''}`.trim();
        const materiaNombre = mat.rows[0]?.nombre;
        const docenteNombre = `${doc.rows[0]?.apellidos || ''} ${doc.rows[0]?.nombres || ''}`.trim();

        await client.query(
          `INSERT INTO auditoria (tabla_afectada, accion, usuario_id, datos_nuevos)
           VALUES ('calificaciones','INSERT',$1,$2)`,
          [
            actor.userId,
            JSON.stringify({
              ...row,
              estudiante_nombre: estudianteNombre,
              materia_nombre: materiaNombre,
              docente_nombre: docenteNombre,
              resumen: `Nota ${notaNum}/20 a ${estudianteNombre} en ${materiaNombre} (carga masiva)`,
            }),
          ]
        );

        resultados.push(row);
      }

      await client.query('COMMIT');
      return NextResponse.json({
        success: true,
        guardadas: resultados.length,
        errores: errores.length > 0 ? errores : undefined,
        calificaciones: resultados,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error POST bulk calificaciones:', error);
      return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    } finally {
      client.release();
    }
  }
  // ═══════════════════════════════════════════════════════════════
  // FIN — CARGA MASIVA
  // ═══════════════════════════════════════════════════════════════

  // ── FLUJO INDIVIDUAL ──
  const client = await pool.connect();
  try {
    const { estudiante_id, materia_id, docente_id, asignacion_id, nota, observaciones } = body;

    if (!estudiante_id || !materia_id || !docente_id || !asignacion_id || nota === undefined) {
      return NextResponse.json({ error: 'Faltan datos obligatorios' }, { status: 400 });
    }

    const validacion = await validarAsignacionParaActor(client, asignacion_id, actor);
    if (!validacion.ok) {
      return validacion.response;
    }
    const asignacion = validacion.asignacion;

    const notaNum = parseFloat(nota);
    if (isNaN(notaNum) || notaNum < 0 || notaNum > 20) {
      return NextResponse.json({ error: 'Nota inválida (0-20)' }, { status: 400 });
    }

    const inscrito = await estudianteInscrito(client, estudiante_id, asignacion.materia_id, asignacion.periodo_id);
    if (!inscrito) {
      return NextResponse.json(
        { error: 'El estudiante no está inscrito en esta materia/periodo' },
        { status: 400 }
      );
    }

    const existing = await client.query(
      `SELECT c.id FROM calificaciones c
       JOIN asignaciones_docentes a ON c.asignacion_id = a.id
       WHERE c.estudiante_id = $1 AND c.materia_id = $2 AND c.docente_id = $3 AND a.periodo_id = $4`,
      [estudiante_id, materia_id, docente_id, asignacion.periodo_id]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: 'Ya existe una calificación para este estudiante en esta materia y periodo' },
        { status: 400 }
      );
    }

    const result = await client.query(
      `INSERT INTO calificaciones (estudiante_id, materia_id, docente_id, asignacion_id, nota, observaciones)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [estudiante_id, materia_id, docente_id, asignacion_id, notaNum, observaciones]
    );

    const [est, mat, doc] = await Promise.all([
      client.query('SELECT nombres, apellidos FROM estudiantes WHERE id = $1', [estudiante_id]),
      client.query('SELECT nombre FROM materias WHERE id = $1', [materia_id]),
      client.query('SELECT nombres, apellidos FROM docentes WHERE id = $1', [docente_id]),
    ]);

    const estudianteNombre = `${est.rows[0]?.apellidos || ''} ${est.rows[0]?.nombres || ''}`.trim();
    const materiaNombre = mat.rows[0]?.nombre;
    const docenteNombre = `${doc.rows[0]?.apellidos || ''} ${doc.rows[0]?.nombres || ''}`.trim();

    await pool.query(
      `INSERT INTO auditoria (tabla_afectada, accion, usuario_id, datos_nuevos)
       VALUES ('calificaciones','INSERT',$1,$2)`,
      [
        actor.userId,
        JSON.stringify({
          ...result.rows[0],
          estudiante_nombre: estudianteNombre,
          materia_nombre: materiaNombre,
          docente_nombre: docenteNombre,
          resumen: `Nota ${notaNum}/20 a ${estudianteNombre} en ${materiaNombre}`,
        }),
      ]
    );

    return NextResponse.json({ calificacion: result.rows[0] });
  } catch (error) {
    console.error('Error POST calificaciones:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}
