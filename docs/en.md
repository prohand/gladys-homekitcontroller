# HomeKit Controller

This integration turns Gladys into a **HomeKit controller**: it pairs
directly with your Wi-Fi / Ethernet HomeKit accessories and controls them
locally, **without an iPhone, Apple TV or HomePod**, and without any cloud.

## Before you start

- A HomeKit accessory accepts **only one controller** at a time. If it is
  already in Apple's **Home** app (or in Home Assistant…), remove it there
  first. Otherwise, factory-reset the accessory.
- Have the **8-digit setup code** (`123-45-678`) at hand: it is printed on
  the accessory, its box or its manual.
- The accessory must be on the **same local network** as Gladys.
- Only **IP** accessories (Wi-Fi, Ethernet) are supported. Bluetooth and
  Thread accessories are not.

## Pair an accessory

1. Open the **Configuration** tab of the integration.
2. Click **Search for accessories**. The list shows, for each accessory: its
   name, type, HomeKit ID, IP address and status (`ready to pair`,
   `paired elsewhere`, `paired with Gladys`).
3. Click **Pair an accessory** and fill in:
   - **Accessory**: the name, ID or IP address shown by the search. If the
     search does not find it, type its address as `IP:port` (for example
     `192.168.1.20:51826`);
   - **Setup code**: the 8 digits, with or without dashes.
4. Pairing takes a few seconds (up to a minute on small modules). Then open
   the **Discovery** tab: the accessory's devices are ready to be added.

A HomeKit **bridge** gives one Gladys device per bridged accessory.

## Supported devices

| HomeKit service               | In Gladys                                    |
| ----------------------------- | -------------------------------------------- |
| Lightbulb                     | On/off, brightness, color, color temperature |
| Switch, outlet, valve         | On/off                                       |
| Fan                           | On/off, speed                                |
| Thermostat                    | Temperature, target temperature, humidity    |
| Window covering, window, door | Position, open / stop / close                |
| Lock                          | Locked / unlocked                            |
| Sensors                       | Temperature, humidity, illuminance, motion,  |
|                               | occupancy, contact, leak, smoke, CO, CO2,    |
|                               | PM2.5 / PM10 particles                       |
| Battery                       | Level, low battery                           |

Other services (cameras, televisions, programmable buttons…) are ignored
for now.

## Settings

- **Refresh interval**: HomeKit pushes changes in real time. Gladys also
  re-reads the whole accessory at this interval, as a safety net (60 s by
  default).
- **Search duration**: how long the network is listened to during a search
  (10 s by default).

## Actions

- **Search for accessories**: lists the HomeKit accessories on the network.
- **Pair an accessory**: see above.
- **Identify a device**: the accessory signals itself (blinks, beeps…), handy
  to spot it.
- **Unpair an accessory**: removes the pairing from the accessory and from
  Gladys. For a bridge, all its devices are affected. Then delete the devices
  in Gladys.

## Troubleshooting

- **The accessory is not found by the search**: check that it is powered on
  and on the same network (same VLAN) as Gladys. Try a longer search
  duration, or pair it with `IP:port`.
- **"paired elsewhere"**: remove it from the Home app or factory-reset it.
- **Unreachable accessory**: the Configuration screen shows which
  accessories are offline. The integration retries on its own and finds the
  accessory again if its IP address changed. To avoid it, give the
  accessory a fixed IP address (DHCP reservation).
- Pairings are stored in the integration's `/data` volume: they are kept
  across updates.
- For details, check the integration logs (`LOG_LEVEL=debug`).
