// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG } from '../src/config.js';
import { SCENE_TRIGGERS, WIDGETS } from '../src/controller.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const indexSource = await readFile(new URL('../index.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// The four languages of the Gladys interface: every user-facing text carries them all.
const LANGUAGES = ['en', 'fr', 'de', 'es'];

/** Every multi-language object of the manifest, with its JSON path. */
function multiLanguageTexts(node, path = '$', found = []) {
  if (Array.isArray(node)) {
    node.forEach((item, index) => multiLanguageTexts(item, `${path}[${index}]`, found));
  } else if (node && typeof node === 'object') {
    if (typeof node.en === 'string') {
      found.push({ path, text: node });
    } else {
      for (const [key, value] of Object.entries(node)) {
        multiLanguageTexts(value, `${path}.${key}`, found);
      }
    }
  }
  return found;
}

test('every manifest action has a registered handler', () => {
  for (const action of manifest.actions ?? []) {
    assert.ok(
      indexSource.includes(`gladys.onAction('${action.key}'`),
      `manifest action "${action.key}" has no handler in index.js`,
    );
  }
});

test('every scene action and widget has a registered handler', () => {
  for (const action of manifest.scene_actions ?? []) {
    assert.ok(
      indexSource.includes(`gladys.onSceneAction('${action.key}'`),
      `scene action "${action.key}" has no handler in index.js`,
    );
  }
  for (const widget of manifest.widgets ?? []) {
    assert.ok(
      indexSource.includes(`gladys.onWidgetGet('${widget.key}'`),
      `widget "${widget.key}" has no onWidgetGet handler in index.js`,
    );
  }
});

test('the scene triggers fired by the code are declared', () => {
  const declared = (manifest.scene_triggers ?? []).map((trigger) => trigger.key).sort();
  assert.deepEqual(Object.values(SCENE_TRIGGERS).sort(), declared);
  assert.deepEqual(
    Object.values(WIDGETS),
    (manifest.widgets ?? []).map((w) => w.key),
  );
});

test('the manifest and package.json versions stay in lockstep', () => {
  assert.equal(manifest.version, packageJson.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('mDNS discovery of HomeKit accessories is declared', () => {
  assert.deepEqual(manifest.network_discovery, [{ type: 'mdns', service: '_hap._tcp' }]);
});

test('only the local transport is declared (HomeKit IP never uses a cloud)', () => {
  assert.deepEqual(manifest.transports, ['local']);
});

// The store's catalog shelves (2026-10): an unknown key is silently dropped.
const CATEGORY_VOCABULARY = [
  'climate',
  'lighting',
  'energy',
  'security',
  'multimedia',
  'appliances',
  'environment',
  'protocols',
  'network',
  'notifications',
  'assistants',
  'services',
  'transport',
  'vehicles',
  'servers',
  'leisure',
];

/** The minimum of `gladys_version` as [major, minor, patch]. */
function gladysFloor() {
  const minVersion = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(minVersion, 'gladys_version must declare a minimum version');
  return minVersion.slice(1).map(Number);
}

/** True when the `gladys_version` minimum is at least `major.minor.patch`. */
function floorAtLeast(major, minor, patch = 0) {
  const [fMajor, fMinor, fPatch] = gladysFloor();
  if (fMajor !== major) return fMajor > major;
  if (fMinor !== minor) return fMinor > minor;
  return fPatch >= patch;
}

test('gladys_version covers every declared field', () => {
  assert.ok(floorAtLeast(4, 86), 'categories require gladys_version >= 4.86.0');
  assert.ok(floorAtLeast(5, 1), 'widgets and scene declarations require gladys_version >= 5.1.0');
  if (manifest.keywords || manifest.countries || manifest.music) {
    assert.ok(
      floorAtLeast(5, 3),
      `keywords / countries / music require gladys_version >= 5.3.0, got "${manifest.gladys_version}"`,
    );
  }
});

test('categories are 1 to 3 shelves of the store vocabulary', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.equal(new Set(manifest.categories).size, manifest.categories.length);
  for (const category of manifest.categories) {
    assert.ok(CATEGORY_VOCABULARY.includes(category), `unknown category "${category}"`);
  }
});

test('keywords are 1 to 10 unique search terms of 2 to 30 characters', () => {
  assert.ok(Array.isArray(manifest.keywords));
  assert.ok(manifest.keywords.length >= 1 && manifest.keywords.length <= 10);
  const normalized = manifest.keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, normalized.length, 'keywords must be unique');
  for (const keyword of normalized) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, `keyword "${keyword}"`);
  }
});

test('no countries: HomeKit accessories are sold worldwide', () => {
  assert.equal(manifest.countries, undefined);
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(
        DEFAULT_CONFIG[field.key],
        field.default,
        `DEFAULT_CONFIG.${field.key} must match the manifest default`,
      );
    }
  }
});

test('section fields are purely presentational', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
    assert.ok(section.label?.en);
    for (const lang of LANGUAGES) {
      assert.ok(section.description[lang].length <= 1000, `section ${section.key} (${lang})`);
    }
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  const allFields = [
    ...manifest.config_schema,
    ...(manifest.actions ?? []).flatMap((a) => a.fields ?? []),
    ...(manifest.scene_triggers ?? []).flatMap((a) => a.fields ?? []),
    ...(manifest.scene_actions ?? []).flatMap((a) => a.fields ?? []),
  ];
  for (const field of allFields.filter((f) => f.source !== undefined)) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined);
  }
});

test('every user-facing text is translated in en, fr, de and es', () => {
  const texts = multiLanguageTexts(manifest);
  assert.ok(texts.length > 0);
  for (const { path, text } of texts) {
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), `${path} languages`);
    for (const lang of LANGUAGES) {
      assert.equal(typeof text[lang], 'string', `${path}.${lang}`);
      assert.ok(text[lang].trim().length > 0, `${path}.${lang} is empty`);
    }
  }
});

test('texts respect the store length limits in every language', () => {
  for (const lang of LANGUAGES) {
    const length = manifest.description[lang].length;
    assert.ok(length >= 10 && length <= 100, `catalog description (${lang}): ${length}`);
    for (const widget of manifest.widgets ?? []) {
      const label = widget.label[lang].length;
      assert.ok(label >= 3 && label <= 30, `widget ${widget.key} label (${lang}): ${label}`);
      assert.ok(
        widget.description[lang].length <= 100,
        `widget ${widget.key} description (${lang})`,
      );
    }
  }
});
