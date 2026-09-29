const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function testData() {
  try {
    console.log('🔍 Verificando datos en la base de datos...\n');

    // Test 1: Periodos
    const periodos = await pool.query('SELECT * FROM periodos ORDER BY numero');
    console.log('✅ Periodos:', periodos.rows.length);
    periodos.rows.forEach(p => console.log(`   - ${p.numero}: ${p.nombre}`));

    // Test 2: Estudiantes
    const estudiantes = await pool.query('SELECT id, cedula, nombres, apellidos, periodo_id FROM estudiantes WHERE activo = true LIMIT 3');
    console.log('\n✅ Estudiantes activos (muestra primeros 3):', estudiantes.rows.length);
    estudiantes.rows.forEach(e => {
      console.log(`   - ${e.nombres} ${e.apellidos} (Período: ${e.periodo_id})`);
    });

    if (estudiantes.rows.length === 0) {
      console.log('   ⚠️  No hay estudiantes activos');
      return;
    }

    // Test 3: Inscripciones
    const estId = estudiantes.rows[0].id;
    const inscripciones = await pool.query(
      'SELECT im.*, m.nombre as materia FROM inscripciones_materias im JOIN materias m ON m.id = im.materia_id WHERE im.estudiante_id = $1 AND im.activa = true',
      [estId]
    );
    console.log(`\n✅ Inscripciones para ${estudiantes.rows[0].nombres}:`, inscripciones.rows.length);
    const porPeriodo = {};
    inscripciones.rows.forEach(i => {
      if (!porPeriodo[i.periodo_id]) porPeriodo[i.periodo_id] = [];
      porPeriodo[i.periodo_id].push(i.materia);
    });
    Object.entries(porPeriodo).forEach(([p, mats]) => {
      console.log(`   - Período ${p}: ${mats.length} materias`);
    });

    // Test 4: Calificaciones
    const calificaciones = await pool.query(
      'SELECT c.*, m.nombre as materia, ad.periodo_id FROM calificaciones c JOIN materias m ON m.id = c.materia_id JOIN asignaciones_docentes ad ON ad.id = c.asignacion_id WHERE c.estudiante_id = $1 LIMIT 5',
      [estId]
    );
    console.log(`\n✅ Calificaciones:`, calificaciones.rows.length);
    calificaciones.rows.forEach(c => {
      console.log(`   - ${c.materia} (P${c.periodo_id}): ${c.nota}/20`);
    });

    console.log('\n✅ Base de datos lista para generar boletines');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

testData();
