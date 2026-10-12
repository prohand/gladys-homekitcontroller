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
  const sceneEvents = [];
  const widgetRefreshes = [];
  // publishChangedStates memory: feature external_id -> { state, text, at }.
  const accepted = new Map();
  let changedQueue = Promise.resolve();

  return {
    connected: true,
    published,
    discovered,
    connectionStatuses,
    scans,
    sceneEvents,
    widgetRefreshes,

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

    // Same contract as SDK 0.15: skip an entry equal to the last value Gladys
    // accepted (earlier entries of the same call included), re-send an
    // unchanged one older than `heartbeat`, 100 states per request, calls run
    // one after the other, a failed batch is forgotten and its error thrown.
    // Goes through this.publishStates so a test can make Gladys fail.
    publishChangedStates(states, { heartbeat } = {}) {
      const run = changedQueue.then(async () => {
        const now = Date.now();
        const previous = new Map();
        const changed = states.filter((s) => {
          const id = s.device_feature_external_id;
          const last = previous.has(id) ? previous.get(id) : accepted.get(id);
          previous.set(id, { state: s.state, text: s.text, at: now });
          return (
            last === undefined ||
            last.state !== s.state ||
            last.text !== s.text ||
            (heartbeat !== undefined && now - last.at >= heartbeat)
          );
        });
        for (let start = 0; start < changed.length; start += 100) {
          const batch = changed.slice(start, start + 100);
          batch.forEach((s) => {
            accepted.set(s.device_feature_external_id, { state: s.state, text: s.text, at: now });
          });
          try {
            await this.publishStates(batch);
          } catch (err) {
            batch.forEach((s) => accepted.delete(s.device_feature_external_id));
            throw err;
          }
        }
        return { success: true, count: changed.length };
      });
      changedQueue = run.catch(() => {});
      return run;
    },

    forgetPublishedStates(externalId) {
      for (const id of [...accepted.keys()]) {
        if (externalId === undefined || id === externalId || id.startsWith(`${externalId}:`)) {
          accepted.delete(id);
        }
      }
    },

    async publishDiscoveredDevices(devices) {
      discovered.push(devices);
    },

    async setConnectionStatus(connected, message) {
      connectionStatuses.push({ connected, message });
    },

    async publishSceneEvent(key, data) {
      sceneEvents.push({ key, data });
    },

    requestWidgetRefresh(key) {
      widgetRefreshes.push(key);
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
