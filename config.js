export function databaseConfig(secret) {
  for (const key of ['host', 'username', 'password', 'dbname']) {
    if (typeof secret[key] !== 'string' || !secret[key].trim()) {
      throw new Error(`Database secret requires a non-empty ${key}`);
    }
  }
  const port = Number(secret.port ?? 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Database secret has an invalid port');
  }
  return {
    host: secret.host, port, user: secret.username,
    password: secret.password, database: secret.dbname,
    max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
    query_timeout: 10000, statement_timeout: 10000
  };
}
