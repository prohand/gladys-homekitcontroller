import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  EMPTY_RELEASE_NOTE,
  releaseChangelog,
  sectionNotes,
  parseChangelog,
} from '../scripts/changelog.js';

const SAMPLE = `# Changelog

Intro.

## [Unreleased]

### Ajouté

- Une nouveauté.

## [1.0.0] - 2026-10-01

### Ajouté

- Première version.
`;

test('releaseChangelog moves the Unreleased entries to the new version', () => {
  const released = releaseChangelog(SAMPLE, '1.1.0', '2026-10-09');
  assert.equal(
    released,
    `# Changelog

Intro.

## [Unreleased]

## [1.1.0] - 2026-10-09

### Ajouté

- Une nouveauté.

## [1.0.0] - 2026-10-01

### Ajouté

- Première version.
`,
  );
  assert.equal(sectionNotes(released, '1.1.0'), '### Ajouté\n\n- Une nouveauté.');
  assert.equal(sectionNotes(released, 'Unreleased'), '');
  assert.equal(sectionNotes(released, '9.9.9'), null);
});

test('a release without entries gets a maintenance note', () => {
  const once = releaseChangelog(SAMPLE, '1.1.0', '2026-10-09');
  const twice = releaseChangelog(once, '1.1.1', '2026-10-10');
  assert.equal(sectionNotes(twice, '1.1.1'), EMPTY_RELEASE_NOTE);
});

test('releaseChangelog refuses a version already listed or a missing Unreleased', () => {
  assert.throws(() => releaseChangelog(SAMPLE, '1.0.0', '2026-10-09'), /already has a section/);
  assert.throws(
    () => releaseChangelog('# Changelog\n\n## [1.0.0]\n', '1.1.0', '2026-10-09'),
    /no "## \[Unreleased\]" section/,
  );
});

test('the project CHANGELOG keeps an Unreleased section for the release workflow', async () => {
  const content = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const { sections } = parseChangelog(content);
  assert.equal(sections[0]?.name, 'Unreleased', 'the first section must be [Unreleased]');
  for (const section of sections.slice(1)) {
    assert.match(section.heading, /^## \[\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2}$/);
  }
});
