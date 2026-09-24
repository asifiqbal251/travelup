// Fixture specs whose buildSkeletonTrip output is pinned by
// skeleton-pre-step2.json (sha256 of JSON.stringify(trip-or-failure), taken on
// the Step 1 checkpoint code, before scheduleRoute gained nightsOverride).
// Covers every planner.test.js (F*) and fill.test.js (G*) fixture spec.

function spec(destination, totalDays, requiredPlaceIds = [], extra = {}) {
  return {
    originPlaceId: 'vancouver',
    destination,
    travelMonth: 10,
    totalDays,
    travellerType: 'couple',
    interests: [],
    pace: 'balanced',
    budget: 'mid',
    requiredPlaceIds,
    routeTemplateId: null,
    stops: [],
    choices: { pinned: [], rejected: [], placed: [] },
    ...extra
  };
}

const PERU = { kind: 'country', id: 'PE' };
const NYC = { kind: 'place', id: 'new_york' };
const TOKYO = { kind: 'place', id: 'tokyo' };

export const SKELETON_FIXTURES = {
  F1: spec(NYC, 7),
  F2: spec(PERU, 10),
  F3: spec(PERU, 5),
  F4: spec(PERU, 12, ['huaraz', 'machu_picchu']),
  F5: spec(PERU, 9, ['huaraz', 'machu_picchu']),
  F6: spec(TOKYO, 7),
  F9: spec({ kind: 'place', id: 'ljubljana' }, 7),
  NYC14: spec(NYC, 14),
  G5: spec(TOKYO, 10),
  G6: spec(PERU, 14),
  G7: spec(PERU, 10, [], { interests: ['Hiking'] }),
  G8: spec(PERU, 10, [], { interests: ['Adventure'] }),
  G9: spec(PERU, 16, ['huaraz', 'machu_picchu'], { interests: ['Hiking'] }),
  G10: spec(TOKYO, 7, [], { pace: 'relaxed' }),
  PE8: spec(PERU, 8),
  PE11: spec(PERU, 11),
  PE12: spec(PERU, 12),
  PH11: spec(PERU, 11, ['huaraz']),
  PH18: spec(PERU, 18, ['huaraz'])
};
