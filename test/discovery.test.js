import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findAccessory,
  normalizeSetupCode,
  parseHostPort,
  parseMdnsResults,
  parseTxt,
  platformIdFromDeviceId,
} from '../src/hap/discovery.js';
import { deviceIdFromPairingData, pairMethodFor, withTimeout } from '../src/hap/client.js';
import { MDNS_RESULTS } from './helpers/fixtures.js';

test('parseTxt turns raw TXT entries into an object', () => {
  assert.deepEqual(parseTxt(['id=AA:BB', 'c#=2', 'broken', 'sf=1']), {
    id: 'AA:BB',
    'c#': '2',
    sf: '1',
  });
  assert.deepEqual(parseTxt(undefined), {});
});

test('parseMdnsResults extracts the HomeKit accessories', () => {
  const accessories = parseMdnsResults([...MDNS_RESULTS, { name: 'no txt', port: 1 }]);
  assert.equal(accessories.length, 2);
  const [bridge, eve] = accessories;
  assert.deepEqual(bridge, {
    id: '1A:2B:3C:4D:5E:6F',
    name: 'Acme Bridge 1A2B',
    host: '192.168.1.50', // IPv4 preferred over link-local IPv6
    port: 51826,
    model: 'Acme Bridge',
    category: 2,
    categoryLabel: 'Bridge',
    paired: true,
    featureFlags: 0,
    configNumber: 3,
  });
  assert.equal(eve.name, 'Eve Energy');
  assert.equal(eve.paired, false);
  assert.equal(eve.featureFlags, 1);
});

test('parseMdnsResults lists an accessory answering twice only once', () => {
  assert.equal(parseMdnsResults([MDNS_RESULTS[0], MDNS_RESULTS[0]]).length, 1);
});

test('findAccessory matches id, IP or name, case-insensitively', () => {
  const accessories = parseMdnsResults(MDNS_RESULTS);
  assert.equal(findAccessory(accessories, 'aa:bb:cc:dd:ee:01').name, 'Eve Energy');
  assert.equal(findAccessory(accessories, '192.168.1.50').name, 'Acme Bridge 1A2B');
  assert.equal(findAccessory(accessories, 'eve energy').id, 'AA:BB:CC:DD:EE:01');
  assert.equal(findAccessory(accessories, 'nothing'), null);
});

test('normalizeSetupCode accepts the usual spellings', () => {
  assert.equal(normalizeSetupCode('12345678'), '123-45-678');
  assert.equal(normalizeSetupCode('123-45-678'), '123-45-678');
  assert.equal(normalizeSetupCode(' 123 45 678 '), '123-45-678');
  assert.throws(() => normalizeSetupCode('1234'), /8 digits/);
});

test('parseHostPort reads a manual IP:port target', () => {
  assert.deepEqual(parseHostPort('192.168.1.20:51826'), { host: '192.168.1.20', port: 51826 });
  assert.deepEqual(parseHostPort('[fd00::1]:8080'), { host: 'fd00::1', port: 8080 });
  assert.equal(parseHostPort('Eve Energy'), null);
  assert.equal(parseHostPort('192.168.1.20'), null);
  assert.equal(parseHostPort('lamp.local:80'), null);
});

test('platform id and pairing helpers', () => {
  assert.equal(platformIdFromDeviceId('1A:2B:3C:4D:5E:6F'), '1a2b3c4d5e6f');
  assert.equal(
    deviceIdFromPairingData({ AccessoryPairingID: Buffer.from('1a:2b').toString('hex') }),
    '1A:2B',
  );
  assert.equal(deviceIdFromPairingData(null), null);
  // ff bit 0 -> PairSetupWithAuth (1), otherwise PairSetup (0)
  assert.equal(pairMethodFor(1), 1);
  assert.equal(pairMethodFor(0), 0);
});

test('withTimeout rejects a request that never settles', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 10, 'Slow request'), /timed out/);
  assert.equal(await withTimeout(Promise.resolve(42), 1000, 'Fast request'), 42);
});
