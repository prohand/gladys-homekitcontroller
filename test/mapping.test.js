import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AC_MODE,
  BUTTON_STATUS,
  COVER_STATE,
  buttonFeatureValue,
  mapAccessory,
  mapButtons,
  toHapValue,
} from '../src/mapping/index.js';
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

test('programmable switches are listed as buttons and get a button feature each', () => {
  const [remote] = BUTTON_DATABASE.accessories;
  assert.deepEqual(mapButtons(remote), [
    { iid: 11, index: 1, name: 'Up', doorbell: false },
    { iid: 21, index: 2, name: 'Down', doorbell: false },
  ]);
  const { features, buttons, unsupported } = mapAccessory(remote);
  assert.equal(buttons.length, 2);
  assert.deepEqual(unsupported, []);
  assert.deepEqual(
    features.map((f) => [f.key, f.name, f.category, f.type, f.read_only]),
    [
      ['31', 'Battery', 'battery', 'integer', true],
      ['32', 'Low battery', 'battery-low', 'binary', true],
      ['11', 'Up - Button', 'button', 'click', true],
      ['21', 'Down - Button', 'button', 'click', true],
    ],
  );
  // Fed by the presses only: never read nor subscribed through the feature.
  const up = byKey(features, '11');
  assert.deepEqual([up.reads, up.events, up.write], [[], [], undefined]);
});

test('a lone button is named "Button" and presses map to BUTTON_STATUS', () => {
  const miButton = {
    aid: 5,
    services: [
      {
        iid: 1,
        type: '3E',
        characteristics: [{ iid: 2, type: '23', perms: ['pr'], value: 'Mi Button' }],
      },
      {
        iid: 10,
        type: '89',
        characteristics: [{ iid: 11, type: '73', perms: ['pr', 'ev'], format: 'uint8' }],
      },
    ],
  };
  const { features, buttons } = mapAccessory(miButton);
  assert.deepEqual(
    features.map((f) => [f.key, f.name, f.category]),
    [['11', 'Button', 'button']],
  );
  const [button] = buttons;
  assert.equal(buttonFeatureValue(button, 0), BUTTON_STATUS.CLICK);
  assert.equal(buttonFeatureValue(button, 1), BUTTON_STATUS.DOUBLE_CLICK);
  assert.equal(buttonFeatureValue(button, 2), BUTTON_STATUS.LONG_CLICK);
  assert.equal(buttonFeatureValue(button, null), null, 'a read is not a press');
  assert.equal(buttonFeatureValue(button, 7), null);
  assert.equal(buttonFeatureValue({ ...button, doorbell: true }, 0), 1, 'a doorbell rings');
});

test('unsupported services are listed, technical ones are not', () => {
  const camera = {
    aid: 1,
    services: [
      { iid: 1, type: '3E', characteristics: [] },
      { iid: 2, type: 'A2', characteristics: [] },
      { iid: 3, type: '110', characteristics: [] },
      { iid: 4, type: 'E863F007-079E-48FF-8F27-9C2605A29F52', characteristics: [] },
      { iid: 5, type: '110', characteristics: [] },
    ],
  };
  assert.deepEqual(mapAccessory(camera).unsupported, [
    '110',
    'E863F007-079E-48FF-8F27-9C2605A29F52',
  ]);
});

test('transport and runtime services of a hub are not listed as unsupported', () => {
  const hub = {
    aid: 1,
    services: [
      { iid: 1, type: '3E', characteristics: [] },
      { iid: 2, type: '22A', characteristics: [] },
      { iid: 3, type: '239', characteristics: [] },
      { iid: 4, type: '701', characteristics: [] },
      { iid: 5, type: '7E', characteristics: [] },
    ],
  };
  assert.deepEqual(mapAccessory(hub).unsupported, ['7E']);
});

const EVE = (short) => `E863F${short}-079E-48FF-8F27-9C2605A29F52`;

test('an outlet with Eve energy characteristics maps power, energy, voltage and current', () => {
  const plug = {
    aid: 2,
    services: [
      { iid: 1, type: '3E', characteristics: [] },
      {
        iid: 8,
        type: '47',
        characteristics: [
          { iid: 9, type: '25', perms: ['pr', 'pw', 'ev'], format: 'bool', value: true },
          { iid: 10, type: EVE('10D'), perms: ['pr', 'ev'], format: 'float', value: 42.5 },
          { iid: 11, type: EVE('10C'), perms: ['pr', 'ev'], format: 'float', value: 12.3 },
          { iid: 12, type: EVE('10A'), perms: ['pr'], format: 'float', value: 231 },
          { iid: 13, type: EVE('126'), perms: ['pr'], format: 'float', value: 0.2 },
          {
            iid: 14,
            type: '9715BF53-AB63-4449-8DC7-2785D617390A',
            perms: ['pr'],
            format: 'uint8',
            description: 'Vendor data',
          },
        ],
      },
    ],
  };
  const { features, unsupported, unknownCharacteristics } = mapAccessory(plug);
  assert.deepEqual(
    features.map((f) => [f.key, f.category, f.type, f.unit ?? null]),
    [
      ['9', 'switch', 'binary', null],
      ['10', 'switch', 'power', 'watt'],
      ['11', 'switch', 'energy', 'kilowatt-hour'],
      ['12', 'switch', 'voltage', 'volt'],
      ['13', 'switch', 'current', 'ampere'],
    ],
  );
  const get = getterFor(plug);
  assert.equal(byKey(features, '10').read(get), 42.5);
  assert.equal(byKey(features, '11').read(get), 12.3);
  assert.equal(byKey(features, '10').read_only, true);
  assert.deepEqual(byKey(features, '10').events, [10]);
  assert.deepEqual(byKey(features, '12').events, []);
  assert.deepEqual(unsupported, []);
  assert.deepEqual(unknownCharacteristics, [
    '47/9715BF53-AB63-4449-8DC7-2785D617390A "Vendor data"',
  ]);
});

test('a custom service carrying Eve energy characteristics is supported', () => {
  const meter = {
    aid: 3,
    services: [
      {
        iid: 20,
        type: 'E863F007-079E-48FF-8F27-9C2605A29F52',
        characteristics: [{ iid: 21, type: EVE('10D'), perms: ['pr'], format: 'float' }],
      },
    ],
  };
  const { features, unsupported } = mapAccessory(meter);
  assert.deepEqual(
    features.map((f) => [f.key, f.type]),
    [['21', 'power']],
  );
  assert.deepEqual(unsupported, []);
});

test('a heater cooler maps to an air conditioning device', () => {
  const ac = {
    aid: 6,
    services: [
      {
        iid: 10,
        type: 'BC',
        characteristics: [
          { iid: 11, type: 'B0', perms: ['pr', 'pw', 'ev'], format: 'uint8', value: 1 },
          { iid: 12, type: 'B1', perms: ['pr', 'ev'], format: 'uint8', value: 3 },
          {
            iid: 13,
            type: 'B2',
            perms: ['pr', 'pw', 'ev'],
            format: 'uint8',
            'valid-values': [0, 1, 2],
            value: 2,
          },
          { iid: 14, type: '11', perms: ['pr', 'ev'], format: 'float', value: 26.5 },
          {
            iid: 15,
            type: 'D',
            perms: ['pr', 'pw', 'ev'],
            format: 'float',
            minValue: 16,
            maxValue: 30,
            minStep: 0.5,
            value: 24,
          },
          {
            iid: 16,
            type: '12',
            perms: ['pr', 'pw', 'ev'],
            format: 'float',
            minValue: 16,
            maxValue: 30,
            minStep: 0.5,
            value: 20,
          },
        ],
      },
    ],
  };
  const { features } = mapAccessory(ac);
  assert.deepEqual(
    features.map((f) => [f.key, f.category, f.type, f.read_only]),
    [
      ['11', 'air-conditioning', 'binary', false],
      ['13', 'air-conditioning', 'mode', false],
      ['14', 'temperature-sensor', 'decimal', true],
      ['15', 'air-conditioning', 'target-temperature', false],
    ],
  );
  const get = getterFor(ac);
  const power = byKey(features, '11');
  assert.equal(power.read(get), 1);
  assert.deepEqual(power.write(0), { 11: 0 });

  // HAP 2 = cool <-> Gladys AC_MODE.COOLING (1), HAP 1 = heat <-> HEATING (2).
  const mode = byKey(features, '13');
  assert.equal(mode.read(get), AC_MODE.COOLING);
  assert.equal(mode.read(getterFor(ac, { 13: 1 })), AC_MODE.HEATING);
  assert.equal(mode.read(getterFor(ac, { 13: 0 })), AC_MODE.AUTO);
  assert.deepEqual(mode.write(AC_MODE.HEATING), { 13: 1 });
  assert.deepEqual(mode.write(AC_MODE.COOLING), { 13: 2 });
  assert.throws(() => mode.write(AC_MODE.DRYING), /does not exist in HomeKit/);

  // Target temperature follows the mode: cooling threshold in cool / auto,
  // heating threshold in heat. A mode change refreshes it (reads the mode).
  const target = byKey(features, '15');
  assert.deepEqual([target.min, target.max, target.step], [16, 30, 0.5]);
  assert.ok(target.reads.includes(13));
  assert.equal(target.read(get), 24);
  assert.deepEqual(target.write(22, get), { 15: 22 });
  const heat = getterFor(ac, { 13: 1 });
  assert.equal(target.read(heat), 20);
  assert.deepEqual(target.write(19, heat), { 16: 19 });
  assert.equal(target.read(getterFor(ac, { 13: 0 })), 24);
});

test('a thermostat exposes its mode and operating state', () => {
  const thermostat = {
    aid: 7,
    services: [
      {
        iid: 10,
        type: '4A',
        characteristics: [
          { iid: 11, type: '11', perms: ['pr', 'ev'], format: 'float', value: 19 },
          { iid: 12, type: '35', perms: ['pr', 'pw', 'ev'], format: 'float', value: 20 },
          {
            iid: 13,
            type: '33',
            perms: ['pr', 'pw', 'ev'],
            format: 'uint8',
            'valid-values': [0, 1],
            value: 1,
          },
          { iid: 14, type: 'F', perms: ['pr', 'ev'], format: 'uint8', value: 1 },
        ],
      },
    ],
  };
  const { features } = mapAccessory(thermostat);
  assert.deepEqual(
    features.map((f) => [f.key, f.category, f.type, f.read_only]),
    [
      ['11', 'temperature-sensor', 'decimal', true],
      ['12', 'thermostat', 'target-temperature', false],
      ['13', 'thermostat', 'mode', false],
      ['14', 'thermostat', 'operating-state', true],
    ],
  );
  const get = getterFor(thermostat);
  const mode = byKey(features, '13');
  assert.equal(mode.read(get), 1);
  assert.deepEqual(mode.write(0), { 13: 0 });
  assert.throws(() => mode.write(2), /not supported/, 'cooling is not a valid value here');
  assert.equal(byKey(features, '14').read(get), 1);
});

test('an air quality sensor maps its gas densities', () => {
  const tvoc = {
    aid: 8,
    services: [
      {
        iid: 10,
        type: '8D',
        characteristics: [
          { iid: 11, type: '95', perms: ['pr', 'ev'], format: 'uint8', value: 2 },
          { iid: 12, type: 'C8', perms: ['pr', 'ev'], format: 'float', value: 120 },
          { iid: 13, type: 'C4', perms: ['pr'], format: 'float', value: 10 },
          { iid: 14, type: 'C3', perms: ['pr'], format: 'float', value: 20 },
          { iid: 15, type: 'C5', perms: ['pr'], format: 'float', value: 5 },
        ],
      },
      {
        iid: 20,
        type: '8A',
        characteristics: [{ iid: 21, type: '11', perms: ['pr', 'ev'], value: 22 }],
      },
      {
        iid: 30,
        type: '82',
        characteristics: [{ iid: 31, type: '10', perms: ['pr', 'ev'], value: 45 }],
      },
    ],
  };
  const { features } = mapAccessory(tvoc);
  assert.deepEqual(
    features.map((f) => [f.key, f.name, f.category, f.unit]),
    [
      ['12', 'VOC', 'voc-sensor', 'microgram-per-cubic-meter'],
      ['13', 'NO2', 'no2-sensor', 'microgram-per-cubic-meter'],
      ['14', 'Ozone', 'o3-sensor', 'microgram-per-cubic-meter'],
      ['15', 'SO2', 'so2-sensor', 'microgram-per-cubic-meter'],
      ['21', 'Temperature', 'temperature-sensor', 'celsius'],
      ['31', 'Humidity', 'humidity-sensor', 'percent'],
    ],
  );
  assert.equal(byKey(features, '12').read(getterFor(tvoc)), 120);
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
