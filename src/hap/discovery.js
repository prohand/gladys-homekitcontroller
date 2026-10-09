// -----------------------------------------------------------------------------
// HomeKit discovery helpers.
//
// The integration container runs on a bridge network: mDNS never reaches it.
// The Gladys core browses `_hap._tcp` for us (`gladys.scanNetwork('mdns')`,
// declared in the manifest `network_discovery` field) and hands back the RAW
// answers `[{ name, host, addresses, port, txt }]`. Parsing them is our job.
//
// HAP TXT record keys (HAP spec, "Bonjour TXT record"):
//   id  -> device id ("AA:BB:CC:DD:EE:FF"), stable, the pairing identity
//   md  -> model name
//   ci  -> accessory category
//   sf  -> status flags, bit 0 set = NOT paired yet
//   ff  -> feature flags, bit 0 set = supports Apple authentication (MFi)
//   c#  -> configuration number, bumped when the accessory database changes
// -----------------------------------------------------------------------------

import net from 'node:net';
import { ACCESSORY_CATEGORY } from './uuid.js';

/**
 * Turn the raw TXT entries (["id=AA:BB", "sf=1"...]) into an object.
 * Accepts an already-parsed object too.
 */
export function parseTxt(txt) {
  if (!txt) {
    return {};
  }
  if (!Array.isArray(txt)) {
    return typeof txt === 'object' ? { ...txt } : {};
  }
  const result = {};
  for (const entry of txt) {
    if (typeof entry !== 'string') {
      continue;
    }
    const index = entry.indexOf('=');
    if (index <= 0) {
      continue;
    }
    result[entry.slice(0, index).toLowerCase()] = entry.slice(index + 1);
  }
  return result;
}

/** Normalize a HomeKit device id to "AA:BB:CC:DD:EE:FF". */
export function normalizeDeviceId(id) {
  return String(id ?? '')
    .trim()
    .toUpperCase();
}

/** Device id -> platform id usable in an external id ("aabbccddeeff"). */
export function platformIdFromDeviceId(id) {
  return normalizeDeviceId(id)
    .replace(/[^0-9A-F]/g, '')
    .toLowerCase();
}

function stripServiceSuffix(name) {
  return String(name ?? '')
    .replace(/\._hap\._tcp(\.local)?\.?$/i, '')
    .replace(/\\032/g, ' ')
    .trim();
}

function pickAddress(entry) {
  const addresses = Array.isArray(entry.addresses) ? entry.addresses : [];
  // IPv4 first: link-local IPv6 needs a scope id we do not get from the core.
  const ipv4 = addresses.find((address) => net.isIPv4(address));
  if (ipv4) {
    return ipv4;
  }
  const ipv6 = addresses.find((address) => net.isIPv6(address) && !/^fe80:/i.test(address));
  return ipv6 ?? entry.host ?? null;
}

/**
 * Parse the raw `mdns` scan results into HomeKit accessories, one per device
 * id (an accessory answering on several interfaces is listed once).
 * @param {Array<object>} results raw `scanNetwork('mdns')` results
 * @returns {Array<{id, name, host, port, model, category, categoryLabel, paired, featureFlags, configNumber}>}
 */
export function parseMdnsResults(results) {
  const byId = new Map();
  for (const entry of Array.isArray(results) ? results : []) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const txt = parseTxt(entry.txt);
    const id = normalizeDeviceId(txt.id);
    const host = pickAddress(entry);
    const port = Number(entry.port);
    if (!id || !host || !Number.isInteger(port) || port <= 0) {
      continue;
    }
    if (byId.has(id)) {
      continue;
    }
    const category = Number(txt.ci);
    const statusFlags = Number(txt.sf ?? 0);
    byId.set(id, {
      id,
      name: stripServiceSuffix(entry.name) || txt.md || id,
      host,
      port,
      model: txt.md ?? null,
      category: Number.isFinite(category) ? category : null,
      categoryLabel: ACCESSORY_CATEGORY[category] ?? 'Accessory',
      paired: (statusFlags & 0x01) === 0,
      featureFlags: Number(txt.ff ?? 0) || 0,
      configNumber: Number(txt['c#'] ?? 0) || 0,
    });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Normalize a HomeKit setup code to the "XXX-XX-XXX" form the pairing expects.
 * Accepts "12345678", "123-45-678", "123 45 678"...
 * @throws {Error} when the code does not contain exactly 8 digits
 */
export function normalizeSetupCode(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length !== 8) {
    throw new Error('The HomeKit setup code must contain 8 digits (format 123-45-678).');
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

/**
 * Parse a manual "IP:port" target ("192.168.1.20:51826", "[fd00::1]:51826").
 * @returns {{host: string, port: number} | null}
 */
export function parseHostPort(raw) {
  const value = String(raw ?? '').trim();
  const match = value.match(/^\[([^\]]+)\]:(\d{1,5})$/) ?? value.match(/^([^:\s]+):(\d{1,5})$/);
  if (!match || net.isIP(match[1]) === 0) {
    return null;
  }
  const port = Number(match[2]);
  if (port <= 0 || port > 65535) {
    return null;
  }
  return { host: match[1], port };
}

/**
 * Find the accessory the user designated, by device id, IP address or name
 * (case-insensitive), among the parsed scan results.
 */
export function findAccessory(accessories, query) {
  const needle = String(query ?? '')
    .trim()
    .toLowerCase();
  if (!needle) {
    return null;
  }
  return (
    accessories.find((a) => a.id.toLowerCase() === needle) ??
    accessories.find((a) => a.host.toLowerCase() === needle) ??
    accessories.find((a) => a.name.toLowerCase() === needle) ??
    null
  );
}
