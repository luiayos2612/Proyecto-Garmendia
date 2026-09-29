// Este archivo crea UNA SOLA conexión a la base de datos
// que todos los demás archivos del proyecto compartirán.
// Configuramos SSL explícitamente para que funcione con Neon.

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false  // Permite conexiones SSL con Neon
  },
});

export default pool;