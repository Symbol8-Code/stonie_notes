require('dotenv').config();

/** @type {import('drizzle-kit').Config} */
module.exports = {
  schema: './db/schema.js',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://claude:claude@localhost:5432/stonie_notes',
  },
};
