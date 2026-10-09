// -----------------------------------------------------------------------------
// HomeKit controller: the link between Gladys and the paired accessories.
//
// For every paired accessory (one HomeKit pairing = one IP endpoint, a bridge
// exposing several accessories counts as one):
//   1. read its accessory database (`/accessories`) and map it to Gladys
//      devices (one Gladys device per HomeKit accessory, `aid`);
//   2. subscribe to the characteristic events (real-time updates);
//   3. refresh every readable characteristic every `poll_frequency` seconds
//      (safety net for lost events and characteristics without events);
//   4. on any failure, mark it offline and retry with a growing delay,
//      re-resolving its IP address through mDNS (DHCP lease change).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  PAIRING_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
  deviceIdFromPairingData,
  hapClientFactory,
  pairMethodFor,
  withTimeout,
} from './hap/client.js';
import {
  findAccessory,
  normalizeDeviceId,
  normalizeSetupCode,
  parseHostPort,
  parseMdnsResults,
  platformIdFromDeviceId,
} from './hap/discovery.js';
import { mapAccessory } from './mapping/index.js';

const DEVICE_TYPE = 'accessory';

// Delays between reconnection attempts of an unreachable accessory.
export const RETRY_DELAYS_MS = [10_000, 30_000, 60_000, 120_000, 300_000];

// Minimum delay between two automatic mDNS scans (manual scans are not
// throttled): the core allows mediated scans sparingly.
const AUTO_SCAN_INTERVAL_MS = 120_000;

// Characteristics read per request during a refresh.
const READ_CHUNK_SIZE = 50;

const charKey = (aid, iid) => `${Number(aid)}.${Number(iid)}`;

function chunk(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

export class HomeKitController {
  /**
   * @param {object} deps
   * @param {object} deps.gladys        the SDK instance
   * @param {object} deps.store         PairingStore
   * @param {object} [deps.clientFactory] HAP client factory (tests)
   * @param {object} [deps.logger]
   * @param {Function} [deps.onDevicesChanged] called when the device list changes
   */
  constructor({ gladys, store, clientFactory = hapClientFactory, logger, onDevicesChanged }) {
    this.gladys = gladys;
    this.store = store;
    this.clientFactory = clientFactory;
    this.logger = logger ?? createLogger({ name: 'homekit' });
    this.onDevicesChanged = onDevicesChanged ?? (async () => {});
    this.config = { poll_frequency: 60, scan_timeout: 10 };
    // id -> runtime state of a paired accessory (see ensureState)
    this.states = new Map();
    // device external_id -> { id, aid }
    this.deviceIndex = new Map();
    // feature external_id -> last published Gladys value (dedupe)
    this.lastPublished = new Map();
    this.refreshTimer = null;
    this.lastAutoScanAt = 0;
    this.lastConnectionStatus = null;
    this.stopped = false;
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    this.stopped = false;
    this.config = config;
    await this.store.load();
    for (const record of this.store.list()) {
      const state = this.ensureState(record.id);
      // Map the cached database right away: the devices exist (and commands
      // are routed) even while the accessory is still unreachable.
      if (record.database) {
        this.loadDatabase(state, record.database, { withValues: false });
      }
    }
    this.logger.info(`${this.states.size} paired HomeKit accessory(ies) loaded`);
    await Promise.allSettled([...this.states.keys()].map((id) => this.connect(id)));
    this.startRefreshLoop();
    await this.reportConnectionStatus();
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    await Promise.allSettled([...this.states.values()].map((state) => this.closeClient(state)));
    for (const state of this.states.values()) {
      clearTimeout(state.retryTimer);
    }
  }

  async updateConfig(config) {
    const pollChanged = config.poll_frequency !== this.config.poll_frequency;
    this.config = config;
    if (pollChanged && this.refreshTimer) {
      this.startRefreshLoop();
    }
  }

  startRefreshLoop() {
    clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => {
      this.refreshAll().catch((err) => this.logger.error('Refresh failed', err));
    }, this.config.poll_frequency * 1000);
    this.refreshTimer.unref?.();
  }

  ensureState(id) {
    const key = normalizeDeviceId(id);
    if (!this.states.has(key)) {
      this.states.set(key, {
        id: key,
        client: null,
        status: 'offline',
        failures: 0,
        lastError: null,
        retryTimer: null,
        connecting: null,
        devices: new Map(), // aid -> { externalId, name, info, features }
        values: new Map(), // "aid.iid" -> last HAP value
        readable: [], // ["aid.iid"] characteristics read on refresh
        subscribable: [], // ["aid.iid"] characteristics with events
      });
    }
    return this.states.get(key);
  }

  // --- Connection ------------------------------------------------------------

  /**
   * Connect to a paired accessory: read its database, subscribe to events and
   * publish the current values. Never throws: failures schedule a retry.
   */
  connect(id) {
    const state = this.ensureState(id);
    if (!state.connecting) {
      state.connecting = this.doConnect(state).finally(() => {
        state.connecting = null;
      });
    }
    return state.connecting;
  }

  async doConnect(state) {
    const record = this.store.get(state.id);
    if (!record || this.stopped) {
      return;
    }
    clearTimeout(state.retryTimer);
    await this.closeClient(state);
    const client = this.clientFactory.create({
      id: record.id,
      host: record.host,
      port: record.port,
      pairingData: record.pairingData,
    });
    state.client = client;
    try {
      const database = await withTimeout(
        client.getAccessories(),
        REQUEST_TIMEOUT_MS,
        `${record.name}: reading the accessory database`,
      );
      const structureChanged = this.loadDatabase(state, database, { withValues: true });
      if (structureChanged || !record.database) {
        this.store.update(record.id, { database });
        await this.store.save();
      }

      client.on('event', (event) => {
        this.handleValues(state, event?.characteristics ?? []).catch((err) =>
          this.logger.error(`${record.name}: event handling failed`, err),
        );
      });
      client.on('event-disconnect', () => {
        if (state.client === client) {
          this.markOffline(state, new Error('event connection lost'));
        }
      });
      if (state.subscribable.length > 0) {
        await withTimeout(
          client.subscribeCharacteristics(state.subscribable),
          REQUEST_TIMEOUT_MS,
          `${record.name}: subscribing to events`,
        );
      }

      const wasOffline = state.status !== 'online';
      state.status = 'online';
      state.failures = 0;
      state.lastError = null;
      if (wasOffline) {
        this.logger.info(
          `${record.name} (${record.host}:${record.port}) connected, ` +
            `${state.devices.size} device(s), ${state.subscribable.length} event subscription(s)`,
        );
      }
      await this.publishAll(state);
      if (structureChanged) {
        await this.onDevicesChanged();
      }
    } catch (err) {
      this.markOffline(state, err);
    }
    await this.reportConnectionStatus();
  }

  async closeClient(state) {
    const client = state.client;
    state.client = null;
    if (!client) {
      return;
    }
    client.removeAllListeners?.();
    try {
      await client.close?.();
    } catch (err) {
      this.logger.debug(`Closing the client of ${state.id} failed: ${err.message}`);
    }
  }

  markOffline(state, err) {
    const record = this.store.get(state.id);
    // While unpairing, the accessory drops our connections on purpose.
    if (!record || this.stopped || state.forgetting) {
      return;
    }
    const wasOnline = state.status === 'online';
    state.status = 'offline';
    state.failures += 1;
    state.lastError = err?.message ?? String(err);
    const delay = RETRY_DELAYS_MS[Math.min(state.failures - 1, RETRY_DELAYS_MS.length - 1)];
    const log = wasOnline || state.failures === 1 ? 'warn' : 'debug';
    this.logger[log](
      `${record.name} (${record.host}:${record.port}) unreachable: ${state.lastError}. ` +
        `Retrying in ${delay / 1000}s`,
    );
    this.closeClient(state).catch(() => {});
    clearTimeout(state.retryTimer);
    state.retryTimer = setTimeout(() => {
      this.retry(state).catch((error) => this.logger.error('Reconnection failed', error));
    }, delay);
    state.retryTimer.unref?.();
    this.reportConnectionStatus().catch(() => {});
  }

  async retry(state) {
    // From the second failure on, the IP address may have changed (DHCP):
    // look the accessory up again through mDNS before reconnecting.
    if (state.failures >= 2) {
      await this.refreshAddresses({ force: false }).catch((err) =>
        this.logger.debug(`Automatic mDNS refresh failed: ${err.message}`),
      );
    }
    await this.connect(state.id);
  }

  /**
   * Map an accessory database to Gladys devices.
   * @returns {boolean} true when the device / feature structure changed
   */
  loadDatabase(state, database, { withValues }) {
    const record = this.store.get(state.id);
    const platformId = platformIdFromDeviceId(state.id);
    const before = this.structureSignature(state);
    for (const externalId of [...this.deviceIndex.keys()]) {
      if (this.deviceIndex.get(externalId).id === state.id) {
        this.deviceIndex.delete(externalId);
      }
    }
    state.devices = new Map();
    state.readable = [];
    state.subscribable = [];
    const accessories = database?.accessories ?? [];
    for (const accessory of accessories) {
      const aid = Number(accessory.aid);
      for (const service of accessory.services ?? []) {
        for (const char of service.characteristics ?? []) {
          if (withValues && char.value !== undefined) {
            state.values.set(charKey(aid, char.iid), char.value);
          }
        }
      }
      const { info, features } = mapAccessory(accessory);
      if (features.length === 0) {
        continue;
      }
      const ids = this.gladys.externalIds(DEVICE_TYPE, `${platformId}-${aid}`);
      const fallbackName = accessories.length > 1 ? `${record?.name} ${aid}` : record?.name;
      const device = {
        aid,
        externalId: ids.device,
        name: info.name ?? fallbackName ?? state.id,
        info,
        features: features.map((feature) => ({ ...feature, externalId: ids.feature(feature.key) })),
      };
      state.devices.set(aid, device);
      this.deviceIndex.set(device.externalId, { id: state.id, aid });
      for (const feature of features) {
        for (const iid of feature.reads) {
          const key = charKey(aid, iid);
          const char = this.findChar(accessory, iid);
          if (char?.perms?.includes('pr') && !state.readable.includes(key)) {
            state.readable.push(key);
          }
        }
        for (const iid of feature.events) {
          const key = charKey(aid, iid);
          if (!state.subscribable.includes(key)) {
            state.subscribable.push(key);
          }
        }
      }
    }
    return before !== this.structureSignature(state);
  }

  findChar(accessory, iid) {
    for (const service of accessory.services ?? []) {
      const char = (service.characteristics ?? []).find((c) => Number(c.iid) === Number(iid));
      if (char) {
        return char;
      }
    }
    return null;
  }

  structureSignature(state) {
    return JSON.stringify(
      [...state.devices.values()].map((d) => [
        d.externalId,
        d.name,
        d.features.map((f) => [f.externalId, f.category, f.type, f.read_only]),
      ]),
    );
  }

  // --- States ----------------------------------------------------------------

  /**
   * Apply characteristic values (event or read result) and publish the Gladys
   * features they change.
   */
  async handleValues(state, characteristics) {
    const touched = new Map(); // aid -> Set(iid)
    for (const char of characteristics) {
      if (char?.aid === undefined || char?.iid === undefined) {
        continue;
      }
      if ((char.status !== undefined && Number(char.status) !== 0) || !('value' in char)) {
        continue;
      }
      const aid = Number(char.aid);
      const iid = Number(char.iid);
      state.values.set(charKey(aid, iid), char.value);
      if (!touched.has(aid)) {
        touched.set(aid, new Set());
      }
      touched.get(aid).add(iid);
    }
    const toPublish = [];
    for (const [aid, iids] of touched) {
      const device = state.devices.get(aid);
      for (const feature of device?.features ?? []) {
        if (feature.reads.some((iid) => iids.has(Number(iid)))) {
          toPublish.push([device, feature]);
        }
      }
    }
    await this.publishFeatures(state, toPublish);
  }

  async publishAll(state) {
    const all = [];
    for (const device of state.devices.values()) {
      for (const feature of device.features) {
        all.push([device, feature]);
      }
    }
    await this.publishFeatures(state, all);
  }

  async publishFeatures(state, pairs) {
    const states = [];
    for (const [device, feature] of pairs) {
      let value;
      try {
        value = feature.read((iid) => state.values.get(charKey(device.aid, iid)));
      } catch (err) {
        this.logger.debug(`Cannot compute ${feature.externalId}: ${err.message}`);
        continue;
      }
      if (value === null || value === undefined || !Number.isFinite(value)) {
        continue;
      }
      if (this.lastPublished.get(feature.externalId) === value) {
        continue;
      }
      this.lastPublished.set(feature.externalId, value);
      states.push({ device_feature_external_id: feature.externalId, state: value });
    }
    // The host API accepts at most 100 states per request. A Gladys-side
    // failure must not be taken for an accessory failure: log it and forget
    // the values so the next read publishes them again.
    for (const batch of chunk(states, 100)) {
      try {
        await this.gladys.publishStates(batch);
      } catch (err) {
        this.logger.warn(`Publishing ${batch.length} state(s) to Gladys failed: ${err.message}`);
        for (const { device_feature_external_id: externalId } of batch) {
          this.lastPublished.delete(externalId);
        }
      }
    }
  }

  /** Read every readable characteristic of an accessory (optionally one aid). */
  async readAll(state, aid) {
    if (state.status !== 'online' || !state.client) {
      return;
    }
    const keys = state.readable.filter((key) => aid === undefined || key.startsWith(`${aid}.`));
    const client = state.client;
    try {
      for (const ids of chunk(keys, READ_CHUNK_SIZE)) {
        const result = await withTimeout(
          client.getCharacteristics(ids),
          REQUEST_TIMEOUT_MS,
          `${state.id}: reading characteristics`,
        );
        await this.handleValues(state, result?.characteristics ?? []);
      }
    } catch (err) {
      if (state.client === client) {
        this.markOffline(state, err);
      }
    }
  }

  async refreshAll() {
    await Promise.allSettled([...this.states.values()].map((state) => this.readAll(state)));
  }

  // --- Gladys requests -------------------------------------------------------

  /** Discovery payload: every device of every paired accessory. */
  buildDiscoveredDevices() {
    const devices = [];
    for (const state of this.states.values()) {
      const record = this.store.get(state.id);
      for (const device of state.devices.values()) {
        const params = [
          { name: 'HOMEKIT_ID', value: state.id },
          { name: 'HOMEKIT_AID', value: String(device.aid) },
        ];
        if (device.info.manufacturer) {
          params.push({ name: 'MANUFACTURER', value: device.info.manufacturer });
        }
        if (device.info.model ?? record?.model) {
          params.push({ name: 'MODEL', value: device.info.model ?? record.model });
        }
        devices.push({
          name: device.name,
          external_id: device.externalId,
          params,
          features: device.features.map((feature) => {
            const payload = {
              name: feature.name,
              external_id: feature.externalId,
              category: feature.category,
              type: feature.type,
              min: feature.min,
              max: feature.max,
              read_only: feature.read_only,
              has_feedback: feature.has_feedback,
              keep_history: true,
            };
            if (feature.unit) payload.unit = feature.unit;
            if (feature.step) payload.step = feature.step;
            return payload;
          }),
        });
      }
    }
    return devices;
  }

  route(deviceExternalId) {
    const route = this.deviceIndex.get(deviceExternalId);
    if (!route) {
      return null;
    }
    const state = this.states.get(route.id);
    const device = state?.devices.get(route.aid);
    return device ? { state, device, record: this.store.get(route.id) } : null;
  }

  requireOnline(state, record) {
    if (state.status !== 'online' || !state.client) {
      throw new Error(
        `${record?.name ?? state.id} is unreachable` +
          (state.lastError ? ` (${state.lastError})` : ''),
      );
    }
  }

  async setValue(device, feature, value) {
    const target = this.route(device.external_id);
    if (!target) {
      throw new Error(`Unknown HomeKit device ${device.external_id}`);
    }
    const { state, record } = target;
    const descriptor = target.device.features.find((f) => f.externalId === feature.external_id);
    if (!descriptor?.write) {
      throw new Error(`${feature.external_id} is read-only`);
    }
    this.requireOnline(state, record);
    const { aid } = target.device;
    const get = (iid) => state.values.get(charKey(aid, iid));
    const writes = descriptor.write(value, get);
    const payload = Object.fromEntries(
      Object.entries(writes).map(([iid, hapValue]) => [charKey(aid, iid), hapValue]),
    );
    const client = state.client;
    let response;
    try {
      response = await withTimeout(
        client.setCharacteristics(payload),
        REQUEST_TIMEOUT_MS,
        `${record.name}: writing`,
      );
    } catch (err) {
      if (state.client === client && !err.statusCode) {
        // Network error: the accessory is gone, reconnect in the background.
        this.markOffline(state, err);
      }
      throw err;
    }
    const failed = (response?.characteristics ?? []).filter(
      (c) => c.status !== undefined && Number(c.status) !== 0,
    );
    if (failed.length > 0) {
      throw new Error(`${record.name} refused the command (HAP status ${failed[0].status})`);
    }

    for (const [iid, hapValue] of Object.entries(writes)) {
      state.values.set(charKey(aid, iid), hapValue);
    }
    // Publish what the accessory now reports when the write touched the
    // characteristics the feature is read from; otherwise (cover open/stop/
    // close commands) publish the command itself.
    const writtenIids = Object.keys(writes).map(Number);
    const readsWritten = descriptor.reads.some((iid) => writtenIids.includes(Number(iid)));
    const confirmed = readsWritten ? descriptor.read(get) : null;
    const published = Number.isFinite(confirmed) ? confirmed : Number(value);
    this.lastPublished.set(descriptor.externalId, published);
    await this.gladys.publishState(descriptor.externalId, published);
  }

  async poll(device) {
    const target = this.route(device.external_id);
    if (target) {
      await this.readAll(target.state, target.device.aid);
    }
  }

  // --- Discovery & pairing ---------------------------------------------------

  /**
   * Browse `_hap._tcp` through the Gladys core and refresh the address of the
   * paired accessories that moved.
   * @returns {Promise<Array>} parsed accessories
   */
  async refreshAddresses({ force = true } = {}) {
    if (!force && Date.now() - this.lastAutoScanAt < AUTO_SCAN_INTERVAL_MS) {
      return null;
    }
    this.lastAutoScanAt = Date.now();
    const raw = await this.gladys.scanNetwork('mdns', {
      timeoutSeconds: this.config.scan_timeout,
    });
    const accessories = parseMdnsResults(raw);
    let changed = false;
    for (const found of accessories) {
      const record = this.store.get(found.id);
      if (!record) {
        continue;
      }
      if (record.host !== found.host || record.port !== found.port) {
        this.logger.info(
          `${record.name} moved from ${record.host}:${record.port} to ${found.host}:${found.port}`,
        );
        this.store.update(found.id, { host: found.host, port: found.port });
        changed = true;
        const state = this.ensureState(found.id);
        if (state.status === 'online') {
          this.connect(found.id).catch(() => {});
        }
      }
      if (found.configNumber && record.configNumber !== found.configNumber) {
        // c# changed: the accessory database changed (device added to a bridge…).
        this.store.update(found.id, { configNumber: found.configNumber });
        changed = true;
        if (this.ensureState(found.id).status === 'online') {
          this.connect(found.id).catch(() => {});
        }
      }
    }
    if (changed) {
      await this.store.save();
    }
    return accessories;
  }

  /** Discovery requested by Gladys: refresh addresses, reconnect, publish. */
  async scan() {
    let accessories = [];
    try {
      accessories = (await this.refreshAddresses({ force: true })) ?? [];
    } catch (err) {
      this.logger.warn(`mDNS scan through Gladys failed: ${err.message}`);
    }
    const unpaired = accessories.filter((a) => !a.paired && !this.store.get(a.id));
    if (unpaired.length > 0) {
      this.logger.info(
        `${unpaired.length} HomeKit accessory(ies) ready to pair: ` +
          unpaired.map((a) => `${a.name} [${a.id}]`).join(', '),
      );
    }
    await Promise.allSettled(
      [...this.states.values()]
        .filter((state) => state.status !== 'online')
        .map((state) => this.connect(state.id)),
    );
    return accessories;
  }

  /** Human-readable list of the HomeKit accessories found on the network. */
  async listAccessories() {
    const accessories = await this.refreshAddresses({ force: true });
    if (accessories.length === 0) {
      return {
        en: 'No HomeKit accessory found. Check that it is powered on, on the same network as Gladys, and not paired with another controller.',
        fr: "Aucun accessoire HomeKit trouvé. Vérifiez qu'il est allumé, sur le même réseau que Gladys, et non appairé à un autre contrôleur.",
      };
    }
    const status = (a, lang) => {
      if (this.store.get(a.id)) return lang === 'fr' ? 'appairé à Gladys' : 'paired with Gladys';
      if (a.paired) return lang === 'fr' ? 'déjà appairé ailleurs' : 'paired elsewhere';
      return lang === 'fr' ? 'prêt à appairer' : 'ready to pair';
    };
    const lines = (lang) =>
      accessories
        .slice(0, 15)
        .map((a) => `${a.name} (${a.categoryLabel}) - ${a.id} - ${a.host} - ${status(a, lang)}`)
        .join(' | ');
    const more = accessories.length > 15 ? ` (+${accessories.length - 15})` : '';
    return {
      en: `${accessories.length} accessory(ies): ${lines('en')}${more}`,
      fr: `${accessories.length} accessoire(s) : ${lines('fr')}${more}`,
    };
  }

  /**
   * Pair a new accessory with its setup code.
   * @param {object} fields action fields: `accessory` (id, name, IP or IP:port), `setup_code`
   */
  async pair({ accessory, setup_code: setupCode }) {
    const pin = normalizeSetupCode(setupCode);
    let target = parseHostPort(accessory);
    if (!target) {
      const found = findAccessory(await this.refreshAddresses({ force: true }), accessory);
      if (!found) {
        throw new Error(
          `HomeKit accessory "${accessory}" not found. Run "Search for accessories" first, ` +
            'or type its address as IP:port.',
        );
      }
      if (this.store.get(found.id)) {
        throw new Error(`${found.name} is already paired with Gladys.`);
      }
      if (found.paired) {
        throw new Error(
          `${found.name} is already paired with another controller (Apple Home, Home Assistant…). ` +
            'Remove it there first, or reset the accessory.',
        );
      }
      target = found;
    }

    const name = target.name ?? target.host;
    this.logger.info(`Pairing ${name} (${target.host}:${target.port})...`);
    const client = this.clientFactory.create({
      id: target.id,
      host: target.host,
      port: target.port,
    });
    try {
      await withTimeout(
        client.pairSetup(pin, pairMethodFor(target.featureFlags)),
        PAIRING_TIMEOUT_MS,
        `Pairing ${name}`,
      );
    } finally {
      await Promise.resolve(client.close?.()).catch(() => {});
    }
    const pairingData = client.getLongTermData();
    const id = normalizeDeviceId(target.id ?? deviceIdFromPairingData(pairingData));
    if (!pairingData || !id) {
      throw new Error(`Pairing ${name} returned no pairing data`);
    }
    this.store.set({
      id,
      name: target.name ?? id,
      host: target.host,
      port: target.port,
      model: target.model ?? null,
      category: target.category ?? null,
      featureFlags: target.featureFlags ?? 0,
      configNumber: target.configNumber ?? 0,
      pairingData,
      pairedAt: new Date().toISOString(),
    });
    await this.store.save();
    this.logger.info(`${name} paired`);

    // connect() publishes the new devices (structure change) once connected.
    const state = this.ensureState(id);
    await this.connect(id);
    const count = state.devices.size;
    return {
      en: `${name} paired: ${count} device(s) are waiting in the Discovery tab.`,
      fr: `${name} appairé : ${count} appareil(s) vous attendent dans l'onglet Découverte.`,
    };
  }

  /** Remove the pairing of the accessory owning a Gladys device. */
  async unpair(deviceExternalId) {
    const target = this.route(deviceExternalId);
    if (!target) {
      throw new Error('Unknown HomeKit device');
    }
    const { state, record } = target;
    state.forgetting = true;
    let reached = true;
    try {
      this.requireOnline(state, record);
      await withTimeout(
        state.client.removePairing(record.pairingData.iOSDevicePairingID),
        REQUEST_TIMEOUT_MS,
        `${record.name}: removing the pairing`,
      );
    } catch (err) {
      reached = false;
      this.logger.warn(`${record.name}: could not remove the pairing on the accessory`, err);
    }
    await this.forget(state);
    this.logger.info(`${record.name} unpaired`);
    await this.onDevicesChanged();
    if (reached) {
      return {
        en: `${record.name} unpaired. You can now delete its devices from Gladys.`,
        fr: `${record.name} désappairé. Vous pouvez maintenant supprimer ses appareils dans Gladys.`,
      };
    }
    return {
      en: `${record.name} removed from Gladys, but the accessory could not be reached: reset it before pairing it again.`,
      fr: `${record.name} retiré de Gladys, mais l'accessoire était injoignable : réinitialisez-le avant de l'appairer à nouveau.`,
    };
  }

  async forget(state) {
    clearTimeout(state.retryTimer);
    await this.closeClient(state);
    for (const device of state.devices.values()) {
      this.deviceIndex.delete(device.externalId);
      for (const feature of device.features) {
        this.lastPublished.delete(feature.externalId);
      }
    }
    this.states.delete(state.id);
    this.store.delete(state.id);
    await this.store.save();
    await this.reportConnectionStatus();
  }

  /** Make the accessory owning a Gladys device signal itself. */
  async identify(deviceExternalId) {
    const target = this.route(deviceExternalId);
    if (!target) {
      throw new Error('Unknown HomeKit device');
    }
    const { state, device, record } = target;
    if (!device.info.identifyIid) {
      return {
        en: 'This accessory has no way to signal itself.',
        fr: 'Cet accessoire ne peut pas se signaler.',
      };
    }
    this.requireOnline(state, record);
    await withTimeout(
      state.client.setCharacteristics({ [charKey(device.aid, device.info.identifyIid)]: true }),
      REQUEST_TIMEOUT_MS,
      `${record.name}: identify`,
    );
    return {
      en: `Look around: ${device.name} is signalling itself.`,
      fr: `Regardez autour de vous : ${device.name} se signale.`,
    };
  }

  // --- Status ----------------------------------------------------------------

  async reportConnectionStatus() {
    const states = [...this.states.values()];
    const offline = states.filter((state) => state.status !== 'online');
    const names = offline.map((state) => this.store.get(state.id)?.name ?? state.id).join(', ');
    const ratio = `${offline.length}/${states.length}`;
    // Messages are limited to 200 characters per language.
    const status =
      offline.length === 0
        ? { connected: true }
        : {
            connected: false,
            message: {
              en: `${ratio} HomeKit accessory(ies) unreachable: ${names}`.slice(0, 200),
              fr: `${ratio} accessoire(s) HomeKit injoignable(s) : ${names}`.slice(0, 200),
            },
          };
    const signature = JSON.stringify(status);
    if (signature === this.lastConnectionStatus || !this.gladys.connected) {
      return;
    }
    this.lastConnectionStatus = signature;
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
    } catch (err) {
      this.lastConnectionStatus = null;
      this.logger.debug(`setConnectionStatus failed: ${err.message}`);
    }
  }
}
