import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseConfig } from './config.js';

const secret = { host: 'localhost', username: 'demo', password: 'private', dbname: 'notes' };
test('maps AWS secret fields to PostgreSQL connection fields', () => {
  const config = databaseConfig({ ...secret, port: '5433' });
  assert.equal(config.user, 'demo');
  assert.equal(config.database, 'notes');
  assert.equal(config.port, 5433);
  assert.equal(config.password, 'private');
});
test('rejects missing credentials and invalid ports', () => {
  for (const key of ['host', 'username', 'password', 'dbname']) {
    assert.throws(() => databaseConfig({ ...secret, [key]: '' }));
  }
  for (const port of [0, 65536, 'invalid', 1.5]) {
    assert.throws(() => databaseConfig({ ...secret, port }));
  }
});
