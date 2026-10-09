// -----------------------------------------------------------------------------
// HomeKit accessory -> Gladys device mapping.
//
// A HomeKit accessory is a list of SERVICES (Lightbulb, Outlet, Temperature
// sensor...), each holding CHARACTERISTICS (On, Brightness, Current
// temperature...) identified by an instance id (`iid`) unique in the accessory.
//
// This module is pure: it turns ONE accessory object (an entry of the
// `/accessories` database) into feature descriptors:
//
//   {
//     key,                  // stable feature key (external id suffix)
//     name, category, type, unit, min, max, step, read_only, has_feedback,
//     reads: [iid...],      // characteristics this feature is computed from
//     events: [iid...],     // subset of `reads` that pushes events
//     read(get) -> number | null       // HAP values -> Gladys value
//     write(value, get) -> { iid: v }  // Gladys value -> HAP values (writable only)
//   }
//
// `get(iid)` returns the last known HAP value of a characteristic of the same
// accessory. To support a new service, add a mapper in SERVICE_MAPPERS.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { CHAR, SERVICE, shortType } from '../hap/uuid.js';
import { hsToRgbInt, rgbIntToHs } from './color.js';

// Gladys cover state values (open / stop / close commands).
export const COVER_STATE = { OPEN: 1, STOP: 0, CLOSE: -1 };

const INTEGER_FORMATS = new Set(['uint8', 'uint16', 'uint32', 'uint64', 'int']);

// --- Characteristic helpers --------------------------------------------------

function findChar(service, type) {
  return (service.characteristics ?? []).find((c) => shortType(c.type) === type) ?? null;
}

const hasPerm = (char, perm) => Array.isArray(char?.perms) && char.perms.includes(perm);
const isReadable = (char) => hasPerm(char, 'pr');
const isWritable = (char) => hasPerm(char, 'pw');
const supportsEvents = (char) => hasPerm(char, 'ev');

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toBinary(value) {
  const number = toNumber(value);
  return number === null ? null : number ? 1 : 0;
}

/**
 * Convert a Gladys value to what a characteristic accepts: a boolean for a
 * `bool` characteristic, a number clamped to the characteristic bounds (and
 * rounded for integer formats) otherwise.
 */
export function toHapValue(char, value) {
  if (char.format === 'bool') {
    return Boolean(toNumber(value));
  }
  let number = toNumber(value) ?? 0;
  if (Number.isFinite(char.minValue)) {
    number = Math.max(char.minValue, number);
  }
  if (Number.isFinite(char.maxValue)) {
    number = Math.min(char.maxValue, number);
  }
  if (INTEGER_FORMATS.has(char.format)) {
    number = Math.round(number);
  }
  return number;
}

const bound = (value, fallback) => (Number.isFinite(value) ? value : fallback);

// --- Descriptor builders -----------------------------------------------------

/**
 * One feature backed by one characteristic.
 * `options.read` / `options.write` convert the values (identity by default).
 */
function charFeature(char, options) {
  const writable = Boolean(options.writable) && isWritable(char);
  const descriptor = {
    key: String(char.iid),
    name: options.name,
    category: options.category,
    type: options.type,
    unit: options.unit,
    min: options.min ?? bound(char.minValue, 0),
    max: options.max ?? bound(char.maxValue, 100),
    step: options.step,
    read_only: !writable,
    has_feedback: writable && (isReadable(char) || supportsEvents(char)),
    reads: isReadable(char) || supportsEvents(char) ? [char.iid] : [],
    events: supportsEvents(char) ? [char.iid] : [],
    read: (get) => (options.read ?? toNumber)(get(char.iid)),
  };
  if (writable) {
    const convert = options.write ?? ((value) => value);
    descriptor.write = (value) => ({ [char.iid]: toHapValue(char, convert(value)) });
  }
  return descriptor;
}

const binarySensor = (char, name, category, read = toBinary) =>
  charFeature(char, { name, category, type: TYPES.SENSOR.BINARY, min: 0, max: 1, read });

const decimalSensor = (char, name, category, unit, min, max) =>
  charFeature(char, {
    name,
    category,
    type: TYPES.SENSOR.DECIMAL,
    unit,
    min: bound(char.minValue, min),
    max: bound(char.maxValue, max),
  });

const onOff = (char, name, category = CATEGORIES.SWITCH, type = TYPES.SWITCH.BINARY) =>
  charFeature(char, { name, category, type, min: 0, max: 1, writable: true, read: toBinary });

// --- Service mappers ---------------------------------------------------------
// Each mapper receives (service, label) and returns feature descriptors.
// `label(text)` prefixes the feature name with the service name when the
// accessory has several services of the same kind (2-gang switch...).

function mapLightbulb(service, label) {
  const features = [];
  const on = findChar(service, CHAR.ON);
  if (on) {
    features.push(onOff(on, label('Light'), CATEGORIES.LIGHT, TYPES.LIGHT.BINARY));
  }
  const brightness = findChar(service, CHAR.BRIGHTNESS);
  if (brightness) {
    features.push(
      charFeature(brightness, {
        name: label('Brightness'),
        category: CATEGORIES.LIGHT,
        type: TYPES.LIGHT.BRIGHTNESS,
        unit: UNITS.PERCENT,
        writable: true,
      }),
    );
  }
  const hue = findChar(service, CHAR.HUE);
  const saturation = findChar(service, CHAR.SATURATION);
  if (hue && saturation) {
    const writable = isWritable(hue) && isWritable(saturation);
    const reads = [hue, saturation].filter((c) => isReadable(c) || supportsEvents(c));
    const descriptor = {
      key: `color-${hue.iid}`,
      name: label('Color'),
      category: CATEGORIES.LIGHT,
      type: TYPES.LIGHT.COLOR,
      min: 0,
      max: 0xffffff,
      read_only: !writable,
      has_feedback: writable && reads.length > 0,
      reads: reads.map((c) => c.iid),
      events: [hue, saturation].filter(supportsEvents).map((c) => c.iid),
      read: (get) => {
        const h = toNumber(get(hue.iid));
        const s = toNumber(get(saturation.iid));
        return h === null || s === null ? null : hsToRgbInt(h, s);
      },
    };
    if (writable) {
      descriptor.write = (value) => {
        const hs = rgbIntToHs(value);
        return {
          [hue.iid]: toHapValue(hue, hs.hue),
          [saturation.iid]: toHapValue(saturation, hs.saturation),
        };
      };
    }
    features.push(descriptor);
  }
  const colorTemperature = findChar(service, CHAR.COLOR_TEMPERATURE);
  if (colorTemperature) {
    // HomeKit color temperature is in mireds (140 = cold, 500 = warm).
    features.push(
      charFeature(colorTemperature, {
        name: label('Color temperature'),
        category: CATEGORIES.LIGHT,
        type: TYPES.LIGHT.TEMPERATURE,
        min: bound(colorTemperature.minValue, 140),
        max: bound(colorTemperature.maxValue, 500),
        writable: true,
      }),
    );
  }
  return features;
}

function mapOnOffService(service, label, text, charType = CHAR.ON) {
  const char = findChar(service, charType);
  return char ? [onOff(char, label(text))] : [];
}

function mapFan(service, label, charType) {
  const features = mapOnOffService(service, label, 'Fan', charType);
  const speed = findChar(service, CHAR.ROTATION_SPEED);
  if (speed) {
    features.push(
      charFeature(speed, {
        name: label('Fan speed'),
        category: CATEGORIES.FAN,
        type: TYPES.FAN.PERCENT,
        unit: UNITS.PERCENT,
        writable: true,
      }),
    );
  }
  return features;
}

function mapSingleSensor(charType, build) {
  return (service, label) => {
    const char = findChar(service, charType);
    return char ? [build(char, label)] : [];
  };
}

function mapThermostat(service, label) {
  const features = [];
  const current = findChar(service, CHAR.CURRENT_TEMPERATURE);
  if (current) {
    features.push(
      decimalSensor(
        current,
        label('Temperature'),
        CATEGORIES.TEMPERATURE_SENSOR,
        UNITS.CELSIUS,
        -50,
        100,
      ),
    );
  }
  const target = findChar(service, CHAR.TARGET_TEMPERATURE);
  if (target) {
    features.push(
      charFeature(target, {
        name: label('Target temperature'),
        category: CATEGORIES.THERMOSTAT,
        type: TYPES.THERMOSTAT.TARGET_TEMPERATURE,
        unit: UNITS.CELSIUS,
        min: bound(target.minValue, 10),
        max: bound(target.maxValue, 38),
        step: Number.isFinite(target.minStep) && target.minStep > 0 ? target.minStep : undefined,
        writable: true,
      }),
    );
  }
  const humidity = findChar(service, CHAR.CURRENT_RELATIVE_HUMIDITY);
  if (humidity) {
    features.push(
      decimalSensor(humidity, label('Humidity'), CATEGORIES.HUMIDITY_SENSOR, UNITS.PERCENT, 0, 100),
    );
  }
  return features;
}

function mapCovering(service, label) {
  const features = [];
  const current = findChar(service, CHAR.CURRENT_POSITION);
  const target = findChar(service, CHAR.TARGET_POSITION);
  const positionState = findChar(service, CHAR.POSITION_STATE);
  const hold = findChar(service, CHAR.HOLD_POSITION);
  const source = current ?? target;
  if (!source) {
    return features;
  }
  const writableTarget = target && isWritable(target) ? target : null;

  // Position: read the CURRENT position, write the TARGET one.
  const position = charFeature(source, {
    name: label('Position'),
    category: CATEGORIES.SHUTTER,
    type: TYPES.SHUTTER.POSITION,
    unit: UNITS.PERCENT,
    min: 0,
    max: 100,
  });
  if (writableTarget) {
    position.read_only = false;
    position.has_feedback = position.reads.length > 0;
    position.write = (value) => ({ [writableTarget.iid]: toHapValue(writableTarget, value) });
  }
  features.push(position);

  // State: open / stop / close commands, fed back from PositionState.
  if (writableTarget) {
    const reads = positionState && (isReadable(positionState) || supportsEvents(positionState));
    features.push({
      key: `state-${writableTarget.iid}`,
      name: label('State'),
      category: CATEGORIES.SHUTTER,
      type: TYPES.SHUTTER.STATE,
      min: -1,
      max: 1,
      read_only: false,
      has_feedback: Boolean(reads),
      reads: reads ? [positionState.iid] : [],
      events: positionState && supportsEvents(positionState) ? [positionState.iid] : [],
      read: (get) => {
        // HAP PositionState: 0 = going to minimum (closing), 1 = going to
        // maximum (opening), 2 = stopped.
        const state = positionState ? toNumber(get(positionState.iid)) : null;
        if (state === 0) return COVER_STATE.CLOSE;
        if (state === 1) return COVER_STATE.OPEN;
        if (state === 2) return COVER_STATE.STOP;
        return null;
      },
      write: (value, get) => {
        const command = Math.sign(Number(value) || 0);
        if (command === COVER_STATE.OPEN) {
          return { [writableTarget.iid]: toHapValue(writableTarget, 100) };
        }
        if (command === COVER_STATE.CLOSE) {
          return { [writableTarget.iid]: toHapValue(writableTarget, 0) };
        }
        if (hold && isWritable(hold)) {
          return { [hold.iid]: true };
        }
        // No HoldPosition: stop by targeting the position reached right now.
        const now = toNumber(get(source.iid));
        return { [writableTarget.iid]: toHapValue(writableTarget, now ?? 50) };
      },
    });
  }
  return features;
}

function mapLock(service, label) {
  const current = findChar(service, CHAR.LOCK_CURRENT_STATE);
  const target = findChar(service, CHAR.LOCK_TARGET_STATE);
  const source = current ?? target;
  if (!source) {
    return [];
  }
  // HAP LockCurrentState: 0 = unsecured, 1 = secured, 2 = jammed, 3 = unknown.
  const feature = charFeature(source, {
    name: label('Lock'),
    category: CATEGORIES.LOCK,
    type: TYPES.LOCK.BINARY,
    min: 0,
    max: 1,
    read: (value) => {
      const state = toNumber(value);
      return state === 0 || state === 1 ? state : null;
    },
  });
  if (target && isWritable(target)) {
    feature.read_only = false;
    feature.has_feedback = feature.reads.length > 0;
    feature.write = (value) => ({ [target.iid]: toHapValue(target, value ? 1 : 0) });
  }
  return [feature];
}

function mapBattery(service, label) {
  const features = [];
  const level = findChar(service, CHAR.BATTERY_LEVEL);
  if (level) {
    features.push(
      charFeature(level, {
        name: label('Battery'),
        category: CATEGORIES.BATTERY,
        type: TYPES.BATTERY.INTEGER,
        unit: UNITS.PERCENT,
        min: 0,
        max: 100,
      }),
    );
  }
  const low = findChar(service, CHAR.STATUS_LOW_BATTERY);
  if (low) {
    features.push(
      charFeature(low, {
        name: label('Low battery'),
        category: CATEGORIES.BATTERY_LOW,
        type: TYPES.BATTERY_LOW.BINARY,
        min: 0,
        max: 1,
        read: toBinary,
      }),
    );
  }
  return features;
}

function mapAirQuality(service, label) {
  const features = [];
  const pm25 = findChar(service, CHAR.PM2_5_DENSITY);
  if (pm25) {
    features.push(
      decimalSensor(
        pm25,
        label('PM2.5'),
        CATEGORIES.PM25_SENSOR,
        UNITS.MICROGRAM_PER_CUBIC_METER,
        0,
        1000,
      ),
    );
  }
  const pm10 = findChar(service, CHAR.PM10_DENSITY);
  if (pm10) {
    features.push(
      decimalSensor(
        pm10,
        label('PM10'),
        CATEGORIES.PM10_SENSOR,
        UNITS.MICROGRAM_PER_CUBIC_METER,
        0,
        1000,
      ),
    );
  }
  return features;
}

const SERVICE_MAPPERS = {
  [SERVICE.LIGHTBULB]: mapLightbulb,
  [SERVICE.SWITCH]: (s, l) => mapOnOffService(s, l, 'Switch'),
  [SERVICE.OUTLET]: (s, l) => mapOnOffService(s, l, 'Outlet'),
  [SERVICE.VALVE]: (s, l) => mapOnOffService(s, l, 'Valve', CHAR.ACTIVE),
  [SERVICE.FAN]: (s, l) => mapFan(s, l, CHAR.ON),
  [SERVICE.FAN_V2]: (s, l) => mapFan(s, l, CHAR.ACTIVE),
  [SERVICE.TEMPERATURE_SENSOR]: mapSingleSensor(CHAR.CURRENT_TEMPERATURE, (c, l) =>
    decimalSensor(c, l('Temperature'), CATEGORIES.TEMPERATURE_SENSOR, UNITS.CELSIUS, -50, 100),
  ),
  [SERVICE.HUMIDITY_SENSOR]: mapSingleSensor(CHAR.CURRENT_RELATIVE_HUMIDITY, (c, l) =>
    decimalSensor(c, l('Humidity'), CATEGORIES.HUMIDITY_SENSOR, UNITS.PERCENT, 0, 100),
  ),
  [SERVICE.LIGHT_SENSOR]: mapSingleSensor(CHAR.CURRENT_AMBIENT_LIGHT_LEVEL, (c, l) =>
    decimalSensor(c, l('Illuminance'), CATEGORIES.LIGHT_SENSOR, UNITS.LUX, 0, 100000),
  ),
  [SERVICE.MOTION_SENSOR]: mapSingleSensor(CHAR.MOTION_DETECTED, (c, l) =>
    binarySensor(c, l('Motion'), CATEGORIES.MOTION_SENSOR),
  ),
  [SERVICE.OCCUPANCY_SENSOR]: mapSingleSensor(CHAR.OCCUPANCY_DETECTED, (c, l) =>
    binarySensor(c, l('Occupancy'), CATEGORIES.MOTION_SENSOR),
  ),
  // HAP ContactSensorState: 0 = contact detected (closed), 1 = no contact
  // (open). Gladys opening sensor: 1 = closed, 0 = open.
  [SERVICE.CONTACT_SENSOR]: mapSingleSensor(CHAR.CONTACT_SENSOR_STATE, (c, l) =>
    binarySensor(c, l('Contact'), CATEGORIES.OPENING_SENSOR, (value) => {
      const state = toNumber(value);
      return state === null ? null : state === 0 ? 1 : 0;
    }),
  ),
  [SERVICE.LEAK_SENSOR]: mapSingleSensor(CHAR.LEAK_DETECTED, (c, l) =>
    binarySensor(c, l('Leak'), CATEGORIES.LEAK_SENSOR),
  ),
  [SERVICE.SMOKE_SENSOR]: mapSingleSensor(CHAR.SMOKE_DETECTED, (c, l) =>
    binarySensor(c, l('Smoke'), CATEGORIES.SMOKE_SENSOR),
  ),
  [SERVICE.CARBON_MONOXIDE_SENSOR]: mapSingleSensor(CHAR.CARBON_MONOXIDE_DETECTED, (c, l) =>
    binarySensor(c, l('Carbon monoxide'), CATEGORIES.CO_SENSOR),
  ),
  [SERVICE.CARBON_DIOXIDE_SENSOR]: mapSingleSensor(CHAR.CARBON_DIOXIDE_LEVEL, (c, l) =>
    charFeature(c, {
      name: l('CO2'),
      category: CATEGORIES.CO2_SENSOR,
      type: TYPES.SENSOR.INTEGER,
      unit: UNITS.PPM,
      min: 0,
      max: bound(c.maxValue, 100000),
    }),
  ),
  [SERVICE.AIR_QUALITY_SENSOR]: mapAirQuality,
  [SERVICE.BATTERY]: mapBattery,
  [SERVICE.THERMOSTAT]: mapThermostat,
  [SERVICE.WINDOW_COVERING]: mapCovering,
  [SERVICE.WINDOW]: mapCovering,
  [SERVICE.DOOR]: mapCovering,
  [SERVICE.LOCK_MECHANISM]: mapLock,
};

/** Service types this integration knows how to map (for docs and tests). */
export const SUPPORTED_SERVICES = Object.keys(SERVICE_MAPPERS);

function serviceName(service) {
  const name = findChar(service, CHAR.CONFIGURED_NAME) ?? findChar(service, CHAR.NAME);
  return typeof name?.value === 'string' && name.value.trim() ? name.value.trim() : null;
}

/**
 * Read the AccessoryInformation service of an accessory.
 */
export function accessoryInfo(accessory) {
  const info = (accessory.services ?? []).find(
    (s) => shortType(s.type) === SERVICE.ACCESSORY_INFORMATION,
  );
  const value = (type) => {
    const char = info ? findChar(info, type) : null;
    return typeof char?.value === 'string' && char.value.trim() ? char.value.trim() : null;
  };
  const identify = info ? findChar(info, CHAR.IDENTIFY) : null;
  return {
    name: value(CHAR.CONFIGURED_NAME) ?? value(CHAR.NAME),
    manufacturer: value(CHAR.MANUFACTURER),
    model: value(CHAR.MODEL),
    serialNumber: value(CHAR.SERIAL_NUMBER),
    identifyIid: identify && isWritable(identify) ? identify.iid : null,
  };
}

/**
 * Map ONE accessory (entry of the `/accessories` database) to Gladys feature
 * descriptors. Unsupported services are ignored; an accessory without any
 * supported service returns an empty list (a bridge's own accessory, a
 * camera...).
 */
export function mapAccessory(accessory) {
  const info = accessoryInfo(accessory);
  const services = (accessory.services ?? []).filter((s) => SERVICE_MAPPERS[shortType(s.type)]);
  const countByType = new Map();
  for (const service of services) {
    const type = shortType(service.type);
    countByType.set(type, (countByType.get(type) ?? 0) + 1);
  }
  const indexByType = new Map();
  const features = [];
  for (const service of services) {
    const type = shortType(service.type);
    const index = (indexByType.get(type) ?? 0) + 1;
    indexByType.set(type, index);
    const several = countByType.get(type) > 1;
    const name = serviceName(service);
    const label = (text) => {
      if (!several) {
        return text;
      }
      return name && name !== info.name ? `${name} - ${text}` : `${text} ${index}`;
    };
    features.push(...SERVICE_MAPPERS[type](service, label));
  }
  return { info, features };
}
