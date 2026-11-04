import test from 'node:test';
import assert from 'node:assert/strict';
import { recordId } from './record-id.ts';

test('record IDs work when an HTTP preview has getRandomValues but no randomUUID', () => {
  const random = { getRandomValues(bytes) { bytes.fill(255); return bytes; } };
  assert.equal(recordId(random), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
  const ids = Array.from({ length: 100 }, () => recordId({ getRandomValues: bytes => crypto.getRandomValues(bytes) }));
  assert.equal(new Set(ids).size, 100);
  assert.ok(ids.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)));
});
test('record IDs retain the native secure-context implementation when available', () => {
  assert.equal(recordId({ randomUUID() { return 'native-id'; } }), 'native-id');
});
