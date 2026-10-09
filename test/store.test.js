import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PairingStore } from '../src/store.js';

test('PairingStore persists pairings across instances', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'homekit-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const store = new PairingStore(dir);
  await store.load();
  assert.deepEqual(store.list(), []);

  store.set({ id: 'aa:bb:cc:dd:ee:ff', name: 'Lamp', host: '10.0.0.2', port: 80, pairingData: {} });
  store.update('AA:BB:CC:DD:EE:FF', { host: '10.0.0.3' });
  await store.save();

  const file = path.join(dir, 'pairings.json');
  const content = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(content.version, 1);
  assert.equal((await stat(file)).mode & 0o777, 0o600);

  const reloaded = new PairingStore(dir);
  await reloaded.load();
  assert.equal(reloaded.get('aa:bb:cc:dd:ee:ff').host, '10.0.0.3');

  assert.equal(reloaded.delete('AA:BB:CC:DD:EE:FF'), true);
  assert.equal(reloaded.get('AA:BB:CC:DD:EE:FF'), null);
});
