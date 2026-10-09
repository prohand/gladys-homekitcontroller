// -----------------------------------------------------------------------------
// Entry point of the HomeKit Controller external integration for Gladys.
//
// Role of this file: wire the SDK to the HomeKit controller (src/controller.js).
// It holds NO HomeKit logic. This file only:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. registers the event handlers BEFORE connect();
//   3. connects, starts the controller and publishes the paired devices.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
//
// Optional:
//   - HOMEKIT_DATA_DIR (default /data) where the pairings are stored
//   - LOG_LEVEL        debug | info | warn | error
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { HomeKitController } from './src/controller.js';
import { PairingStore } from './src/store.js';

const gladys = new GladysIntegration();

// Current configuration (hot-reloaded via onConfigUpdated).
let config = normalizeConfig();

const controller = new HomeKitController({
  gladys,
  store: new PairingStore(),
  onDevicesChanged: publishDevices,
});

// Started once, on the first connection to Gladys (see 'connected' below).
let startPromise = null;

async function publishDevices() {
  if (!gladys.connected) {
    return;
  }
  await gladys.publishDiscoveredDevices(controller.buildDiscoveredDevices());
}

// --- Discovery: Gladys asks for the list of devices --------------------------
// Re-resolves the accessories through mDNS (via the Gladys core), reconnects
// the unreachable ones and publishes every device of the paired accessories.
// New accessories are paired with the "Pair an accessory" action.
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> scanning HomeKit accessories');
  await controller.scan();
  await publishDevices();
});

// --- Command: the user acts on a controllable feature ------------------------
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
  // Throwing sends a success:false acknowledgement to Gladys.
  await controller.setValue(device, feature, value);
});

// --- Polling: Gladys asks to refresh a device --------------------------------
gladys.onPoll(async (device) => {
  await controller.poll(device);
});

// --- Manifest actions: buttons in the Configuration screen -------------------
gladys.onAction('list_accessories', async () => {
  logger.info('Action list_accessories');
  return controller.listAccessories();
});

gladys.onAction('pair', async (fields) => {
  logger.info(`Action pair <- ${fields.accessory}`);
  return controller.pair(fields);
});

gladys.onAction('unpair', async (fields) => {
  logger.info(`Action unpair <- ${fields.device}`);
  return controller.unpair(fields.device);
});

gladys.onAction('identify', async (fields) => {
  logger.info(`Action identify <- ${fields.device}`);
  return controller.identify(fields.device);
});

// --- Scene actions: cards of the Gladys scene editor -------------------------
// The scene triggers (button pressed, accessory status) are fired by the
// controller with publishSceneEvent.
gladys.onSceneAction('identify', async (fields) => {
  logger.info(`Scene action identify <- ${fields.device}`);
  await controller.identify(fields.device);
});

gladys.onSceneAction('refresh', async (fields) => {
  logger.info(`Scene action refresh <- ${fields.device}`);
  await controller.poll({ external_id: fields.device });
});

// --- Dashboard widget ---------------------------------------------------------
gladys.onWidgetGet('accessories', async () => controller.buildAccessoriesWidget());

gladys.onWidgetAction('accessories', async (actionKey) => {
  logger.info(`Widget action ${actionKey}`);
  if (actionKey !== 'reconnect') {
    throw new Error(`Unknown widget action ${actionKey}`);
  }
  return controller.reconnectOffline();
});

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  config = normalizeConfig(newConfig);
  await controller.updateConfig(config);
});

// --- Connection lifecycle ----------------------------------------------------
// The SDK itself logs the WebSocket lifecycle under the `gladys-sdk` name.
gladys.on('connected', async () => {
  try {
    // 1) Fetch the config filled in by the user.
    config = normalizeConfig(await gladys.getConfig());

    // 2) First connection: load the pairings and connect to the accessories.
    //    Later reconnections to Gladys keep the HomeKit sessions running.
    if (!startPromise) {
      startPromise = controller.start(config);
    } else {
      await controller.updateConfig(config);
    }
    await startPromise;

    // 3) (Re)publish the devices of the paired accessories.
    await publishDevices();

    // 4) Report the application-level status (offline accessories...).
    controller.lastConnectionStatus = null;
    await controller.reportConnectionStatus();
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    startPromise = null;
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
      })
      .catch(() => {});
  }
});

// --- Graceful shutdown -------------------------------------------------------
// The SDK disconnects cleanly and exits with code 0 when the supervisor stops
// the container (SIGTERM/SIGINT).
gladys.handleShutdown(async (signal) => {
  logger.info(`Received ${signal} -> closing the HomeKit sessions`);
  await controller.stop();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the HomeKit Controller integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
