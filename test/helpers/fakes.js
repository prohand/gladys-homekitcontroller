// -----------------------------------------------------------------------------
// In-memory stand-ins for the Gladys SDK object and the HAP client, for unit
// tests: they record calls so tests can assert them, without a running Gladys
// server nor a real HomeKit accessory.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';

export function createFakeGladys({ mdnsResults = [] } = {}) {
  const published = [];
  const discovered = [];
  const connectionStatuses = [];
  const scans = [];

  return {
    connected: true,
    published,
    discovered,
    connectionStatuses,
    scans,

    externalIds(type, platformId) {
      const device = `${type}:${platformId}`;
      return {
        device,
        feature: (key) => `${device}:${key}`,
      };
    },

    async publishState(featureExternalId, state) {
      published.push({ featureExternalId, state });
    },

    async publishStates(states) {
      for (const s of states) {
        published.push({ featureExternalId: s.device_feature_external_id, state: s.state });
      }
    },

    async publishDiscoveredDevices(devices) {
      discovered.push(devices);
    },

    async setConnectionStatus(connected, message) {
      connectionStatuses.push({ connected, message });
    },

    async scanNetwork(type, options) {
      scans.push({ type, options });
      return mdnsResults;
    },
  };
}

/**
 * Fake HAP client factory. `database` is served by getAccessories(); every
 * created client is kept in `clients` so tests can emit events on it.
 */
export function createFakeClientFactory({ database, failConnect = false } = {}) {
  const clients = [];
  const factory = {
    clients,
    create(options) {
      const client = new EventEmitter();
      client.options = options;
      client.writes = [];
      client.subscribed = [];
      client.reads = [];
      client.closed = false;
      client.removedPairings = [];
      client.getAccessories = async () => {
        if (failConnect) {
          throw new Error('connect ECONNREFUSED');
        }
        return structuredClone(database);
      };
      client.subscribeCharacteristics = async (ids) => {
        client.subscribed.push(...ids);
        return null;
      };
      client.getCharacteristics = async (ids) => {
        client.reads.push(ids);
        return { characteristics: [] };
      };
      client.setCharacteristics = async (payload) => {
        client.writes.push(payload);
        return {};
      };
      client.pairSetup = async (pin, method) => {
        client.pairing = { pin, method };
      };
      client.getLongTermData = () => ({
        AccessoryPairingID: Buffer.from('AA:BB:CC:DD:EE:01').toString('hex'),
        AccessoryLTPK: 'aa',
        iOSDevicePairingID: 'controller-id',
        iOSDeviceLTSK: 'bb',
        iOSDeviceLTPK: 'cc',
      });
      client.removePairing = async (identifier) => {
        client.removedPairings.push(identifier);
      };
      client.close = async () => {
        client.closed = true;
      };
      clients.push(client);
      return client;
    },
  };
  return factory;
}

/** In-memory PairingStore with the same surface as src/store.js. */
export function createMemoryStore(records = []) {
  const map = new Map(records.map((r) => [r.id, structuredClone(r)]));
  return {
    saves: 0,
    async load() {},
    async save() {
      this.saves += 1;
    },
    list: () => [...map.values()],
    get: (id) => map.get(String(id).toUpperCase()) ?? null,
    set(record) {
      map.set(record.id.toUpperCase(), { ...record, id: record.id.toUpperCase() });
    },
    update(id, fields) {
      const current = map.get(String(id).toUpperCase());
      if (!current) return null;
      const next = { ...current, ...fields };
      map.set(current.id, next);
      return next;
    },
    delete: (id) => map.delete(String(id).toUpperCase()),
  };
}

export const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};
