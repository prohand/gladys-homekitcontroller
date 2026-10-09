// -----------------------------------------------------------------------------
// Persistent storage of the HomeKit pairings.
//
// A pairing is a pair of long-term Ed25519 keys exchanged once with the setup
// code: lose it and the accessory has to be reset to be paired again. It lives
// in `/data`, the only writable (and persistent) volume of the integration
// container — it survives restarts and updates of the integration.
//
// File format (`/data/pairings.json`):
//   { "version": 1, "accessories": { "<AA:BB:..>": { id, name, host, port,
//     model, category, featureFlags, configNumber, pairingData, pairedAt } } }
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeDeviceId } from './hap/discovery.js';

const FILE_VERSION = 1;

export class PairingStore {
  /**
   * @param {string} dataDir directory of the pairings file (default `/data`)
   */
  constructor(dataDir = process.env.HOMEKIT_DATA_DIR || '/data') {
    this.file = path.join(dataDir, 'pairings.json');
    this.accessories = new Map();
  }

  async load() {
    let raw;
    try {
      raw = await readFile(this.file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.accessories = new Map();
        return;
      }
      throw err;
    }
    const parsed = JSON.parse(raw);
    this.accessories = new Map(
      Object.values(parsed?.accessories ?? {})
        .filter((record) => record?.id && record?.pairingData)
        .map((record) => [normalizeDeviceId(record.id), record]),
    );
  }

  async save() {
    await mkdir(path.dirname(this.file), { recursive: true });
    const content = JSON.stringify(
      { version: FILE_VERSION, accessories: Object.fromEntries(this.accessories) },
      null,
      2,
    );
    // Write then rename: a crash mid-write never corrupts the existing file.
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, content, { mode: 0o600 });
    await rename(tmp, this.file);
  }

  list() {
    return [...this.accessories.values()];
  }

  get(id) {
    return this.accessories.get(normalizeDeviceId(id)) ?? null;
  }

  set(record) {
    const id = normalizeDeviceId(record.id);
    this.accessories.set(id, { ...record, id });
  }

  /** Merge fields into an existing record (address change, new c#...). */
  update(id, fields) {
    const current = this.get(id);
    if (!current) {
      return null;
    }
    const next = { ...current, ...fields, id: current.id };
    this.accessories.set(current.id, next);
    return next;
  }

  delete(id) {
    return this.accessories.delete(normalizeDeviceId(id));
  }
}
