const ExcelJS = require('exceljs');
const fs = require('fs');

async function analizarPlantilla() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('./public/templates/boletines_template.xlsx');
  const worksheet = workbook.getWorksheet(1);

  console.log('\n=== ANÁLISIS DE ESTRUCTURA EXCEL ===\n');

  // Dimensiones
  console.log('📐 DIMENSIONES:');
  console.log(`  Filas: ${worksheet.rowCount}`);
  console.log(`  Columnas: ${worksheet.columnCount}\n`);

  // Fusiones de celdas
  console.log('🔗 CELDAS FUSIONADAS:');
  if (worksheet._mergedCells && worksheet._mergedCells.length > 0) {
    worksheet._mergedCells.forEach(merge => {
      console.log(`  ${merge}`);
    });
  } else {
    console.log('  (ninguna detectada)');
  }

  // Primeras 45 filas con contenido
  console.log('\n📝 CONTENIDO (Filas 1-45):');
  for (let row = 1; row <= 45; row++) {
    let contenido = [];
    for (let col = 1; col <= 10; col++) {
      const cell = worksheet.getCell(row, col);
      if (cell.value) {
        contenido.push(`[Col${col}]: "${cell.value}"`);
      }
    }
    if (contenido.length > 0) {
      console.log(`  Fila ${row}: ${contenido.join(' | ')}`);
    }
  }

  // Estilos de celdas importantes
  console.log('\n🎨 ESTILOS DETECTADOS:');
  const cellsConEstilo = [];

  for (let row = 1; row <= 45; row++) {
    for (let col = 1; col <= 10; col++) {
      const cell = worksheet.getCell(row, col);
      if (cell.font || cell.fill || cell.border || cell.alignment) {
        const coord = cell.address;
        cellsConEstilo.push({
          cell: coord,
          value: cell.value,
          font: cell.font ? JSON.stringify(cell.font) : null,
          fill: cell.fill ? JSON.stringify(cell.fill) : null,
          border: cell.border ? 'SÍ' : 'NO',
          alignment: cell.alignment ? JSON.stringify(cell.alignment) : null
        });
      }
    }
  }

  cellsConEstilo.slice(0, 20).forEach(s => {
    console.log(`  ${s.cell}: ${s.value || '(vacío)'}`);
    if (s.font) console.log(`    Font: ${s.font}`);
    if (s.fill) console.log(`    Fill: ${s.fill}`);
    if (s.border) console.log(`    Border: SÍ`);
  });

  console.log('\n✅ Análisis completado.\n');
}

analizarPlantilla().catch(console.error);
