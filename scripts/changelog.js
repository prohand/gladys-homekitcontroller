#!/usr/bin/env node
// -----------------------------------------------------------------------------
// CHANGELOG.md helper used by the release workflows (no dependency).
//
//   node scripts/changelog.js release <version> <YYYY-MM-DD>
//     Moves the entries of the "## [Unreleased]" section into a new
//     "## [<version>] - <date>" section, and leaves an empty "Unreleased".
//
//   node scripts/changelog.js notes <version>
//     Prints the body of the "## [<version>]" section: the notes of the
//     GitHub Release.
//
// Format: https://keepachangelog.com/fr/1.1.0/
// -----------------------------------------------------------------------------

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const UNRELEASED = 'Unreleased';

// Shown when a release is cut without any entry under "Unreleased".
export const EMPTY_RELEASE_NOTE = '- Version de maintenance (mises à jour des dépendances).';

const HEADING = /^## \[([^\]]+)\]/;

/** Split the changelog into its preamble and its "## [x]" sections. */
export function parseChangelog(content) {
  const lines = content.split('\n');
  const preamble = [];
  const sections = [];
  for (const line of lines) {
    const match = line.match(HEADING);
    if (match) {
      sections.push({ name: match[1], heading: line, body: [] });
    } else if (sections.length === 0) {
      preamble.push(line);
    } else {
      sections.at(-1).body.push(line);
    }
  }
  return { preamble, sections };
}

const trimLines = (lines) => lines.join('\n').trim();

function render({ preamble, sections }) {
  const parts = [trimLines(preamble)];
  for (const section of sections) {
    const body = trimLines(section.body);
    parts.push(body ? `${section.heading}\n\n${body}` : section.heading);
  }
  return `${parts.join('\n\n')}\n`;
}

/** Body of a section, or null when the section does not exist. */
export function sectionNotes(content, name) {
  const section = parseChangelog(content).sections.find((s) => s.name === name);
  return section ? trimLines(section.body) : null;
}

/**
 * Turn the "Unreleased" entries into the `version` section.
 * @throws when "Unreleased" is missing or `version` is already listed
 */
export function releaseChangelog(content, version, date) {
  const parsed = parseChangelog(content);
  const index = parsed.sections.findIndex((s) => s.name === UNRELEASED);
  if (index === -1) {
    throw new Error('CHANGELOG.md has no "## [Unreleased]" section');
  }
  if (parsed.sections.some((s) => s.name === version)) {
    throw new Error(`CHANGELOG.md already has a section for ${version}`);
  }
  const unreleased = parsed.sections[index];
  const body = trimLines(unreleased.body) || EMPTY_RELEASE_NOTE;
  parsed.sections.splice(
    index,
    1,
    { name: UNRELEASED, heading: `## [${UNRELEASED}]`, body: [] },
    { name: version, heading: `## [${version}] - ${date}`, body: [body] },
  );
  return render(parsed);
}

async function main([command, version, date]) {
  const file = new URL('../CHANGELOG.md', import.meta.url);
  const content = await readFile(file, 'utf8');
  if (command === 'release' && version && /^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
    await writeFile(file, releaseChangelog(content, version, date));
    return;
  }
  if (command === 'notes' && version) {
    const notes = sectionNotes(content, version);
    if (notes === null) {
      throw new Error(`CHANGELOG.md has no section for ${version}`);
    }
    process.stdout.write(`${notes || EMPTY_RELEASE_NOTE}\n`);
    return;
  }
  throw new Error('Usage: changelog.js release <version> <YYYY-MM-DD> | notes <version>');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
