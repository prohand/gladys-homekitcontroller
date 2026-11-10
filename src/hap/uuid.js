// -----------------------------------------------------------------------------
// HomeKit (HAP) service and characteristic types.
//
// Accessories describe their services / characteristics with Apple UUIDs, in
// the long form ("00000025-0000-1000-8000-0026BB765291") or the short form
// ("25"). We normalize both to the short uppercase hex code, which is what the
// tables below use.
// -----------------------------------------------------------------------------

const APPLE_BASE_SUFFIX = '-0000-1000-8000-0026BB765291';

/**
 * Normalize a HAP type to its short uppercase code ("25", "43", "CE"...).
 * Custom (non-Apple) UUIDs are returned uppercased and untouched.
 * @param {string} type
 */
export function shortType(type) {
  if (typeof type !== 'string' || type.length === 0) {
    return '';
  }
  const upper = type.toUpperCase();
  if (upper.length === 36) {
    if (!upper.endsWith(APPLE_BASE_SUFFIX)) {
      return upper;
    }
    return upper.slice(0, 8).replace(/^0+/, '') || '0';
  }
  return upper.replace(/^0+/, '') || '0';
}

// Services (HAP spec, chapter 8), only the ones we read.
export const SERVICE = {
  ACCESSORY_INFORMATION: '3E',
  ACCESSORY_RUNTIME_INFORMATION: '239',
  AIR_QUALITY_SENSOR: '8D',
  BATTERY: '96',
  CARBON_DIOXIDE_SENSOR: '97',
  CARBON_MONOXIDE_SENSOR: '7F',
  CONTACT_SENSOR: '80',
  DOOR: '81',
  DOORBELL: '121',
  FAN: '40',
  FAN_V2: 'B7',
  HEATER_COOLER: 'BC',
  HUMIDITY_SENSOR: '82',
  LEAK_SENSOR: '83',
  LIGHT_SENSOR: '84',
  LIGHTBULB: '43',
  LOCK_MECHANISM: '45',
  MOTION_SENSOR: '85',
  OCCUPANCY_SENSOR: '86',
  OUTLET: '47',
  PROTOCOL_INFORMATION: 'A2',
  SERVICE_LABEL: 'CC',
  SMOKE_SENSOR: '87',
  STATELESS_PROGRAMMABLE_SWITCH: '89',
  SWITCH: '49',
  TEMPERATURE_SENSOR: '8A',
  THERMOSTAT: '4A',
  THREAD_TRANSPORT: '701',
  VALVE: 'D0',
  WIFI_TRANSPORT: '22A',
  WINDOW: '8B',
  WINDOW_COVERING: '8C',
};

// Characteristics (HAP spec, chapter 9), only the ones we read or write.
export const CHAR = {
  ACTIVE: 'B0',
  BATTERY_LEVEL: '68',
  BRIGHTNESS: '8',
  CARBON_DIOXIDE_LEVEL: '93',
  CARBON_MONOXIDE_DETECTED: '69',
  COLOR_TEMPERATURE: 'CE',
  CONTACT_SENSOR_STATE: '6A',
  COOLING_THRESHOLD_TEMPERATURE: 'D',
  CURRENT_HEATING_COOLING_STATE: 'F',
  CURRENT_AMBIENT_LIGHT_LEVEL: '6B',
  CURRENT_POSITION: '6D',
  CURRENT_RELATIVE_HUMIDITY: '10',
  CURRENT_TEMPERATURE: '11',
  HEATING_THRESHOLD_TEMPERATURE: '12',
  HOLD_POSITION: '6F',
  HUE: '13',
  IDENTIFY: '14',
  LEAK_DETECTED: '70',
  LOCK_CURRENT_STATE: '1D',
  LOCK_TARGET_STATE: '1E',
  MANUFACTURER: '20',
  MODEL: '21',
  MOTION_DETECTED: '22',
  NAME: '23',
  NITROGEN_DIOXIDE_DENSITY: 'C4',
  OCCUPANCY_DETECTED: '71',
  ON: '25',
  OZONE_DENSITY: 'C3',
  PM10_DENSITY: 'C7',
  PM2_5_DENSITY: 'C6',
  POSITION_STATE: '72',
  PROGRAMMABLE_SWITCH_EVENT: '73',
  ROTATION_SPEED: '29',
  SATURATION: '2F',
  SERIAL_NUMBER: '30',
  SERVICE_LABEL_INDEX: 'CB',
  SMOKE_DETECTED: '76',
  STATUS_LOW_BATTERY: '79',
  SULPHUR_DIOXIDE_DENSITY: 'C5',
  TARGET_HEATER_COOLER_STATE: 'B2',
  TARGET_HEATING_COOLING_STATE: '33',
  TARGET_POSITION: '7C',
  TARGET_TEMPERATURE: '35',
  VOC_DENSITY: 'C8',
  CONFIGURED_NAME: 'E3',
};

// Eve (Elgato) energy characteristics: not in the HAP spec, but a de facto
// standard used by Eve accessories and many Homebridge plugins.
export const EVE_CHAR = {
  POWER: 'E863F10D-079E-48FF-8F27-9C2605A29F52', // W, float
  ENERGY: 'E863F10C-079E-48FF-8F27-9C2605A29F52', // kWh, float
  VOLTAGE: 'E863F10A-079E-48FF-8F27-9C2605A29F52', // V, float
  CURRENT: 'E863F126-079E-48FF-8F27-9C2605A29F52', // A, float
};

/** True for a vendor-specific (non-Apple) service or characteristic type. */
export const isCustomType = (type) => shortType(type).length === 36;

// HomeKit accessory categories (mDNS TXT `ci`), for human-readable listings.
export const ACCESSORY_CATEGORY = {
  1: 'Other',
  2: 'Bridge',
  3: 'Fan',
  4: 'Garage door opener',
  5: 'Lightbulb',
  6: 'Door lock',
  7: 'Outlet',
  8: 'Switch',
  9: 'Thermostat',
  10: 'Sensor',
  11: 'Security system',
  12: 'Door',
  13: 'Window',
  14: 'Window covering',
  15: 'Programmable switch',
  16: 'Range extender',
  17: 'IP camera',
  18: 'Video doorbell',
  19: 'Air purifier',
  20: 'Heater',
  21: 'Air conditioner',
  22: 'Humidifier',
  23: 'Dehumidifier',
  28: 'Sprinkler',
  29: 'Faucet',
  30: 'Shower system',
  31: 'Television',
  32: 'Remote control',
  33: 'Router',
};
