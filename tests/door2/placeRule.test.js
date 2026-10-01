import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyLocation } from '../../src/lib/door2/placeRule.js';

// F2: the Place rule (F1-D16).

test('F2-P1: an overnight base is always a Place', () => {
  assert.deepEqual(classifyLocation({ id: 'kyoto', sleepsThere: true }), {
    candidateId: 'kyoto', verdict: 'place', reason: 'overnight_base', criteriaMet: ['sleepsThere']
  });
  assert.deepEqual(classifyLocation({ id: 'tokyo', sleepsThere: true, graphParticipation: true }).criteriaMet, ['sleepsThere', 'graphParticipation']);
});

test('F2-P2: a day-trip site meeting none of the three criteria is not a Place', () => {
  assert.deepEqual(classifyLocation({ id: 'hase', sleepsThere: false, independentRouting: false, reusableShelf: false, graphParticipation: false }), {
    candidateId: 'hase', verdict: 'not_place', reason: 'content_on_base_or_excursion', criteriaMet: []
  });
  assert.equal(classifyLocation({ id: 'bare' }).verdict, 'not_place');
});

for (const criterion of ['independentRouting', 'reusableShelf', 'graphParticipation']) {
  test(`F2-P3: ${criterion} alone promotes`, () => {
    assert.deepEqual(classifyLocation({ id: 'site', [criterion]: true }), {
      candidateId: 'site', verdict: 'place', reason: 'promotion_criteria', criteriaMet: [criterion]
    });
  });
}

test('F2-P4: a full-day day-trip site with no other criterion is NOT a Place', () => {
  // The clause the rule exists for. Filling a whole day is not an input, under any name.
  const fullDay = { id: 'nikko', fullDay: true, slots: ['full'], hoursOnSite: 9, wholeDay: true, sleepsThere: false };
  assert.deepEqual(classifyLocation(fullDay), {
    candidateId: 'nikko', verdict: 'not_place', reason: 'content_on_base_or_excursion', criteriaMet: []
  });
});

test('F2-P5: only `true` counts; truthy look-alikes do not promote', () => {
  for (const value of ['yes', 1, 'true', {}, []]) {
    assert.equal(classifyLocation({ id: 's', sleepsThere: value, independentRouting: value, reusableShelf: value, graphParticipation: value }).verdict, 'not_place', JSON.stringify(value));
  }
});

test('F2-P6: a candidate without an id is refused', () => {
  assert.throws(() => classifyLocation({ sleepsThere: true }), /needs a string id/);
  assert.throws(() => classifyLocation(null), /needs a string id/);
});
