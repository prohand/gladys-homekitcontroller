import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { HomeKitController } from '../src/controller.js';
import { BRIDGE_DATABASE, BUTTON_DATABASE, MDNS_RESULTS } from './helpers/fixtures.js';
import {
  createFakeClientFactory,
  createFakeGladys,
  createMemoryStore,
  silentLogger,
} from './helpers/fakes.js';

const BRIDGE_ID = '1A:2B:3C:4D:5E:6F';
const CONFIG = { poll_frequency: 60, scan_timeout: 5 };

const bridgeRecord = (fields = {}) => ({
  id: BRIDGE_ID,
  name: 'Acme Bridge',
  host: '192.168.1.40',
  port: 51826,
  pairingData: { iOSDevicePairingID: 'controller-id' },
  ...fields,
});

async function startController(t, { records = [bridgeRecord()], factoryOptions = {} } = {}) {
  const gladys = createFakeGladys({ mdnsResults: MDNS_RESULTS });
  const store = createMemoryStore(records);
  const factory = createFakeClientFactory({ database: BRIDGE_DATABASE, ...factoryOptions });
  let devicesChanged = 0;
  const controller = new HomeKitController({
    gladys,
    store,
    clientFactory: factory,
    logger: silentLogger,
    onDevicesChanged: async () => {
      devicesChanged += 1;
    },
  });
  await controller.start(CONFIG);
  t.after(() => controller.stop());
  return { gladys, store, factory, controller, devicesChanged: () => devicesChanged };
}

const stateOf = (gladys, featureExternalId) =>
  gladys.published.filter((p) => p.featureExternalId === featureExternalId).at(-1)?.state;

test('start connects the paired accessory and publishes its devices', async (t) => {
  const { gladys, store, factory, controller } = await startController(t);

  const [client] = factory.clients;
  assert.equal(client.options.host, '192.168.1.40');
  // Every characteristic supporting events is subscribed to.
  assert.ok(client.subscribed.includes('2.10'));
  assert.ok(client.subscribed.includes('3.20'));
  assert.ok(!client.subscribed.includes('3.31'), 'no "ev" permission, no subscription');

  const devices = controller.buildDiscoveredDevices();
  assert.deepEqual(
    devices.map((d) => [d.name, d.external_id, d.features.length]),
    [
      ['Living room bulb', 'accessory:1a2b3c4d5e6f-2', 4],
      ['Hallway sensor', 'accessory:1a2b3c4d5e6f-3', 4],
      ['Bedroom blind', 'accessory:1a2b3c4d5e6f-4', 2],
    ],
  );
  const bulb = devices[0];
  assert.deepEqual(bulb.params, [
    { name: 'HOMEKIT_ID', value: BRIDGE_ID },
    { name: 'HOMEKIT_AID', value: '2' },
    { name: 'MANUFACTURER', value: 'Acme' },
    { name: 'MODEL', value: 'Model X' },
  ]);
  assert.equal(bulb.features[1].unit, 'percent');
  assert.equal(bulb.features[0].keep_history, true);

  // Current values published on connection.
  assert.equal(stateOf(gladys, 'accessory:1a2b3c4d5e6f-3:10'), 21.5);
  assert.equal(stateOf(gladys, 'accessory:1a2b3c4d5e6f-2:color-12'), 0xff0000);
  // The database is cached for the next start.
  assert.ok(store.get(BRIDGE_ID).database);
  assert.deepEqual(gladys.connectionStatuses.at(-1), { connected: true, message: undefined });
});

test('events update the Gladys states, without duplicates', async (t) => {
  const { gladys, factory } = await startController(t);
  const [client] = factory.clients;
  const before = gladys.published.length;

  client.emit('event', { characteristics: [{ aid: 3, iid: 10, value: 22.75 }] });
  client.emit('event', { characteristics: [{ aid: 3, iid: 10, value: 22.75 }] });
  client.emit('event', { characteristics: [{ aid: 2, iid: 12, value: 240 }] });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(gladys.published.slice(before), [
    { featureExternalId: 'accessory:1a2b3c4d5e6f-3:10', state: 22.75 },
    { featureExternalId: 'accessory:1a2b3c4d5e6f-2:color-12', state: 0x0000ff },
  ]);
});

test('setValue writes the characteristic and publishes the new state', async (t) => {
  const { gladys, factory, controller } = await startController(t);
  const [client] = factory.clients;
  const device = { external_id: 'accessory:1a2b3c4d5e6f-2' };

  await controller.setValue(device, { external_id: 'accessory:1a2b3c4d5e6f-2:10' }, 1);
  assert.deepEqual(client.writes.at(-1), { '2.10': true });
  assert.equal(stateOf(gladys, 'accessory:1a2b3c4d5e6f-2:10'), 1);

  await controller.setValue(device, { external_id: 'accessory:1a2b3c4d5e6f-2:color-12' }, 0x00ff00);
  assert.deepEqual(client.writes.at(-1), { 2.12: 120, 2.13: 100 });

  // Cover command: the command itself is published (PositionState follows).
  await controller.setValue(
    { external_id: 'accessory:1a2b3c4d5e6f-4' },
    { external_id: 'accessory:1a2b3c4d5e6f-4:state-11' },
    1,
  );
  assert.deepEqual(client.writes.at(-1), { 4.11: 100 });
  assert.equal(stateOf(gladys, 'accessory:1a2b3c4d5e6f-4:state-11'), 1);
});

test('setValue refuses read-only features and unknown devices', async (t) => {
  const { controller } = await startController(t);
  await assert.rejects(
    controller.setValue(
      { external_id: 'accessory:1a2b3c4d5e6f-3' },
      { external_id: 'accessory:1a2b3c4d5e6f-3:10' },
      1,
    ),
    /read-only/,
  );
  await assert.rejects(
    controller.setValue({ external_id: 'nope' }, { external_id: 'nope:1' }, 1),
    /Unknown HomeKit device/,
  );
});

test('setValue reports a HAP error status as a failure', async (t) => {
  const { factory, controller } = await startController(t);
  factory.clients[0].setCharacteristics = async () => ({
    characteristics: [{ aid: 2, iid: 10, status: -70402 }],
  });
  await assert.rejects(
    controller.setValue(
      { external_id: 'accessory:1a2b3c4d5e6f-2' },
      { external_id: 'accessory:1a2b3c4d5e6f-2:10' },
      1,
    ),
    /refused the command/,
  );
});

test('an unreachable accessory is reported offline but its devices stay known', async (t) => {
  const { gladys, controller } = await startController(t, {
    records: [bridgeRecord({ database: BRIDGE_DATABASE })],
    factoryOptions: { failConnect: true },
  });
  assert.equal(controller.buildDiscoveredDevices().length, 3);
  const status = gladys.connectionStatuses.at(-1);
  assert.equal(status.connected, false);
  assert.match(status.message.en, /1\/1 HomeKit accessory\(ies\) unreachable: Acme Bridge/);
  await assert.rejects(
    controller.setValue(
      { external_id: 'accessory:1a2b3c4d5e6f-2' },
      { external_id: 'accessory:1a2b3c4d5e6f-2:10' },
      1,
    ),
    /unreachable/,
  );
});

test('scan updates the address of a paired accessory that moved', async (t) => {
  const { gladys, store, controller } = await startController(t);
  await controller.scan();
  assert.equal(gladys.scans[0].type, 'mdns');
  assert.equal(gladys.scans[0].options.timeoutSeconds, 5);
  assert.equal(store.get(BRIDGE_ID).host, '192.168.1.50');
});

test('pair stores the pairing and connects the new accessory', async (t) => {
  const { store, factory, controller, devicesChanged } = await startController(t, {
    records: [],
  });
  const message = await controller.pair({ accessory: 'Eve Energy', setup_code: '11122333' });

  const pairingClient = factory.clients[0];
  // ff=1 in the mDNS record -> PairSetupWithAuth (method 1)
  assert.deepEqual(pairingClient.pairing, { pin: '111-22-333', method: 1 });
  const record = store.get('AA:BB:CC:DD:EE:01');
  assert.equal(record.host, '192.168.1.60');
  assert.equal(record.port, 80);
  assert.equal(record.pairingData.iOSDevicePairingID, 'controller-id');
  assert.match(message.en, /Eve Energy paired: 3 device\(s\)/);
  assert.equal(devicesChanged() >= 1, true);
});

test('pair refuses an accessory already paired elsewhere', async (t) => {
  const { controller } = await startController(t, { records: [] });
  await assert.rejects(
    controller.pair({ accessory: '192.168.1.50', setup_code: '111-22-333' }),
    /already paired with another controller/,
  );
});

test('unpair removes the pairing on the accessory and locally', async (t) => {
  const { store, factory, controller } = await startController(t);
  const client = factory.clients[0];
  const message = await controller.unpair('accessory:1a2b3c4d5e6f-3');
  assert.deepEqual(client.removedPairings, ['controller-id']);
  assert.equal(store.get(BRIDGE_ID), null);
  assert.equal(controller.buildDiscoveredDevices().length, 0);
  assert.match(message.en, /unpaired/);
});

test('identify writes the Identify characteristic', async (t) => {
  const { factory, controller } = await startController(t);
  await controller.identify('accessory:1a2b3c4d5e6f-2');
  assert.deepEqual(factory.clients[0].writes.at(-1), { 2.2: true });
});

test('listAccessories describes what the network scan found', async (t) => {
  const { controller } = await startController(t);
  const message = await controller.listAccessories();
  assert.match(message.en, /^2 accessory\(ies\)/);
  assert.match(message.en, /Acme Bridge 1A2B \(Bridge\) - 1A:2B:3C:4D:5E:6F .* paired with Gladys/);
  assert.match(message.fr, /Eve Energy \(Outlet\) .* prêt à appairer/);
});

test('a Gladys API failure does not mark the accessory offline', async (t) => {
  const { gladys, factory, controller } = await startController(t);
  const [client] = factory.clients;
  const realPublish = gladys.publishStates;
  gladys.publishStates = async () => {
    throw new Error('Gladys unavailable');
  };
  client.emit('event', { characteristics: [{ aid: 3, iid: 10, value: 30 }] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.states.get(BRIDGE_ID).status, 'online');

  // Once Gladys is back, the same value is published again.
  gladys.publishStates = realPublish;
  client.emit('event', { characteristics: [{ aid: 3, iid: 10, value: 30 }] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stateOf(gladys, 'accessory:1a2b3c4d5e6f-3:10'), 30);
});

test('a button press fires the button_pressed scene trigger', async (t) => {
  const { gladys, factory, controller } = await startController(t, {
    factoryOptions: { database: BUTTON_DATABASE },
  });
  const [client] = factory.clients;
  assert.ok(client.subscribed.includes('1.11'));
  assert.ok(client.subscribed.includes('1.21'));
  assert.equal(controller.buildDiscoveredDevices()[0].features.length, 2, 'battery only');

  client.emit('event', { characteristics: [{ aid: 1, iid: 21, value: 1 }] });
  // A read of a ProgrammableSwitchEvent returns null: not a press.
  client.emit('event', { characteristics: [{ aid: 1, iid: 11, value: null }] });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(gladys.sceneEvents, [
    {
      key: 'button_pressed',
      data: {
        device: 'accessory:1a2b3c4d5e6f-1',
        press: 'double',
        button_index: 2,
        accessory: 'Hall remote',
        button: 'Down',
        doorbell: false,
      },
    },
  ]);
});

test('losing and getting back an accessory fires the status trigger', async (t) => {
  const { gladys, factory, controller } = await startController(t);
  assert.deepEqual(gladys.sceneEvents, [], 'the startup is not an event');
  const state = controller.states.get(BRIDGE_ID);

  factory.clients[0].emit('event-disconnect');
  await new Promise((resolve) => setImmediate(resolve));
  const offline = gladys.sceneEvents.filter((e) => e.data.status === 'offline');
  assert.deepEqual(
    offline.map((e) => [e.key, e.data.device, e.data.accessory]),
    [
      ['accessory_status', 'accessory:1a2b3c4d5e6f-2', 'Living room bulb'],
      ['accessory_status', 'accessory:1a2b3c4d5e6f-3', 'Hallway sensor'],
      ['accessory_status', 'accessory:1a2b3c4d5e6f-4', 'Bedroom blind'],
    ],
  );
  assert.ok(gladys.widgetRefreshes.includes('accessories'));

  // A second failure while already offline is not a new event.
  controller.markOffline(state, new Error('still down'));
  assert.equal(gladys.sceneEvents.length, 3);

  const message = await controller.reconnectOffline();
  assert.equal(message.fr, '1/1 accessoire(s) reconnecté(s)');
  const online = gladys.sceneEvents.filter((e) => e.data.status === 'online');
  assert.equal(online.length, 3);
});

test('the accessories widget fits the core vocabulary', async (t) => {
  const { controller } = await startController(t);
  const online = controller.buildAccessoriesWidget();
  assert.deepEqual(validateWidgetContent(online), []);
  assert.equal(online.components[0].value, 1);
  assert.ok(!online.components.some((c) => c.type === 'button'), 'nothing to reconnect');

  controller.markOffline(controller.states.get(BRIDGE_ID), new Error('down'));
  const offline = controller.buildAccessoriesWidget();
  assert.deepEqual(validateWidgetContent(offline), []);
  assert.equal(offline.components[1].value, 1);
  assert.deepEqual(offline.components.at(-1).action, { key: 'reconnect' });
});

test('the accessories widget has an empty state', async (t) => {
  const { controller } = await startController(t, { records: [] });
  const content = controller.buildAccessoriesWidget();
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].type, 'text');
});
