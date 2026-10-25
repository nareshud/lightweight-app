import express from 'express';
import pg from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { databaseConfig } from './config.js';

let pool;
let server;
const secrets = new SecretsManagerClient({ region: process.env.AWS_REGION });

async function main() {
  const mode = process.env.SECRETS_MODE || 'aws';
  let config;
  if (mode === 'local') {
    config = databaseConfig({
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT || '5432',
      username: process.env.DB_USER || 'notes_app',
      password: process.env.LOCAL_DB_PASSWORD,
      dbname: process.env.DB_NAME || 'notes'
    });
    console.log('Local mode: database credentials loaded from environment.');
  } else if (mode === 'aws') {
  if (!process.env.AWS_REGION || !process.env.DB_SECRET_ID) {
    throw new Error('Set AWS_REGION and DB_SECRET_ID in .env');
  }
  const response = await secrets.send(new GetSecretValueCommand({
    SecretId: process.env.DB_SECRET_ID
  }));
  const value = response.SecretString ?? (response.SecretBinary && Buffer.from(response.SecretBinary).toString('utf8'));
  if (!value) throw new Error('Database secret is empty');
    config = databaseConfig(JSON.parse(value));
  } else {
    throw new Error('SECRETS_MODE must be aws or local');
  }
  if (process.env.DB_SSL === 'true') {
    config.ssl = { rejectUnauthorized: true };
    if (process.env.DB_SSL_CA_FILE) config.ssl.ca = await readFile(process.env.DB_SSL_CA_FILE, 'utf8');
  }
  pool = new pg.Pool(config);
  pool.on('error', () => console.error('An idle database connection failed'));
  await pool.query(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(express.json({ limit: '4kb' }));
  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  });
  app.get('/api/notes', async (_req, res) => {
    const { rows } = await pool.query('SELECT id, body, created_at FROM notes ORDER BY id DESC LIMIT 100');
    res.json(rows);
  });
  app.post('/api/notes', async (req, res) => {
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!body || [...body].length > 500) {
      return res.status(400).json({ error: 'Enter a note of 1 to 500 characters.' });
    }
    const { rows } = await pool.query('INSERT INTO notes (body) VALUES ($1) RETURNING id, body, created_at', [body]);
    res.status(201).json(rows[0]);
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  app.use(express.static(fileURLToPath(new URL('./public', import.meta.url))));
  app.use((error, _req, res, _next) => {
    const status = error.status === 400 || error.status === 413 ? error.status : 500;
    if (status === 500) console.error('Request failed:', error.code ?? error.name);
    res.status(status).json({ error: status === 500 ? 'Database request failed. Try again.' : 'Invalid or oversized JSON request.' });
  });
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  server = app.listen(port, host, () => console.log(`Notes app: http://${host}:${port}`));
  server.on('error', () => { console.error('HTTP server failed to start'); void shutdown(1); });
}

async function shutdown(code = 0) {
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  if (server) await new Promise(resolve => server.close(resolve));
  if (pool) await pool.end();
  secrets.destroy();
  process.exitCode = code;
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
main().catch(async error => {
  // Do not log SDK/connection error objects: they can contain sensitive data.
  console.error('Startup failed. Check database settings and AWS access when using aws mode. Error type:', error.name);
  await shutdown(1);
});
