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

test('gladys_version covers categories (4.86.0) and capabilities (5.1.0)', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  const minVersion = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.\d+/);
  assert.ok(minVersion, 'gladys_version must declare a minimum version');
  const [, major, minor] = minVersion.map(Number);
  assert.ok(
    major > 5 || (major === 5 && minor >= 1),
    `widgets and scene declarations require gladys_version >= 5.1.0, got "${manifest.gladys_version}"`,
  );
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
    assert.ok(section.description.en.length <= 1000);
    assert.ok(section.description.fr.length <= 1000);
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
