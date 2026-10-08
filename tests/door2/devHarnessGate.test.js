import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// The Door 2 developer harness (src/pages/Door2Dev.jsx) must exist only in development
// builds. Build brief docs/... dev-harness development-only, revision 3 (approved):
//   T1  import structure of src/App.jsx
//   T2  a production build excludes the harness
//   T3  positive control: an explicit development build includes it
//   T4  a build with NODE_ENV=development leaked into an otherwise default build
//       excludes it (the case a one-flag gate would get wrong)
//
// These are regression checks on THIS repository's build. They are not proof of what
// Base44 publishes; that is the hosted check (brief section 8).

const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const APP = join(REPO, 'src', 'App.jsx');
const HARNESS_MODULE = '/src/pages/Door2Dev.jsx';
const KNOWN_PRESENT_MODULE = '/src/pages/Door2Plan.jsx';
const HARNESS_MARKER = 'Not for real travellers';

// ---------------------------------------------------------------- T1: import structure

const sourceFile = ts.createSourceFile('App.jsx', readFileSync(APP, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);

const isHarnessSpecifier = (s) => /(^|\/)Door2Dev(\.jsx?)?$/.test(s);

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

function enclosingConditional(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isConditionalExpression(n)) return n;
  }
  return null;
}

test('T1: the harness is never statically imported, under any alias', () => {
  const staticImports = [];
  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier) && isHarnessSpecifier(stmt.moduleSpecifier.text)) {
      staticImports.push(stmt.moduleSpecifier.text);
    }
  }
  assert.deepEqual(staticImports, [], 'src/App.jsx must not statically import the harness module');
});

test('T1: the only import of the harness is one dynamic import, inside the development-only branch of a module-scope gate', () => {
  const dynamicHarness = [];
  walk(sourceFile, (n) => {
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = n.arguments[0];
      if (arg && ts.isStringLiteral(arg) && isHarnessSpecifier(arg.text)) dynamicHarness.push(n);
    }
  });
  assert.equal(dynamicHarness.length, 1, 'exactly one dynamic import of the harness');

  // lazy(() => import(...)) must sit in the TRUE branch of a conditional on the gate.
  const cond = enclosingConditional(dynamicHarness[0]);
  assert.ok(cond, 'the dynamic import must be inside a conditional expression');
  assert.ok(ts.isIdentifier(cond.condition) && cond.condition.text === 'HARNESS_ENABLED', 'the condition must be the HARNESS_ENABLED gate');
  assert.ok(cond.whenTrue.pos <= dynamicHarness[0].pos && dynamicHarness[0].end <= cond.whenTrue.end, 'the dynamic import must be in the true branch');
  assert.equal(cond.whenFalse.kind, ts.SyntaxKind.NullKeyword, 'the false branch must be null');

  // ...and that conditional is the initialiser of a module-scope `const Door2Dev`.
  const decl = cond.parent;
  assert.ok(ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name) && decl.name.text === 'Door2Dev', 'the gate must initialise Door2Dev');
  const stmt = decl.parent.parent;
  assert.ok(ts.isVariableStatement(stmt) && stmt.parent === sourceFile, 'Door2Dev must be declared at module scope');
  assert.ok(cond.whenTrue.getText().includes('lazy('), 'the true branch must be lazy(...)');
});

test('T1: the gate needs both the development flag and a non-production mode', () => {
  let gate = null;
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const d of stmt.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.name.text === 'HARNESS_ENABLED') gate = d;
    }
  }
  assert.ok(gate && gate.initializer, 'HARNESS_ENABLED must be declared at module scope');
  const text = gate.initializer.getText().replace(/\s+/g, ' ');
  assert.equal(text, "import.meta.env.DEV && import.meta.env.MODE !== 'production'");
});

test('T1: lazy and Suspense come from react', () => {
  const imp = sourceFile.statements.find(
    (s) => ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && s.moduleSpecifier.text === 'react'
  );
  assert.ok(imp, 'src/App.jsx must import from react');
  const names = imp.importClause.namedBindings.elements.map((e) => e.name.text).sort();
  assert.deepEqual(names, ['Suspense', 'lazy']);
});

test('T1: the route is registered only when the component exists, with Suspense inside its element', () => {
  const found = [];
  walk(sourceFile, (n) => {
    if (ts.isJsxSelfClosingElement(n) && n.tagName.getText() === 'Route') {
      const path = n.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.text === 'path');
      if (path && path.initializer && ts.isStringLiteral(path.initializer) && path.initializer.text === '/dev/door2') found.push(n);
    }
  });
  assert.equal(found.length, 1, 'exactly one /dev/door2 route');
  const route = found[0];
  const guard = route.parent;
  assert.ok(ts.isBinaryExpression(guard) && guard.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken, 'route must be the right side of &&');
  assert.ok(ts.isIdentifier(guard.left) && guard.left.text === 'Door2Dev', 'guarded by the Door2Dev component existing');
  assert.ok(ts.isJsxExpression(guard.parent), 'the guard is a JSX expression directly inside the route list');
  const element = route.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.text === 'element');
  assert.ok(element.initializer.getText().includes('<Suspense'), 'Suspense must be inside the route element');
});

// ---------------------------------------------------------------- T2-T4: real builds

// Runs the repository's real build, with its real configuration and plugins, in a CHILD
// process whose environment is set explicitly. Nothing is written to dist/ or anywhere
// else (write:false); the output directory is a temporary one that is removed afterwards.
const CHILD = `
import { build } from 'vite';
const mode = process.env.GATE_TEST_MODE || undefined;
const out = await build({
  root: process.cwd(),
  mode,
  logLevel: 'silent',
  build: { write: false, outDir: process.env.GATE_TEST_OUTDIR, emptyOutDir: false },
});
const outputs = Array.isArray(out) ? out : [out];
const chunks = [];
for (const o of outputs) {
  for (const item of o.output) {
    if (item.type === 'chunk') chunks.push({ fileName: item.fileName, moduleIds: item.moduleIds, code: item.code });
  }
}
process.stdout.write('\\n@@RESULT@@' + JSON.stringify({ chunks }) + '\\n');
`;

function runBuild({ nodeEnv, mode }) {
  const outDir = mkdtempSync(join(tmpdir(), 'devHarnessGate-'));
  try {
    // A clean environment: nothing inherited that could select a mode or a flag.
    const env = { ...process.env, NODE_ENV: nodeEnv, GATE_TEST_OUTDIR: outDir };
    for (const k of Object.keys(env)) if (k === 'MODE' || k === 'VITE_MODE' || k.startsWith('VITE_')) delete env[k];
    if (mode) env.GATE_TEST_MODE = mode; else delete env.GATE_TEST_MODE;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD], {
      cwd: REPO, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
    });
    assert.equal(r.status, 0, `the build must succeed (exit ${r.status}).\n${r.stderr}`);
    const line = r.stdout.split('\n').find((l) => l.startsWith('@@RESULT@@'));
    assert.ok(line, 'the build must report its output');
    const { chunks } = JSON.parse(line.slice('@@RESULT@@'.length));
    assert.ok(Array.isArray(chunks) && chunks.length > 0, 'the build must emit at least one JavaScript chunk');
    for (const c of chunks) {
      assert.ok(typeof c.code === 'string' && c.code.length > 0, `chunk ${c.fileName} must be non-empty`);
      assert.ok(Array.isArray(c.moduleIds) && c.moduleIds.length > 0, `chunk ${c.fileName} must report its modules`);
    }
    return chunks;
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

const normalise = (id) => id.replace(/\\/g, '/').split('?')[0];
const hasModule = (chunks, suffix) => chunks.some((c) => c.moduleIds.some((id) => normalise(id).endsWith(suffix)));
const hasMarker = (chunks) => chunks.some((c) => c.code.includes(HARNESS_MARKER));
const harnessFiles = (chunks) => chunks.filter((c) => /Door2Dev/.test(c.fileName)).map((c) => c.fileName);

test('T2: a production build excludes the harness (module list and marker, every chunk)', () => {
  const chunks = runBuild({ nodeEnv: 'production', mode: 'production' });
  assert.ok(hasModule(chunks, KNOWN_PRESENT_MODULE), 'sanity: the module matcher finds a module that must be present');
  assert.equal(hasModule(chunks, HARNESS_MODULE), false, 'the harness module must not be in any chunk');
  assert.equal(hasMarker(chunks), false, 'the harness wording must not be in any chunk');
  assert.deepEqual(harnessFiles(chunks), [], 'no chunk may be named for the harness');
});

test('T3: positive control — an explicit development build includes the harness', () => {
  const chunks = runBuild({ nodeEnv: 'development', mode: 'development' });
  assert.ok(hasModule(chunks, KNOWN_PRESENT_MODULE), 'sanity: the module matcher finds a module that must be present');
  assert.equal(hasModule(chunks, HARNESS_MODULE), true, 'by module identity, the harness must be present');
  assert.equal(hasMarker(chunks), true, 'by wording, the harness must be present');
});

test('T4: NODE_ENV=development leaked into a default-mode build still excludes the harness', () => {
  // Mode deliberately left unspecified so the build tool picks its own default.
  const chunks = runBuild({ nodeEnv: 'development', mode: undefined });
  assert.ok(hasModule(chunks, KNOWN_PRESENT_MODULE), 'sanity: the module matcher finds a module that must be present');
  assert.equal(hasModule(chunks, HARNESS_MODULE), false, 'the harness module must not be in any chunk');
  assert.equal(hasMarker(chunks), false, 'the harness wording must not be in any chunk');
  assert.deepEqual(harnessFiles(chunks), [], 'no chunk may be named for the harness');
});
