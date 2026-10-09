// -----------------------------------------------------------------------------
// Dashboard widget content (pure): the core renders it with its own theme, see
// the "Dashboard widgets" section of the SDK README for the vocabulary and the
// content budget (8 components, 6 tiles, 1 status list of 10 items, 4 buttons).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';

const MAX_STATUS_ITEMS = 10;

/**
 * Content of the `accessories` widget: how many paired accessories are
 * reachable, the list of them (unreachable first) and a reconnect button.
 * @param {Array<{ name: string, online: boolean }>} accessories
 */
export function accessoriesWidget(accessories) {
  if (accessories.length === 0) {
    return {
      ttl_seconds: 300,
      components: [
        {
          type: 'text',
          text: {
            en: 'No paired HomeKit accessory yet: pair one from the Configuration screen of the integration.',
            fr: "Aucun accessoire HomeKit appairé : appairez-en un depuis l'écran Configuration de l'intégration.",
          },
        },
      ],
    };
  }
  const offline = accessories.filter((a) => !a.online);
  const sorted = [...accessories].sort(
    (a, b) => Number(a.online) - Number(b.online) || a.name.localeCompare(b.name),
  );
  const components = [
    {
      type: 'value',
      value: accessories.length - offline.length,
      label: { en: 'Online', fr: 'En ligne' },
      icon: 'wifi',
      color: WIDGET_COLORS.SUCCESS,
    },
    {
      type: 'value',
      value: offline.length,
      label: { en: 'Offline', fr: 'Hors ligne' },
      icon: 'wifi-off',
      color: offline.length > 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'status',
      items: sorted.slice(0, MAX_STATUS_ITEMS).map((a) => ({
        label: a.name.slice(0, 40),
        value: a.online ? { en: 'Online', fr: 'En ligne' } : { en: 'Offline', fr: 'Hors ligne' },
        color: a.online ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
      })),
    },
  ];
  if (accessories.length > MAX_STATUS_ITEMS) {
    const more = accessories.length - MAX_STATUS_ITEMS;
    components.push({
      type: 'text',
      variant: 'caption',
      text: { en: `+${more} more accessory(ies)`, fr: `+${more} autre(s) accessoire(s)` },
    });
  }
  if (offline.length > 0) {
    components.push({
      type: 'button',
      label: { en: 'Reconnect', fr: 'Reconnecter' },
      icon: 'refresh-cw',
      style: 'secondary',
      action: { key: 'reconnect' },
    });
  }
  return { ttl_seconds: 60, components };
}
