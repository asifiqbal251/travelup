import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Direction B Stage 3 — the three public "I know where I'm going" entry links open the
// new planner, and everything that lets a traveller reach the classic planner is
// untouched. Build brief B Stage 3, revision 4 (approved), sections 5 and 5.1.
//
// These are SOURCE-STRUCTURE checks. They do not establish that a click navigates:
// that is what the rendered acceptance examples (brief section 6) and the hosted
// checks (section 7.2) are for, and a pass here never substitutes for either.
//
// Two kinds of test live here, and they are mutated differently (brief section 5.1):
//   T1, T2, T5  CHANGE at this commit — they must fail against the unchanged base.
//   T3, T4      PRESERVE existing behaviour — they pass before and after.
//
// Each test identifies the ONE link it is about by the words a traveller reads on it,
// then asserts that link's own target. An earlier version counted targets across a
// whole file; the independent reviewer defeated that by swapping the hero's two
// buttons, which left the counts unchanged. Counting is not identification.

const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const PLANNER_PATH = '/plan';
const CLASSIC_PATH = '/find';
const QUESTIONNAIRE_PATH = '/questionnaire';

const ENTRY_LABEL = "I know where I'm going";
const TRAVEL_FIT_LABEL = 'Find my Travel Fit';
const SHORTCUT_TEXT = 'Go to the planner →';
const SHORTCUT_LEAD = "Already know where you're going?";
const RETIRED_TEXT = 'Skip straight to the dates';

const LANDING = join('src', 'pages', 'Landing.jsx');
const SLIDESHOW = join('src', 'components', 'LandingHeroSlideshow.jsx');
const QUESTION_VIEW = join('src', 'components', 'questionnaire', 'QuestionView.jsx');

// The two pages that carry both a planner button and a Travel Fit button. Swapping
// those two targets is the mutation that a counting test cannot see.
const BUTTON_PAGES = [
  { label: 'landing page', path: LANDING },
  { label: 'hero slideshow', path: SLIDESHOW },
];

const read = (relative) => readFileSync(join(REPO, relative), 'utf8');
const parse = (relative) =>
  ts.createSourceFile(relative, read(relative), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

const decode = (s) =>
  s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');

/** The words a reader actually sees inside a JSX element: its text nodes, nothing else. */
function visibleText(node) {
  let out = '';
  walk(node, (n) => {
    if (ts.isJsxText(n)) out += n.text;
  });
  return decode(out).replace(/\s+/g, ' ').trim();
}

/**
 * Every router Link in a file, as {text, target}. `target` is the literal string the
 * link navigates to, or null when the target is computed rather than written out.
 * A null is never treated as a pass by any test below: each test requires a literal.
 */
function routerLinks(sourceFile) {
  const links = [];
  walk(sourceFile, (n) => {
    if (!ts.isJsxElement(n) && !ts.isJsxSelfClosingElement(n)) return;
    const opening = ts.isJsxElement(n) ? n.openingElement : n;
    if (opening.tagName.getText() !== 'Link') return;
    let target = null;
    for (const prop of opening.attributes.properties) {
      if (!ts.isJsxAttribute(prop) || prop.name.getText() !== 'to') continue;
      const init = prop.initializer;
      if (init && ts.isStringLiteral(init)) target = init.text;
      else if (init && ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression)) {
        target = init.expression.text;
      } else target = null; // computed: recorded as absent, never as a match
    }
    links.push({ node: n, text: visibleText(n), target });
  });
  return links;
}

/** The one link whose visible words are exactly `label`. Finding none, or several, fails. */
function theLinkReading(relative, label) {
  const matches = routerLinks(parse(relative)).filter((l) => l.text === label);
  assert.equal(
    matches.length,
    1,
    `${relative} must contain exactly one link reading "${label}", found ${matches.length}. ` +
      `Links in this file: ${JSON.stringify(routerLinks(parse(relative)).map((l) => ({ text: l.text, target: l.target })))}`
  );
  return matches[0];
}

// ------------------------------------------------- T1: the intended buttons, by their words

for (const page of BUTTON_PAGES) {
  test(`T1: the ${page.label} entry button — the one reading "${ENTRY_LABEL}" — opens the new planner`, () => {
    const link = theLinkReading(page.path, ENTRY_LABEL);
    assert.equal(
      link.target,
      PLANNER_PATH,
      `the entry button must navigate to a literal "${PLANNER_PATH}"; its target is ${JSON.stringify(link.target)} ` +
        '(a computed target reads as null here and fails on purpose)'
    );
  });

  test(`T1: the ${page.label} Travel Fit button still opens the questionnaire`, () => {
    const link = theLinkReading(page.path, TRAVEL_FIT_LABEL);
    assert.equal(
      link.target,
      QUESTIONNAIRE_PATH,
      'Travel Fit is out of scope: its button must still navigate to the questionnaire. ' +
        'This test exists because swapping the two buttons leaves every per-file target count unchanged.'
    );
  });
}

test('T1: the questionnaire first-question shortcut opens the new planner', () => {
  const link = theLinkReading(QUESTION_VIEW, SHORTCUT_TEXT);
  assert.equal(link.target, PLANNER_PATH, `the shortcut must navigate to a literal "${PLANNER_PATH}"`);
});

// ------------------------------------------------- T2: no entry link left on the old path

for (const entry of [{ label: 'landing page', path: LANDING }, { label: 'hero slideshow', path: SLIDESHOW }, { label: 'questionnaire', path: QUESTION_VIEW }]) {
  test(`T2: the ${entry.label} file routes no link to the classic planner`, () => {
    const targets = routerLinks(parse(entry.path)).map((l) => l.target);
    assert.equal(
      targets.includes(CLASSIC_PATH),
      false,
      `${entry.path} must not route any link to the classic planner; targets: ${JSON.stringify(targets)}`
    );
  });
}

// ------------------------------------------------- T3: PRESERVED — the classic route

test('T3 (preservation): the classic planner route still exists and still renders the classic page', () => {
  const app = read(join('src', 'App.jsx'));
  assert.match(
    app,
    /<Route\s+path="\/find"\s+element=\{<DoorB\s*\/>\}\s*\/>/,
    'src/App.jsx must still route the classic path to the classic page, so bookmarks and old links keep working'
  );
  assert.match(app, /<Route\s+path="\/plan"\s+element=\{<Door2Plan\s*\/>\}\s*\/>/);
});

// ------------------------------------------------- T4: PRESERVED — the two escape routes

test('T4 (preservation): the planner fallback constant still points at the classic planner', () => {
  assert.match(
    read(join('src', 'pages', 'Door2Plan.jsx')),
    /const\s+CLASSIC_PLANNER_PATH\s*=\s*["']\/find["']/,
    'the new planner must still be able to send a traveller it cannot help to the classic planner'
  );
});

test('T4 (preservation): the handoff constant still points at the classic planner', () => {
  assert.match(
    read(join('src', 'lib', 'door2', 'classicHandoff.js')),
    /export\s+const\s+CLASSIC_FIND_PATH\s*=\s*["']\/find["']/,
    'the Stage 2 handoff must still build links to the classic planner'
  );
});

// ------------------------------------------------- T5: the exact words on the shortcut

test('T5: the questionnaire shortcut reads exactly the owner-approved wording', () => {
  const links = routerLinks(parse(QUESTION_VIEW));
  const toPlanner = links.filter((l) => l.target === PLANNER_PATH);
  assert.equal(toPlanner.length, 1, `expected one shortcut link to the planner, found ${toPlanner.length}`);

  // Equality, not inclusion. "Go to the planner → choose dates" contains the approved
  // phrase and must still fail; so must the phrase surviving only inside a comment,
  // because a comment contributes no visible text.
  assert.equal(
    toPlanner[0].text,
    SHORTCUT_TEXT,
    `the shortcut's complete visible text must be exactly "${SHORTCUT_TEXT}", not ${JSON.stringify(toPlanner[0].text)}`
  );
});

test('T5: the lead-in sentence still sits beside the shortcut', () => {
  const link = theLinkReading(QUESTION_VIEW, SHORTCUT_TEXT);
  const paragraph = link.node.parent;
  const around = visibleText(paragraph).replace(SHORTCUT_TEXT, '').trim();
  assert.ok(
    around.includes(SHORTCUT_LEAD),
    `the owner-approved lead-in "${SHORTCUT_LEAD}" must be visible next to the shortcut; found ${JSON.stringify(around)}`
  );
});

test('T5: the retired wording appears nowhere in the questionnaire component', () => {
  assert.equal(
    read(QUESTION_VIEW).includes(RETIRED_TEXT),
    false,
    'the old wording promised dates; the classic planner opens on destination search, so it was never accurate'
  );
});
