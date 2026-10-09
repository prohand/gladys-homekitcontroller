import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapAccessory, mapButtons, toHapValue, COVER_STATE } from '../src/mapping/index.js';
import { hsToRgbInt, rgbIntToHs } from '../src/mapping/color.js';
import { shortType } from '../src/hap/uuid.js';
import { BRIDGE_DATABASE, BUTTON_DATABASE } from './helpers/fixtures.js';

const [bridge, bulb, sensor, blind] = BRIDGE_DATABASE.accessories;

// Value getter built from the database values of one accessory.
function getterFor(accessory, overrides = {}) {
  const values = new Map();
  for (const service of accessory.services) {
    for (const char of service.characteristics) {
      values.set(char.iid, char.value);
    }
  }
  for (const [iid, value] of Object.entries(overrides)) {
    values.set(Number(iid), value);
  }
  return (iid) => values.get(Number(iid));
}

const byKey = (features, key) => features.find((f) => f.key === key);

test('shortType normalizes long Apple UUIDs and short codes', () => {
  assert.equal(shortType('00000025-0000-1000-8000-0026BB765291'), '25');
  assert.equal(shortType('000000CE-0000-1000-8000-0026bb765291'), 'CE');
  assert.equal(shortType('0025'), '25');
  assert.equal(shortType('8'), '8');
  assert.equal(
    shortType('E863F10D-079E-48FF-8F27-9C2605A29F52'),
    'E863F10D-079E-48FF-8F27-9C2605A29F52',
  );
});

test('an accessory without supported service maps to no feature', () => {
  const { info, features } = mapAccessory(bridge);
  assert.equal(info.name, 'Acme Bridge');
  assert.deepEqual(features, []);
});

test('a color bulb maps to on/off, brightness, color and temperature', () => {
  const { info, features } = mapAccessory(bulb);
  assert.equal(info.name, 'Living room bulb');
  assert.equal(info.manufacturer, 'Acme');
  assert.equal(info.identifyIid, 2);
  assert.deepEqual(
    features.map((f) => [f.key, f.category, f.type]),
    [
      ['10', 'light', 'binary'],
      ['11', 'light', 'brightness'],
      ['color-12', 'light', 'color'],
      ['14', 'light', 'temperature'],
    ],
  );
  const get = getterFor(bulb);
  assert.equal(byKey(features, '10').read(get), 0);
  assert.equal(byKey(features, '11').read(get), 40);
  assert.equal(byKey(features, 'color-12').read(get), 0xff0000);
  const temperature = byKey(features, '14');
  assert.equal(temperature.min, 153);
  assert.equal(temperature.max, 454);
  assert.equal(temperature.read(get), 300);
  for (const feature of features) {
    assert.equal(feature.read_only, false);
    assert.equal(feature.has_feedback, true);
  }
});

test('writes are converted to the characteristic format', () => {
  const { features } = mapAccessory(bulb);
  assert.deepEqual(byKey(features, '10').write(1), { 10: true });
  assert.deepEqual(byKey(features, '10').write(0), { 10: false });
  // Clamped to the characteristic bounds and rounded (int format).
  assert.deepEqual(byKey(features, '11').write(120.4), { 11: 100 });
  assert.deepEqual(byKey(features, 'color-12').write(0x00ff00), { 12: 120, 13: 100 });
  assert.deepEqual(byKey(features, '14').write(100), { 14: 153 });
});

test('sensors are read-only, contact state is inverted for Gladys', () => {
  const { features } = mapAccessory(sensor);
  assert.deepEqual(
    features.map((f) => [f.key, f.category, f.type, f.unit]),
    [
      ['10', 'temperature-sensor', 'decimal', 'celsius'],
      ['20', 'opening-sensor', 'binary', undefined],
      ['30', 'battery', 'integer', 'percent'],
      ['31', 'battery-low', 'binary', undefined],
    ],
  );
  for (const feature of features) {
    assert.equal(feature.read_only, true);
    assert.equal(feature.write, undefined);
  }
  const get = getterFor(sensor);
  assert.equal(byKey(features, '10').read(get), 21.5);
  // HAP 1 = no contact (open) -> Gladys 0 (open)
  assert.equal(byKey(features, '20').read(get), 0);
  assert.equal(byKey(features, '20').read(getterFor(sensor, { 20: 0 })), 1);
  assert.equal(byKey(features, '30').read(get), 80);
  // Only "pr" characteristics are subscribed to when they support events.
  assert.deepEqual(byKey(features, '31').events, []);
  assert.deepEqual(byKey(features, '30').events, [30]);
});

test('a window covering maps to position and open/stop/close state', () => {
  const { features } = mapAccessory(blind);
  const position = byKey(features, '10');
  const state = byKey(features, 'state-11');
  assert.equal(position.category, 'shutter');
  assert.equal(position.type, 'position');
  assert.equal(position.read_only, false);
  assert.deepEqual(position.write(55), { 11: 55 });
  assert.equal(state.type, 'state');
  assert.deepEqual(state.write(COVER_STATE.OPEN), { 11: 100 });
  assert.deepEqual(state.write(COVER_STATE.CLOSE), { 11: 0 });
  // No HoldPosition characteristic: stop = target the current position.
  assert.deepEqual(state.write(COVER_STATE.STOP, getterFor(blind, { 10: 42 })), { 11: 42 });
  assert.equal(state.read(getterFor(blind, { 12: 0 })), COVER_STATE.CLOSE);
  assert.equal(state.read(getterFor(blind, { 12: 1 })), COVER_STATE.OPEN);
  assert.equal(state.read(getterFor(blind, { 12: 2 })), COVER_STATE.STOP);
});

test('several services of the same kind get distinct names', () => {
  const accessory = {
    aid: 1,
    services: [
      {
        iid: 1,
        type: '3E',
        characteristics: [{ iid: 2, type: '23', perms: ['pr'], value: 'Double switch' }],
      },
      {
        iid: 10,
        type: '49',
        characteristics: [
          { iid: 11, type: '25', perms: ['pr', 'pw', 'ev'], format: 'bool' },
          { iid: 12, type: '23', perms: ['pr'], value: 'Left' },
        ],
      },
      {
        iid: 20,
        type: '49',
        characteristics: [{ iid: 21, type: '25', perms: ['pr', 'pw', 'ev'], format: 'bool' }],
      },
    ],
  };
  const { features } = mapAccessory(accessory);
  assert.deepEqual(
    features.map((f) => f.name),
    ['Left - Switch', 'Switch 2'],
  );
});

test('toHapValue handles bool and integer formats', () => {
  assert.equal(toHapValue({ format: 'bool' }, 1), true);
  assert.equal(toHapValue({ format: 'bool' }, 0), false);
  assert.equal(toHapValue({ format: 'uint8', minValue: 0, maxValue: 100 }, 33.6), 34);
  assert.equal(toHapValue({ format: 'float', minValue: 10, maxValue: 38 }, 5), 10);
});

test('color conversions round-trip on primary colors', () => {
  assert.equal(hsToRgbInt(0, 100), 0xff0000);
  assert.equal(hsToRgbInt(120, 100), 0x00ff00);
  assert.equal(hsToRgbInt(240, 100), 0x0000ff);
  assert.equal(hsToRgbInt(0, 0), 0xffffff);
  assert.deepEqual(rgbIntToHs(0xff0000), { hue: 0, saturation: 100 });
  assert.deepEqual(rgbIntToHs(0x0000ff), { hue: 240, saturation: 100 });
  assert.deepEqual(rgbIntToHs(0xffffff), { hue: 0, saturation: 0 });
});

test('programmable switches are listed as buttons, not features', () => {
  const [remote] = BUTTON_DATABASE.accessories;
  assert.deepEqual(mapButtons(remote), [
    { iid: 11, index: 1, name: 'Up', doorbell: false },
    { iid: 21, index: 2, name: 'Down', doorbell: false },
  ]);
  const { features, buttons } = mapAccessory(remote);
  assert.equal(buttons.length, 2);
  assert.deepEqual(
    features.map((f) => f.category),
    ['battery', 'battery-low'],
  );
});

test('a doorbell is a button too', () => {
  const doorbell = {
    aid: 1,
    services: [
      {
        iid: 5,
        type: '121',
        characteristics: [{ iid: 6, type: '73', perms: ['pr', 'ev'], format: 'uint8' }],
      },
    ],
  };
  assert.deepEqual(mapButtons(doorbell), [{ iid: 6, index: 1, name: null, doorbell: true }]);
});
