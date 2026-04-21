const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const asBool = (value) => {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on', 'require'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off', 'disable', 'disabled'].includes(normalized)) return false;
  return undefined;
};

// Neon provides a single connection string; prefer it when present.
const connectionString = process.env.DATABASE_URL;

// Neon requires SSL. When DATABASE_URL is set, SSL is enabled by default.
// Override with PGSSL=false only if you know what you're doing.
const pgSslEnv = asBool(process.env.PGSSL);
const ssl = (pgSslEnv === false)
  ? undefined
  : (pgSslEnv === true || connectionString)
    ? { rejectUnauthorized: false }
    : undefined;

const pool = new Pool(
  connectionString
    ? {
        connectionString,
        ssl,
      }
    : {
        host: process.env.PGHOST,
        port: process.env.PGPORT,
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        ssl,
      }
);

const sanitizeSearchPath = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return 'public';

  // Allow identifiers separated by commas (e.g. "public, extensions").
  // Reject anything that could break SQL.
  const ok = /^[a-zA-Z0-9_\s,]+$/.test(raw);
  return ok ? raw : 'public';
};

// Neon pooler rejects startup `options=-c ...`, so set schema after connect.
const searchPath = sanitizeSearchPath(process.env.PGSCHEMA);
pool.on('connect', (client) => {
  client
    .query(`SET search_path TO ${searchPath}`)
    .catch((err) => console.warn('[db] Failed to set search_path:', err.message));
});

pool.on('error', (err) => {
  console.error('Unexpected error on PostgreSQL client', err);
  process.exit(-1);
});

module.exports = pool;
