/**
 * Database connection for STonIE Notes.
 * Uses Drizzle ORM with node-postgres.
 */

require('dotenv').config();
const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');
const schema = require('./schema');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://claude:claude@localhost:5432/stonie_notes',
});

const db = drizzle(pool, { schema });

module.exports = { db, pool };
