import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, DEFAULT_CONFIG } from '../src/config.js';

test('normalizeConfig returns the defaults when called with no argument', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('normalizeConfig coerces numeric strings coming from a form', () => {
  const config = normalizeConfig({ poll_frequency: '120', scan_timeout: '5' });
  assert.equal(config.poll_frequency, 120);
  assert.equal(config.scan_timeout, 5);
});

test('normalizeConfig keeps the values within the manifest bounds', () => {
  const config = normalizeConfig({ poll_frequency: 1, scan_timeout: 600 });
  assert.equal(config.poll_frequency, 10);
  assert.equal(config.scan_timeout, 30);
});

test('normalizeConfig falls back to the default for an invalid value', () => {
  const config = normalizeConfig({ poll_frequency: 'abc' });
  assert.equal(config.poll_frequency, DEFAULT_CONFIG.poll_frequency);
});
