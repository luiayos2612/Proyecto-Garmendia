import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import ExcelJS from 'exceljs';
import { join } from 'path';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ============================================
// MAPEO DE CELDAS - AJUSTA SEGÚN TU PLANTILLA EXACTA
// Abre Boletines.xlsx y verifica estas coordenadas
// ============================================
const CELL_MAP = {
  // --- SECCIÓN III: DATOS DEL ESTUDIANTE ---
  estudiante: {
    cedula: 'C9',           // Cédula de Identidad
    apellidos: 'C10',       // Apellidos (rango C10:I10)
    nombres: 'K10',         // Nombres (rango K10:P10)
    fecha_nacimiento: 'K9', // Fecha de Nacimiento (rango K9:P9)
    lugar_nacimiento: 'C11',   // Lugar de Nacimiento (rango C11:I11)
    entidad_federal: 'K11',    // Entidad Federal o País (rango K11:P11)
  },
  
  // --- SECCIÓN V: PENSUM POR PERIODOS ---
  // Formato: { filaInicio, colNota, colMes, colAño }
  periodos: {
    1: { nombre: 'UNO',   filaInicio: 23, colNota: 'C', colMes: 'F', colAño: 'G' },
    2: { nombre: 'DOS',   filaInicio: 23, colNota: 'J', colMes: 'M', colAño: 'N' },
    3: { nombre: 'TRES',  filaInicio: 31, colNota: 'C', colMes: 'F', colAño: 'G' },
    4: { nombre: 'CUATRO',filaInicio: 31, colNota: 'K', colMes: 'M', colAño: 'N' },
    5: { nombre: 'CINCO', filaInicio: 38, colNota: 'C', colMes: 'F', colAño: 'G' },
    6: { nombre: 'SEIS',  filaInicio: 38, colNota: 'J', colMes: 'M', colAño: 'N' },
  },
  
  // Orden exacto de materias obligatorias en el Excel (SIN la componente de participación)
  materiasOrden: [
    'LENGUA CULTURA Y COMUNICACIÓN',
    'MATEMATICA',
    'MEMORIA TERRITORIO Y CIUDADANIA',
    'CIENCIAS NATURALES'
  ],
  
  // Secciones especiales (Periodo 6)
  idiomas: { aprobado: 'D44', fecha: 'F44', periodo: 'H44' },
  oficio:  { aprobado: 'K44', fecha: 'M44', periodo: 'O44' },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { estudiante_id, periodo_id, ano_escolar = '2025-2026' } = body;

    if (!estudiante_id || !periodo_id) {
      return NextResponse.json(
        { error: 'Faltan estudiante_id o periodo_id' },
        { status: 400 }
      );
    }

    // 1. DATOS DEL ESTUDIANTE
    const estRes = await pool.query(
      `SELECT e.* FROM estudiantes e WHERE e.id = $1`,
      [estudiante_id]
    );

    if (estRes.rows.length === 0) {
      return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
    }

    const estudiante = estRes.rows[0];

    // Obtener nombre del período seleccionado
    const periodoRes = await pool.query(
      `SELECT nombre FROM periodos WHERE numero = $1`,
      [periodo_id]
    );

    const periodo_nombre = periodoRes.rows.length > 0 ? periodoRes.rows[0].nombre : `Período ${periodo_id}`;

    // 2. NOTAS DEL PERIODO SELECCIONADO - Con fecha de carga
    const notasRes = await pool.query(
      `SELECT
        m.nombre as materia,
        m.codigo,
        ad.periodo_id,
        MAX(c.nota) as nota,
        MAX(c.fecha_cierre) as fecha_carga
      FROM calificaciones c
      JOIN materias m ON m.id = c.materia_id
      JOIN asignaciones_docentes ad ON ad.id = c.asignacion_id
      WHERE c.estudiante_id = $1 AND ad.periodo_id = $2 AND ad.ano_escolar = $3
      GROUP BY m.nombre, m.codigo, ad.periodo_id
      ORDER BY m.nombre`,
      [estudiante_id, periodo_id, ano_escolar]
    );

    // Organizar notas del periodo seleccionado - mapear por nombre exacto
    const notasMap = new Map(
      notasRes.rows.map((n: any) => [
        n.materia.toUpperCase().trim(),
        n
      ])
    );

    // 3. CARGAR PLANTILLA
    const templatePath = join(process.cwd(), 'public', 'templates', 'boletines_template.xlsx');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const worksheet = workbook.getWorksheet(1);

    if (!worksheet) {
      return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 500 });
    }

    // 4. LLENAR SECCIÓN III - DATOS DEL ESTUDIANTE
    const map = CELL_MAP.estudiante;
    worksheet.getCell(map.cedula).value = estudiante.cedula || '';
    worksheet.getCell(map.apellidos).value = estudiante.apellidos || '';
    worksheet.getCell(map.nombres).value = estudiante.nombres || '';
    worksheet.getCell(map.fecha_nacimiento).value = estudiante.fecha_nacimiento 
      ? new Date(estudiante.fecha_nacimiento).toLocaleDateString('es-VE') 
      : '';
    // Tu BD no tiene estos campos aún; se dejan vacíos para llenar manualmente
    worksheet.getCell(map.lugar_nacimiento).value = '';
    worksheet.getCell(map.entidad_federal).value = '';

    // 5. LLENAR SECCIÓN V - NOTAS DEL PERIODO SELECCIONADO
    const pMap = CELL_MAP.periodos[periodo_id as keyof typeof CELL_MAP.periodos];
    if (!pMap) {
      return NextResponse.json(
        { error: `Periodo ${periodo_id} no válido` },
        { status: 400 }
      );
    }

    // LIMPIEZA: Borrar datos previos del período antes de llenar con nuevos (solo 4 materias)
    for (let i = 0; i < 4; i++) {
      const fila = pMap.filaInicio + i;
      worksheet.getCell(`${pMap.colNota}${fila}`).value = null;
      worksheet.getCell(`${pMap.colMes}${fila}`).value = null;
      worksheet.getCell(`${pMap.colAño}${fila}`).value = null;
    }

    // 4 materias obligatorias - cargar nota, mes y año
    CELL_MAP.materiasOrden.forEach((materiaNombre, index) => {
      const fila = pMap.filaInicio + index;
      const normalizado = materiaNombre.toUpperCase().trim();
      const notaData = notasMap.get(normalizado);

      if (notaData && notaData.nota !== null && notaData.nota !== undefined) {
        const nota20 = parseFloat(notaData.nota);

        // Validar que la nota sea un número válido entre 0 y 20
        if (!isNaN(nota20) && nota20 >= 0 && nota20 <= 20) {
          // Cargar nota en columna N°
          worksheet.getCell(`${pMap.colNota}${fila}`).value = nota20;

          // Extraer mes y año de la fecha de carga
          if (notaData.fecha_carga) {
            const fecha = new Date(notaData.fecha_carga);
            const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
            const año = fecha.getFullYear().toString();
            worksheet.getCell(`${pMap.colMes}${fila}`).value = mes;
            worksheet.getCell(`${pMap.colAño}${fila}`).value = año;
          }
        }
      }
    });

    // 6. IDIOMAS Y OFICIO (solo si es Periodo 6)
    if (periodo_id === 6) {
      const tieneIdiomas = notasRes.rows.some((n: any) =>
        n.materia.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('IDIOMA')
      );
      const tieneOficio = notasRes.rows.some((n: any) =>
        n.materia.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('OFICIO')
      );

      worksheet.getCell(CELL_MAP.idiomas.aprobado).value = tieneIdiomas ? 'APROBADO' : '';
      worksheet.getCell(CELL_MAP.oficio.aprobado).value = tieneOficio ? 'APROBADO' : '';
    }

    // 7. GENERAR ARCHIVO
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Boletin_${estudiante.apellidos}_${estudiante.nombres}.xlsx"`,
      },
    });

  } catch (error) {
    console.error('Error exportando boletín:', error);
    return NextResponse.json(
      { error: 'Error al generar boletín: ' + (error as Error).message },
      { status: 500 }
    );
  }
}