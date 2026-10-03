#!/usr/bin/env node
// brief-check — verifies the MECHANICALLY CHECKABLE claims in a build brief
// against this repository. Read-only.
//
// WHAT IT CHECKS (and nothing more):
//   1. `file.js` and `file.js:NNN` references  -> the file exists; the line is in range (1..n).
//   2. `name.json` + a sha256 (full or elided)  -> recomputed from the file on disk.
//   3. `identifier` / `object.property`         -> a DEFINITION-LIKE occurrence exists in code,
//                                                  with comments and string literals stripped.
//
// WHAT IT CANNOT CHECK, and reports as UNSUPPORTED rather than passing:
//   - whether a cited line actually supports the claim made about it;
//   - whether a property belongs to the object a brief attributes it to;
//   - any semantic claim ("X consumes Y", "this is planning provenance").
// A VERIFIED count is a count of mechanical claims, never of correctness.
//
// Exit status: 0 only when there are no FAILED claims. 2 when any claim failed.
// Usage: node tools/brief-check.mjs <brief.md> [--repo <path>] [--quiet]

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const argv = process.argv.slice(2);
const briefPath = argv.find((a) => !a.startsWith('--'));
const repoFlag = argv.indexOf('--repo');
// fileURLToPath, NOT URL.pathname: the real repo path contains spaces, which
// pathname leaves percent-encoded. That bug made this tool crash on the only
// machine that matters while passing everywhere else.
const REPO = repoFlag >= 0 ? resolvePath(argv[repoFlag + 1]) : dirname(dirname(fileURLToPath(import.meta.url)));

if (!briefPath || !existsSync(briefPath)) {
  console.error(`brief-check: no such brief: ${briefPath ?? '(none given)'}`);
  process.exit(2);
}
for (const d of ['src', 'tests']) {
  if (!existsSync(join(REPO, d))) { console.error(`brief-check: ${REPO} is not the repo (no ${d}/)`); process.exit(2); }
}

const brief = readFileSync(briefPath, 'utf8');
const results = [];                       // {state:'VERIFIED'|'FAILED'|'UNSUPPORTED', what, note}
const add = (state, what, note = '') => results.push({ state, what, note });

// ---------- index the repo ----------
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    if (e === 'node_modules' || e === '.git' || e === 'dist') continue;
    const p = join(d, e);
    statSync(p).isDirectory() ? walk(p) : files.push(p);
  }
})(REPO);
const codeFiles = files.filter((f) => /\.(js|jsx)$/.test(f));
const resolveFile = (name) => files.filter((f) => f === join(REPO, name) || f.endsWith('/' + name));

// Parse syntax rather than removing strings and comments with successive regexes.
// A quote inside another string used to consume real code later in the file.
const namesInCode = new Set();
const qualifiedAccesses = new Set();
const literalValues = [];
const jsdocLines = new Set();
const moduleNames = new Map();
for (const file of codeFiles) {
  const shortName = file.split('/').pop().replace(/(?:\.test)?\.jsx?$/, '');
  moduleNames.set(shortName, [...(moduleNames.get(shortName) ?? []), file]);
  const sourceText = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true,
    file.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.JS);
  if (source.parseDiagnostics.length) {
    add('FAILED', file, `cannot parse source: ${source.parseDiagnostics[0].messageText}`);
    continue;
  }
  // Read attached JSDoc tags from the syntax tree, never JSDoc-shaped text in a string.
  const addName = (name) => { if (name && ts.isIdentifier(name)) namesInCode.add(name.text); };
  const addBinding = (name) => {
    if (ts.isIdentifier(name)) addName(name);
    else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      for (const element of name.elements) if (ts.isBindingElement(element)) addBinding(element.name);
    }
  };
  function visit(node) {
    for (const tag of ts.getJSDocTags(node)) {
      if (['typedef', 'property', 'param', 'returns'].includes(tag.tagName.text)) jsdocLines.add(tag.getText(source));
    }
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) addBinding(node.name);
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) ||
        ts.isClassDeclaration(node) || ts.isClassExpression(node)) addName(node.name);
    if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node) ||
        ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node)) addName(node.name);
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) addName(node.expression);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) addName(node.left);
    if (ts.isPropertyAccessExpression(node)) {
      addName(node.name);
      if (ts.isIdentifier(node.expression)) qualifiedAccesses.add(`${node.expression.text}.${node.name.text}`);
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      literalValues.push(node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
const jsdocText = [...jsdocLines].join('\n');
const hasWord = (text, word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text);

// ---------- 1. file and file:line ----------
for (const m of brief.matchAll(/`([\w./-]+\.(?:js|jsx|json|md))(?::(-?\d+)(?:\s*[–\-—]\s*(-?\d+))?)?`/g)) {
  const [, name, l1, l2] = m;
  const hits = resolveFile(name);
  if (hits.length === 0) {
    // Design docs and briefs live outside the repo; this tool cannot see them.
    if (/^claude\//.test(name) || /\.md$/.test(name)) add('UNSUPPORTED', name, 'outside the repo (project doc) — not checkable here');
    else add('FAILED', name, 'file not found in repo');
    continue;
  }
  if (hits.length > 1) { add('UNSUPPORTED', name, 'matches more than one file; use a repo-relative path'); continue; }
  if (!l1) { add('VERIFIED', name, 'file exists'); continue; }
  const n = readFileSync(hits[0], 'utf8').split('\n').length;
  for (const l of [l1, l2].filter(Boolean)) {
    const v = Number(l);
    if (!Number.isInteger(v) || v < 1) add('FAILED', `${name}:${l}`, 'line numbers start at 1');
    else if (v > n) add('FAILED', `${name}:${l}`, `file has ${n} lines`);
    else add('UNSUPPORTED', `${name}:${l}`, 'line exists; this tool cannot check that it supports the claim');
  }
}

// ---------- 2. sha256 ----------
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
for (const m of brief.matchAll(/`([\w.-]+\.(?:json|js))`[^\n]{0,160}?`?\b([0-9a-f]{8,64})(?:\s*[….]{1,3}\s*([0-9a-f]{6,24}))?\b/g)) {
  const [, name, a, b] = m;
  const hits = resolveFile(name);
  if (!hits.length) continue;
  if (hits.length > 1) { add('UNSUPPORTED', `sha256 ${name}`, 'matches more than one file; use a repo-relative path'); continue; }
  const h = sha(hits[0]);
  if (a.length === 64) { h === a ? add('VERIFIED', `sha256 ${name}`) : add('FAILED', `sha256 ${name}`, `actual ${h}`); continue; }
  if (!h.startsWith(a)) { add('FAILED', `sha256 ${name}`, `head ${a}… but actual ${h.slice(0, a.length)}…`); continue; }
  if (b && !h.endsWith(b)) { add('FAILED', `sha256 ${name}`, `claimed tail …${b}; actual hash is ${h}`); continue; }
  add(b ? 'VERIFIED' : 'UNSUPPORTED', `sha256 ${name}`, b ? '' : 'only the head was given; ask for the full hash');
}

// ---------- 3. identifiers ----------
const BUILTIN = new Set(['true','false','null','undefined','this','string','number','boolean','object','array','length','push','map','filter','some','every','find','slice','keys','values','entries','includes','join','split','test','match','replace','console','process']);
const seen = new Set();
for (const m of brief.matchAll(/`([A-Za-z_$][\w$]{2,}(?:\.[A-Za-z_$][\w$]*)*)(?:\(\))?`/g)) {
  const id = m[1];
  if (/\.(js|jsx|json|md)$/.test(id)) continue;
  if (/^[0-9a-f]{8,64}$/.test(id)) continue; // Digest text is checked in the sha256 section.
  if (seen.has(id)) continue;
  seen.add(id);
  const parts = id.split('.');
  const leaf = parts[parts.length - 1];
  if (BUILTIN.has(leaf) || leaf.length < 3) continue;
  if (!/[a-z]/.test(leaf)) continue;                       // SCREAMING_CASE constants: skip
  const modules = moduleNames.get(leaf) ?? [];
  if (modules.length === 1) { add('VERIFIED', id, 'a module in this repo'); continue; }
  if (modules.length > 1) { add('UNSUPPORTED', id, 'more than one module has this shorthand name'); continue; }
  if (!namesInCode.has(leaf)) {
    const asLiteral = literalValues.includes(leaf);
    const asType = hasWord(jsdocText, leaf);
    if (asLiteral) { add('VERIFIED', id, 'a string literal in code (e.g. a reason code)'); continue; }
    if (asType) { add('VERIFIED', id, 'a JSDoc type or property'); continue; }
    add('FAILED', id, 'no occurrence in code, string literals or JSDoc');
    continue;
  }
  if (parts.length === 1) { add('VERIFIED', id, 'defined in code'); continue; }
  // A real property access ties the leaf to this owner; a leaf alone does not.
  const owner = parts[parts.length - 2];
  qualifiedAccesses.has(`${owner}.${leaf}`)
    ? add('VERIFIED', id, `${owner}.${leaf} appears in code`)
    : add('UNSUPPORTED', id, `"${leaf}" exists but is never seen on "${owner}" — may be misattributed`);
}

// ---------- report ----------
const by = (s) => results.filter((r) => r.state === s);
const [v, f, u] = [by('VERIFIED'), by('FAILED'), by('UNSUPPORTED')];
const quiet = argv.includes('--quiet');
console.log(`brief-check  repo=${REPO}`);
console.log(`  VERIFIED ${v.length}   FAILED ${f.length}   UNSUPPORTED ${u.length}`);
if (f.length) { console.log('\nFAILED:'); for (const r of f) console.log(`  x ${r.what}${r.note ? ' — ' + r.note : ''}`); }
if (u.length && !quiet) { console.log('\nUNSUPPORTED (named, not proof):'); for (const r of u) console.log(`  ? ${r.what}${r.note ? ' — ' + r.note : ''}`); }
console.log(`\nA VERIFIED count counts mechanical claims. It is not evidence the brief is correct.`);
process.exit(f.length ? 2 : 0);
