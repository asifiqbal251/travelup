// Tests for brief-check. Run: node --test tools/brief-check.test.mjs
// Negative cases come from the three false claims ChatGPT reproduced against v1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL = fileURLToPath(new URL('./brief-check.mjs', import.meta.url));
const REPO = dirname(dirname(TOOL));

function run(markdown, { repo = REPO } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bc-'));
  const f = join(dir, 'b.md');
  writeFileSync(f, markdown);
  try {
    return { out: execFileSync(process.execPath, [TOOL, f, '--repo', repo], { encoding: 'utf8' }), code: 0 };
  } catch (e) {
    return { out: (e.stdout ?? '') + (e.stderr ?? ''), code: e.status };
  }
}

test('T1: a true file:line claim is not reported as failed', () => {
  const { out, code } = run('See `src/lib/door2/schedule.js:100`.');
  assert.equal(code, 0);
  assert.ok(!/FAILED 1/.test(out), out);
});

test('T2: line 0 fails — line numbers start at 1', () => {
  const { out, code } = run('See `planner.js:0`.');
  assert.equal(code, 2);
  assert.match(out, /planner\.js:0 — line numbers start at 1/);
});

test('T3: a line past the end of the file fails', () => {
  const { out, code } = run('See `planner.js:999999`.');
  assert.equal(code, 2);
  assert.match(out, /planner\.js:999999 — file has \d+ lines/);
});

test('T4: a missing file fails', () => {
  const { out, code } = run('See `src/lib/door2/nope.js`.');
  assert.equal(code, 2);
  assert.match(out, /file not found in repo/);
});

test('T5: an invented field fails — the v1 checker passed this one', () => {
  const { out, code } = run('The field is `spec.requestedDays`.');
  assert.equal(code, 2);
  assert.match(out, /x spec\.requestedDays/);   // assert the finding, not its wording
});

test('T6: a real property on an invented object is UNSUPPORTED, never VERIFIED', () => {
  const { out, code } = run('See `nonexistentObject.totalDays`.');
  assert.equal(code, 0, 'unsupported is not a failure');
  assert.match(out, /nonexistentObject\.totalDays — "totalDays" exists but is never seen on "nonexistentObject"/);
});

test('T7: a name that appears ONLY in a comment does not count as defined', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bcrepo-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'tests'), { recursive: true });
  writeFileSync(join(dir, 'src/a.js'), '// thisOnlyExistsInAComment is not real\nexport const real = 1;\n');
  const bad = run('Uses `thisOnlyExistsInAComment`.', { repo: dir });
  assert.equal(bad.code, 2, bad.out);
  const good = run('Uses `real`.', { repo: dir });
  assert.equal(good.code, 0, good.out);
});

test('T8: a wrong sha256 fails, and the right one passes', () => {
  const wrong = run('`peru-pre-c3a.json` is `88ebac17…5e91e5d`.');
  assert.equal(wrong.code, 2);
  assert.match(wrong.out, /claimed tail …5e91e5d; actual hash is 88ebac17[0-9a-f]+f9e91e5d/);
  const right = run('`peru-pre-c3a.json` is `88ebac17…f9e91e5d`.');
  assert.equal(right.code, 0, right.out);
});

test('T9: a repo path containing spaces works — v1 crashed on exactly this', () => {
  const base = mkdtempSync(join(tmpdir(), 'bc space-'));
  const dir = join(base, 'Codes and Simulation', 'travelup');
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'tests'), { recursive: true });
  writeFileSync(join(dir, 'src/a.js'), 'export const real = 1;\n');
  const { out, code } = run('Uses `real`.', { repo: dir });
  assert.equal(code, 0, out);
  assert.match(out, /VERIFIED 1/);
});

test('T10: a clean brief exits 0; any failure exits 2', () => {
  assert.equal(run('Nothing checkable here.').code, 0);
  assert.equal(run('See `planner.js:0`.').code, 2);
});

function fixtureRepo(sourceFiles) {
  const dir = mkdtempSync(join(tmpdir(), 'bc-syntax-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'tests'), { recursive: true });
  for (const [name, source] of Object.entries(sourceFiles)) {
    const path = join(dir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
  }
  return dir;
}

test('T11: an apostrophe inside a double-quoted string cannot hide a later function', () => {
  const repo = fixtureRepo({
    'src/a.js': 'const message = "We\\\'re here"; function afterQuotedApostrophe() {} const tail = \'x\';\n'
  });
  const { out, code } = run('Uses `afterQuotedApostrophe`.', { repo });
  assert.equal(code, 0, out);
  assert.match(out, /VERIFIED 1/);
});

test('T12: a double quote inside a single-quoted string cannot hide a later function', () => {
  const repo = fixtureRepo({
    'src/a.js': 'const message = \'She said "hello"\'; function afterDoubleQuote() {} const tail = "x";\n'
  });
  const { out, code } = run('Uses `afterDoubleQuote`.', { repo });
  assert.equal(code, 0, out);
  assert.match(out, /VERIFIED 1/);
});

test('T13: regex punctuation, template expressions and JSX text remain distinct', () => {
  const repo = fixtureRepo({
    'src/a.jsx': 'const pattern = /["\\\']/; const label = `prefix ${realCall()} suffix`; function realCall() {} export const Page = () => <div>onlyInJsxText</div>;\n'
  });
  const good = run('Uses `realCall`.', { repo });
  assert.equal(good.code, 0, good.out);
  const bad = run('Uses `onlyInJsxText`.', { repo });
  assert.equal(bad.code, 2, bad.out);
  assert.match(bad.out, /onlyInJsxText/);
});

test('T14: test-file shorthand resolves to its file; unknown names still fail', () => {
  const repo = fixtureRepo({ 'tests/flowIntake.test.js': 'import { test } from "node:test"; test("works", () => {});\n' });
  const good = run('Run `flowIntake` and `tests/flowIntake.test.js`.', { repo });
  assert.equal(good.code, 0, good.out);
  assert.match(good.out, /VERIFIED 2/);
  const bad = run('Run `notATestFile`.', { repo });
  assert.equal(bad.code, 2, bad.out);
});

test('T15: ambiguous shorthand is unsupported, not silently verified', () => {
  const repo = fixtureRepo({
    'src/flowIntake.js': 'export const example = true;\n',
    'tests/flowIntake.test.js': 'export const exampleTest = true;\n'
  });
  const { out, code } = run('Run `flowIntake`.', { repo });
  assert.equal(code, 0, out);
  assert.match(out, /UNSUPPORTED 1/);
  assert.match(out, /more than one module has this shorthand name/);
});

test('T16: the real assembly brief no longer produces the eleven false failures', () => {
  const brief = join(REPO, 'docs/build-brief-f4-assembly-bridge-2026-10-01.md');
  const { out, code } = run(readFileSync(brief, 'utf8'));
  assert.equal(code, 0, out);
  assert.match(out, /FAILED 0/);
});

test('T17: a JSDoc-shaped string is not a type declaration, but real JSDoc is', () => {
  const repo = fixtureRepo({
    'src/a.js': 'const text = "/** @typedef {Object} FakeType */";\n/** @typedef {Object} RealType */\nexport const value = 1;\n'
  });
  const real = run('Uses `RealType`.', { repo });
  assert.equal(real.code, 0, real.out);
  const fake = run('Uses `FakeType`.', { repo });
  assert.equal(fake.code, 2, fake.out);
});

test('T18: ambiguous file basenames cannot silently verify lines or hashes', () => {
  const repo = fixtureRepo({
    'src/shared.js': 'export const a = 1;\n',
    'tests/shared.js': 'export const b = 2;\n'
  });
  const ambiguous = run('See `shared.js:1`.', { repo });
  assert.equal(ambiguous.code, 0, ambiguous.out);
  assert.match(ambiguous.out, /UNSUPPORTED 1/);
  assert.match(ambiguous.out, /matches more than one file/);
  const exact = run('See `src/shared.js:1`.', { repo });
  assert.equal(exact.code, 0, exact.out);
  assert.match(exact.out, /line exists/);
  const ambiguousHash = run('`shared.js` is `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`.', { repo });
  assert.equal(ambiguousHash.code, 0, ambiguousHash.out);
  assert.match(ambiguousHash.out, /sha256 shared\.js — matches more than one file/);
});

test('T19: unparseable source fails with the documented exit code', () => {
  const repo = fixtureRepo({ 'src/broken.js': 'export function broken( {\n' });
  const { out, code } = run('Nothing else to check.', { repo });
  assert.equal(code, 2, out);
  assert.match(out, /cannot parse source/);
});
