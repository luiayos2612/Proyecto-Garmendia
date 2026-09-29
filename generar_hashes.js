const bcrypt = require('bcryptjs');

async function main() {
  const hash1 = await bcrypt.hash('Adm1n@2026!', 10);
  const hash2 = await bcrypt.hash('All_2612.', 10);
  
  console.log('\n=== HASHES GENERADOS ===\n');
  console.log('Usuario 1 - admin@garmendia.local');
  console.log('Hash:', hash1);
  console.log('\nUsuario 2 - auditor@garmendia.local');
  console.log('Hash:', hash2);
  console.log('\n========================\n');
}

main();
