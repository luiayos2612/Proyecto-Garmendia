import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id: estudianteId } = await params;

    const estRes = await client.query(
      `SELECT e.*, p.nombre as periodo_nombre 
       FROM estudiantes e 
       LEFT JOIN periodos p ON e.periodo_id = p.numero 
       WHERE e.id = $1`,
      [estudianteId]
    );

    if (estRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
    }

    const estudiante = estRes.rows[0];
    const periodoActual = estudiante.periodo_id;

    if (periodoActual >= 6) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'El estudiante ya está en el último periodo' }, { status: 400 });
    }

    // ─────────────────────────────────────────────────────────────
    // VALIDACIÓN 1: Solvencia de pagos
    // ─────────────────────────────────────────────────────────────
    const inscripcionRes = await client.query(
      `SELECT COUNT(*) as count FROM pagos 
       WHERE estudiante_id = $1 AND tipo = 'inscripcion' AND estado = 'confirmado'`,
      [estudianteId]
    );
    const tieneInscripcion = parseInt(inscripcionRes.rows[0].count) > 0;

    const mensualidadesRes = await client.query(
      `SELECT COUNT(*) as count FROM pagos 
       WHERE estudiante_id = $1 AND tipo = 'mensualidad' AND estado = 'confirmado'`,
      [estudianteId]
    );
    const mensualidadesPagadas = parseInt(mensualidadesRes.rows[0].count);
    const solvente = tieneInscripcion && mensualidadesPagadas >= 6;

    // ─────────────────────────────────────────────────────────────
    // VALIDACIÓN 2: Notas (1 sola calificación por materia >= 10)
    // ✅ MODIFICADO: Ya no se promedian 4 lapsos. 
    //    Cada materia debe tener 1 nota registrada y esa nota >= 10.
    // ─────────────────────────────────────────────────────────────
    const materiasRes = await client.query(
      `SELECT 
         im.materia_id, 
         m.nombre, 
         c.nota,
         CASE WHEN c.id IS NOT NULL THEN 1 ELSE 0 END as tiene_nota
       FROM inscripciones_materias im
       JOIN materias m ON m.id = im.materia_id
       LEFT JOIN calificaciones c ON c.estudiante_id = im.estudiante_id 
         AND c.materia_id = im.materia_id
         AND c.asignacion_id IN (
           SELECT id FROM asignaciones_docentes 
           WHERE periodo_id = im.periodo_id AND materia_id = im.materia_id
         )
       WHERE im.estudiante_id = $1 AND im.periodo_id = $2 AND im.activa = true`,
      [estudianteId, periodoActual]
    );

    if (materiasRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'El estudiante no tiene materias inscritas en este periodo' }, { status: 400 });
    }

    // Verificar que TODAS las materias tengan nota registrada
    const materiasSinNota = materiasRes.rows.filter((m: any) => m.tiene_nota === 0);
    if (materiasSinNota.length > 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({
        error: `Faltan calificaciones por registrar en ${materiasSinNota.length} materia(s)`,
        materias_pendientes: materiasSinNota.map((m: any) => m.nombre)
      }, { status: 400 });
    }

    // Verificar que TODAS las notas sean >= 10
    const materiasReprobadas = materiasRes.rows.filter((m: any) => parseFloat(m.nota) < 10);
    const todasAprobadas = materiasReprobadas.length === 0;

    // Calcular promedio general del periodo (promedio simple de las notas únicas)
    const promedioGeneral = materiasRes.rows.reduce((sum: number, m: any) => sum + parseFloat(m.nota), 0) / materiasRes.rows.length;

    if (!solvente) {
      await client.query('ROLLBACK');
      return NextResponse.json({
        error: `El estudiante no está solvente. Inscripción: ${tieneInscripcion ? 'Sí' : 'No'}, Mensualidades: ${mensualidadesPagadas}/6`
      }, { status: 400 });
    }

    if (!todasAprobadas) {
      await client.query('ROLLBACK');
      return NextResponse.json({
        error: 'El estudiante no ha aprobado todas las materias. Se requiere nota ≥ 10 en cada materia.',
        materias_reprobadas: materiasReprobadas.map((m: any) => ({ 
          nombre: m.nombre, 
          nota: parseFloat(m.nota).toFixed(1) 
        }))
      }, { status: 400 });
    }

    // ─────────────────────────────────────────────────────────────
    // GUARDAR HISTORIAL ACADÉMICO del periodo que se cierra
    // ✅ MODIFICADO: Se guarda 1 nota por materia (no 4 lapsos)
    // ─────────────────────────────────────────────────────────────
    for (const mat of materiasRes.rows) {
      await client.query(
        `INSERT INTO historial_academico 
         (estudiante_id, periodo_id, materia_id, nota, estado_materia)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (estudiante_id, periodo_id, materia_id) 
         DO UPDATE SET nota = EXCLUDED.nota, estado_materia = EXCLUDED.estado_materia`,
        [estudianteId, periodoActual, mat.materia_id,
         parseFloat(mat.nota).toFixed(2), 'aprobada']
      );
    }

    // ─────────────────────────────────────────────────────────────
    // CREAR CUPO para el siguiente periodo
    // ─────────────────────────────────────────────────────────────
    const periodoDestino = periodoActual + 1;
    const existeCupo = await client.query(
      `SELECT id FROM cupos WHERE estudiante_id = $1 AND periodo_destino = $2 AND estado = 'pendiente'`,
      [estudianteId, periodoDestino]
    );

    if (existeCupo.rows.length > 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Ya existe un cupo pendiente para este periodo' }, { status: 400 });
    }

    await client.query(
      `INSERT INTO cupos (estudiante_id, periodo_origen, periodo_destino, estado, pagos_solvencia, materias_aprobadas, promedio_general)
       VALUES ($1,$2,$3,'pendiente',$4,$5,$6)`,
      [estudianteId, periodoActual, periodoDestino, solvente, todasAprobadas, promedioGeneral.toFixed(2)]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      message: `Estudiante aprobado para Periodo ${periodoDestino}. Cupo creado y pendiente de aprobación del director.`,
      data: {
        periodo_origen: periodoActual,
        periodo_destino: periodoDestino,
        promedio_general: promedioGeneral.toFixed(2),
        mensualidades_pagadas: mensualidadesPagadas,
        materias_aprobadas: materiasRes.rows.length,
        materias_total: materiasRes.rows.length
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error POST aprobar:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}