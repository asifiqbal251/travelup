// UI-level check of the Move flow: the real StructureSheet component (bundled
// with esbuild, server-rendered) is driven through picker → tap → confirm.
// Engine tests can't catch a UI that drops or mis-renders the chosen proposal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));
const outfile = fileURLToPath(new URL('./.moveUi.bundle.mjs', import.meta.url));
await build({
  stdin: {
    contents: `
      export { StructureSheet } from './src/pages/Door2Plan.jsx';
      export { pickMove } from './src/lib/door2/proposalView.js';
      export { PILOT_DATA, buildFilledTrip } from './src/lib/door2/planner.js';
      export { listMoveOptions } from './src/lib/door2/restructure.js';
      export { createElement } from 'react';
      export { renderToStaticMarkup } from 'react-dom/server';`,
    resolveDir: root
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  alias: { '@': root + 'src' },
  loader: { '.jsx': 'jsx', '.js': 'jsx' },
  jsx: 'automatic',
  define: { 'import.meta.env': '{}' },
  packages: 'external',
  logLevel: 'silent',
  plugins: [{ name: 'stub-page-not-found', setup(b) {
    // PageNotFound pulls in the Base44 client (browser-only); irrelevant to the sheet.
    b.onResolve({ filter: /PageNotFound$/ }, () => ({ path: 'stub-pnf', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default () => null;', loader: 'js' }));
  } }, { name: 'externalize-non-relative', setup(b) {
    b.onResolve({ filter: /^[^.@/]|^@[^/]+\// }, (a) => (a.kind === 'entry-point' ? null : { path: a.path, external: true }));
  } }]
});
const M = await import(outfile);
const { rmSync } = await import('node:fs');
rmSync(outfile);

const DRAFTS = { reviewPolicy: 'allow_drafts' };
const trip = M.buildFilledTrip(
  { originPlaceId: 'vancouver', destination: { kind: 'country', id: 'PE' }, travelMonth: 10, totalDays: 16, travellerType: 'couple', interests: [], pace: 'balanced', budget: 'mid', routeTemplateId: 'peru_classic+huaraz@after_lima_in' },
  M.PILOT_DATA, DRAFTS
);
const { current, options } = M.listMoveOptions(trip, 'huaraz', DRAFTS);
const moveSheet = { stage: 'move', optionalId: 'huaraz', optionalLabel: 'Huaraz', current, options };
const noop = () => {};
const handlers = { onMoreTime: noop, onLessTime: noop, onRemoveOptional: noop, onAddOptional: noop, onMoveOptional: noop, onBackToMove: noop, onUseProposal: noop, onClose: noop };
const render = (sheet, extra = {}) =>
  M.renderToStaticMarkup(M.createElement(M.StructureSheet, { sheet, trip, ...handlers, onPickMove: noop, ...extra }));

/** Depth-first search of a React element tree (StructureSheet has no hooks, so calling it is safe). */
function findAll(node, pred, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((n) => findAll(n, pred, out)); return out; }
  if (pred(node)) out.push(node);
  findAll(node.props?.children, pred, out);
  return out;
}
const text = (node) => (node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' ? text(node.props?.children) : String(node));
const column = (html, label) => html.split(label)[1].split('</div>')[0].replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');

test('Move UI: picker labels tell the two positions apart', () => {
  const tree = M.StructureSheet({ sheet: moveSheet, trip, ...handlers, onPickMove: noop });
  const buttons = findAll(tree, (n) => n.type === 'button' && typeof n.props.onClick === 'function' && text(n).includes('flying home'));
  assert.equal(buttons.length, 1, 'alternate position card is rendered');
  const html = render(moveSheet);
  assert.match(html, /Right after arriving in Lima/);
  assert.match(html, /Near the end, before flying home/);
});

test('Move UI: tapping the alternate card yields a confirm screen whose Before and After differ, and After has Huaraz last', () => {
  let picked;
  const tree = M.StructureSheet({ sheet: moveSheet, trip, ...handlers, onPickMove: (p) => { picked = p; } });
  const [card] = findAll(tree, (n) => n.type === 'button' && text(n).includes('flying home'));
  card.props.onClick(); // the real tap handler

  assert.ok(picked, 'tap passed a proposal to onPickMove');
  assert.equal(picked.kind, 'move_optional');
  assert.equal(picked.id, 'move:huaraz:after_machu_picchu', 'proposal targets the alternate position, not the current one');
  assert.equal(picked.routePlan.optionals[0].positionId, 'after_machu_picchu');

  const html = render(M.pickMove(moveSheet, picked));
  const before = column(html, 'Before');
  const after = column(html, 'After</p>');
  assert.notEqual(before, after, 'Before and After columns must not be identical');
  assert.ok(before.indexOf('Huaraz') < before.indexOf('Cusco'), 'Before: Huaraz precedes Cusco');
  assert.ok(after.indexOf('Huaraz') > after.indexOf('Cusco'), 'After: Huaraz comes after Cusco');
});
