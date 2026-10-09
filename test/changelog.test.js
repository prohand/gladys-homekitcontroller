import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-homekitcontroller';

test('the first release moves Unreleased under the version and links its tag', () => {
  const text = `# Changelog\n\n## [Unreleased]\n\n### Ajouté\n\n- Nouveauté.\n\n[Unreleased]: ${REPO}/commits/main\n`;
  assert.equal(
    rollChangelog(text, '1.0.1', '2026-10-09'),
    `# Changelog\n\n## [Unreleased]\n\n## [1.0.1] - 2026-10-09\n\n### Ajouté\n\n- Nouveauté.\n\n` +
      `[Unreleased]: ${REPO}/compare/v1.0.1...HEAD\n[1.0.1]: ${REPO}/releases/tag/v1.0.1\n`,
  );
});

test('the project CHANGELOG is ready for the Release workflow', async () => {
  const content = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.match(content, /^## \[Unreleased\]$/m);
  assert.match(
    content,
    /^\[Unreleased\]: https:\/\/github\.com\/prohand\/gladys-homekitcontroller\//m,
  );
});
