// -----------------------------------------------------------------------------
// HomeKit accessory database used by the tests: a bridge exposing a color
// bulb, a multi-sensor and a window covering. Types mix the short ("25") and
// long (Apple base UUID) forms, as real accessories do.
// -----------------------------------------------------------------------------

const long = (short) => `${short.padStart(8, '0')}-0000-1000-8000-0026BB765291`;

const info = (name, extra = []) => ({
  iid: 1,
  type: long('3E'),
  characteristics: [
    { iid: 2, type: long('14'), perms: ['pw'], format: 'bool' },
    { iid: 3, type: long('23'), perms: ['pr'], format: 'string', value: name },
    { iid: 4, type: long('20'), perms: ['pr'], format: 'string', value: 'Acme' },
    { iid: 5, type: long('21'), perms: ['pr'], format: 'string', value: 'Model X' },
    ...extra,
  ],
});

export const BRIDGE_DATABASE = {
  accessories: [
    { aid: 1, services: [info('Acme Bridge')] },
    {
      aid: 2,
      services: [
        info('Living room bulb'),
        {
          iid: 9,
          type: '43',
          characteristics: [
            { iid: 10, type: '25', perms: ['pr', 'pw', 'ev'], format: 'bool', value: false },
            {
              iid: 11,
              type: '8',
              perms: ['pr', 'pw', 'ev'],
              format: 'int',
              minValue: 0,
              maxValue: 100,
              value: 40,
            },
            {
              iid: 12,
              type: '13',
              perms: ['pr', 'pw', 'ev'],
              format: 'float',
              minValue: 0,
              maxValue: 360,
              value: 0,
            },
            {
              iid: 13,
              type: '2F',
              perms: ['pr', 'pw', 'ev'],
              format: 'float',
              minValue: 0,
              maxValue: 100,
              value: 100,
            },
            {
              iid: 14,
              type: 'CE',
              perms: ['pr', 'pw', 'ev'],
              format: 'uint32',
              minValue: 153,
              maxValue: 454,
              value: 300,
            },
          ],
        },
      ],
    },
    {
      aid: 3,
      services: [
        info('Hallway sensor'),
        {
          iid: 9,
          type: long('8A'),
          characteristics: [
            {
              iid: 10,
              type: long('11'),
              perms: ['pr', 'ev'],
              format: 'float',
              minValue: -100,
              maxValue: 100,
              value: 21.5,
            },
          ],
        },
        {
          iid: 19,
          type: long('80'),
          characteristics: [{ iid: 20, type: long('6A'), perms: ['pr', 'ev'], value: 1 }],
        },
        {
          iid: 29,
          type: long('96'),
          characteristics: [
            { iid: 30, type: long('68'), perms: ['pr', 'ev'], format: 'uint8', value: 80 },
            { iid: 31, type: long('79'), perms: ['pr'], format: 'uint8', value: 0 },
          ],
        },
      ],
    },
    {
      aid: 4,
      services: [
        info('Bedroom blind'),
        {
          iid: 9,
          type: '8C',
          characteristics: [
            { iid: 10, type: '6D', perms: ['pr', 'ev'], format: 'uint8', value: 0 },
            {
              iid: 11,
              type: '7C',
              perms: ['pr', 'pw', 'ev'],
              format: 'uint8',
              minValue: 0,
              maxValue: 100,
              value: 0,
            },
            { iid: 12, type: '72', perms: ['pr', 'ev'], format: 'uint8', value: 2 },
          ],
        },
      ],
    },
  ],
};

export const MDNS_RESULTS = [
  {
    name: 'Acme Bridge 1A2B._hap._tcp.local',
    host: 'acme-bridge.local',
    addresses: ['fe80::1', '192.168.1.50'],
    port: 51826,
    txt: [
      'c#=3',
      'ff=0',
      'id=1A:2B:3C:4D:5E:6F',
      'md=Acme Bridge',
      'pv=1.1',
      's#=1',
      'sf=0',
      'ci=2',
    ],
  },
  {
    name: 'Eve Energy._hap._tcp.local',
    host: 'eve.local',
    addresses: ['192.168.1.60'],
    port: 80,
    txt: ['c#=1', 'ff=1', 'id=AA:BB:CC:DD:EE:01', 'md=Eve Energy', 'sf=1', 'ci=7'],
  },
];

// A two-button remote with a battery (Eve Button style): the buttons fire the
// `button_pressed` scene trigger, the battery makes it a Gladys device.
const button = (iid, index, name) => ({
  iid,
  type: long('89'),
  characteristics: [
    { iid: iid + 1, type: long('73'), perms: ['pr', 'ev'], format: 'uint8', value: null },
    { iid: iid + 2, type: 'CB', perms: ['pr'], format: 'uint8', value: index },
    { iid: iid + 3, type: '23', perms: ['pr'], format: 'string', value: name },
  ],
});

export const BUTTON_DATABASE = {
  accessories: [
    {
      aid: 1,
      services: [
        info('Hall remote'),
        button(10, 1, 'Up'),
        button(20, 2, 'Down'),
        {
          iid: 30,
          type: '96',
          characteristics: [
            { iid: 31, type: '68', perms: ['pr', 'ev'], format: 'uint8', value: 80 },
            { iid: 32, type: '79', perms: ['pr', 'ev'], format: 'uint8', value: 0 },
          ],
        },
      ],
    },
  ],
};
