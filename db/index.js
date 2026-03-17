/**
 * Database connection for STonIE Notes.
 * Uses Drizzle ORM with node-postgres.
 */

const dotenv = require('dotenv');
const dotenvExpand = require('dotenv-expand');
dotenvExpand.expand(dotenv.config());
const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');
const schema = require('./schema');

const isServerless = !!process.env.VERCEL;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://claude:claude@localhost:5432/stonie_notes',
  ...(isServerless && {
    max: 1,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 5000,
  }),
});

const db = drizzle(pool, { schema });

module.exports = { db, pool };
