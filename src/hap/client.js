// -----------------------------------------------------------------------------
// Thin wrapper around the `hap-controller` HTTP (HAP over IP) client.
//
// We import the IP transport directly instead of the package entry point: the
// entry point also loads the Bluetooth (BLE) transport and its native `noble`
// module, which we neither need (the container has no Bluetooth access) nor
// build (the Dockerfile installs with --ignore-scripts).
// -----------------------------------------------------------------------------

import httpClientModule from 'hap-controller/lib/transport/ip/http-client.js';
import pairingProtocolModule from 'hap-controller/lib/protocol/pairing-protocol.js';

const HttpClient = httpClientModule.default;
const { PairMethods } = pairingProtocolModule;

/** Default timeout of one request to an accessory. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Pairing (SRP) is slow on small microcontrollers: give it more time. */
export const PAIRING_TIMEOUT_MS = 60_000;

/**
 * Reject when `promise` does not settle within `ms`. `net` sockets have no
 * connect timeout of their own: an unplugged accessory would otherwise hang a
 * request for minutes.
 */
export function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Pairing method for an accessory, from its mDNS feature flags: accessories
 * with an Apple authentication coprocessor (ff bit 0) expect
 * PairSetupWithAuth, all the others (most DIY / bridge firmwares) PairSetup.
 */
export function pairMethodFor(featureFlags) {
  return (Number(featureFlags) & 0x01) === 0x01
    ? PairMethods.PairSetupWithAuth
    : PairMethods.PairSetup;
}

/**
 * Accessory id ("AA:BB:CC:DD:EE:FF") from the long-term pairing data, whose
 * AccessoryPairingID is the hex encoding of that ASCII string.
 */
export function deviceIdFromPairingData(pairingData) {
  if (!pairingData?.AccessoryPairingID) {
    return null;
  }
  return Buffer.from(pairingData.AccessoryPairingID, 'hex').toString('utf8').toUpperCase();
}

/**
 * Factory of HAP clients. Injected in the controller so tests can replace it.
 */
export const hapClientFactory = {
  create({ id, host, port, pairingData }) {
    // Non-persistent connections for reads/writes: every request runs its own
    // pair-verify. Slightly slower, but a dropped TCP session can never leave a
    // stale encrypted connection behind. Events use their own connection.
    return new HttpClient(id ?? 'unknown', host, port, pairingData ?? undefined, {
      usePersistentConnections: false,
    });
  },
};
