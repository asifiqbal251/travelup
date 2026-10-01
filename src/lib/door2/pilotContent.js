// Door 2 pilot content: a small, per-place activity shelf for fill.js.
//
// TEMPORARY PILOT LAYER, not the final content architecture. WhereNova's
// curated content lives in bundle-shaped Destination records in Base44
// ("Cusco & Machu Picchu, Peru", "Tokyo & Kyoto, Japan"), while the Door 2
// planner needs content attached to individual Places. This file bridges that
// gap for the pilot only. Rockstar's decision (22 Sep 2026): once the pilot is
// tested, migrate the whole library to place-centric content ("Option B").
//
// Every item records where it came from:
//   source.kind 'extracted' = taken from a Base44 Destination day_template
//     (bundleId/bundleName/templateTitle point back to it); `edited: true`
//     means the text was lightly rewritten to fit a single place or slot.
//   source.kind 'authored'  = newly written for the pilot because no
//     standalone content existed (Cusco city, Ollantaytambo, Aguas Calientes,
//     two Tokyo days, a few evenings).
// Nothing here is reviewed yet (reviewed: false), same as the connection data.
//
// Item fields:
//   id, placeId, title
//   slots: which free-time slot kinds it fits:
//     'full'    - a whole free day (>= 8h open)
//     'half'    - a daytime part-day (3h to < 8h, starting before 17:00)
//     'evening' - any part-day starting at or after 17:00
//     'short'   - a daytime gap under 3h
//   intensity: 'Light' | 'Moderate' | 'High' | 'Highly active'
//   interests: WhereNova interest labels
//   summary: one line, used for every slot kind
//   morning/afternoon/evening: required when slots includes 'full'
//   foodNote?, arrivalFriendly? (good first thing at a new stop),
//   minDayAtStop? (not before this many days after arriving; altitude safety)

export const PILOT_CONTENT_VERSION = 'pilot-content-v1';

const NYC = { kind: 'extracted', bundleId: '6a7e984900175cfc5fe2005a', bundleName: 'New York City' };
const LIMA = { kind: 'extracted', bundleId: '6a7e98494622807c9c3429bf', bundleName: 'Lima' };
const CUSCO = { kind: 'extracted', bundleId: '6a7ced35c41497521b54e0c5', bundleName: 'Cusco & Machu Picchu, Peru' };
const HUARAZ = { kind: 'extracted', bundleId: '6a7e984900175cfc5fe20055', bundleName: 'Huaraz and the Cordillera Blanca' };
const TOKYO = { kind: 'extracted', bundleId: '6a7ced35c41497521b54e0bc', bundleName: 'Tokyo & Kyoto, Japan' };
const AUTHORED = { kind: 'authored', note: 'Written for the Door 2 pilot; no standalone content existed.' };
const AUTHORED_CA = {
  kind: 'authored',
  note: 'Written for the Eastern Canada pilot family (Phase C); no Base44 bundle exists for these places.'
};

const AUTHORED_JP = {
  kind: 'authored',
  note: 'Written for the Japan pilot family (Phase E); no standalone Base44 content exists for this place.'
};

const ex = (base, templateTitle, edited = false) => ({ ...base, templateTitle, ...(edited ? { edited: true } : {}) });

export const PILOT_CONTENT = Object.freeze([
  // ---------------- New York (single-place bundle, reused as-is) ----------------
  { id: 'nyc_midtown', placeId: 'new_york', title: 'Midtown & Times Square', slots: ['full'], intensity: 'Moderate', interests: ['Cities', 'Photography'],
    summary: 'Rockefeller Center, Top of the Rock and Fifth Avenue.',
    morning: 'Walk Midtown and Rockefeller Center.', afternoon: 'Top of the Rock and Fifth Avenue.', evening: 'Dinner in Midtown.',
    foodNote: 'Try a classic New York slice.', source: ex(NYC, 'Midtown & Times Square') },
  { id: 'nyc_central_park_museums', placeId: 'new_york', title: 'Central Park & museums', slots: ['full'], intensity: 'Light', interests: ['Cities', 'Nature'],
    summary: 'A morning in Central Park, then the Met or the Guggenheim.',
    morning: 'Walk Central Park.', afternoon: 'The Met or the Guggenheim.', evening: 'Dinner on the Upper West Side.',
    foodNote: 'A pastrami sandwich.', source: ex(NYC, 'Central Park & museums') },
  { id: 'nyc_lower_manhattan', placeId: 'new_york', title: 'Lower Manhattan', slots: ['full'], intensity: 'Moderate', interests: ['Cities', 'History and culture'],
    summary: 'Wall Street, the 9/11 Memorial and One World Observatory.',
    morning: 'Wall Street and the Financial District.', afternoon: 'The 9/11 Memorial and One World Observatory.', evening: 'Dinner in Tribeca.',
    foodNote: 'A New York bagel.', source: ex(NYC, 'Lower Manhattan') },
  { id: 'nyc_statue_brooklyn', placeId: 'new_york', title: 'Statue of Liberty & Brooklyn Bridge', slots: ['full'], intensity: 'Moderate', interests: ['Cities', 'History and culture'],
    summary: 'Ferry to the Statue of Liberty and Ellis Island, then walk the Brooklyn Bridge.',
    morning: 'Ferry to the Statue of Liberty and Ellis Island.', afternoon: 'Walk across the Brooklyn Bridge.', evening: 'Dinner in DUMBO.',
    foodNote: 'A Brooklyn-style pizza.', source: ex(NYC, 'Statue & Brooklyn', true) },
  { id: 'nyc_brooklyn_neighbourhoods', placeId: 'new_york', title: 'Brooklyn neighbourhoods', slots: ['full'], intensity: 'Light', interests: ['Cities', 'Food'],
    summary: 'Williamsburg, then Brooklyn Bridge Park and the waterfront.',
    morning: 'Wander Williamsburg.', afternoon: 'Brooklyn Bridge Park and the waterfront.', evening: 'Dinner in Williamsburg.',
    source: ex(NYC, 'Brooklyn neighborhoods') },
  { id: 'nyc_museum_mile', placeId: 'new_york', title: 'Museum Mile & Harlem', slots: ['full'], intensity: 'Light', interests: ['Cities', 'History and culture'],
    summary: 'The Museum Mile galleries, then soul food in Harlem.',
    morning: 'The Museum Mile galleries.', afternoon: 'Free afternoon.', evening: 'Dinner in Harlem.',
    foodNote: 'Soul food in Harlem.', source: ex(NYC, 'Museum Mile', true) },
  { id: 'nyc_high_line_chelsea', placeId: 'new_york', title: 'High Line & Chelsea', slots: ['full'], intensity: 'Light', interests: ['Cities', 'Food'],
    summary: 'Walk the High Line, then Chelsea Market and the galleries.',
    morning: 'Walk the High Line.', afternoon: 'Chelsea Market and the galleries.', evening: 'Dinner in Chelsea.',
    foodNote: 'A food-hall tasting tour.', source: ex(NYC, 'High Line & Chelsea') },
  { id: 'nyc_broadway', placeId: 'new_york', title: 'Broadway show', slots: ['full', 'evening'], intensity: 'Light', interests: ['Cities', 'Relaxation'],
    summary: 'A Broadway show and a pre-theatre dinner.',
    morning: 'Slow morning in Midtown.', afternoon: 'A matinée on Broadway, or a free afternoon.', evening: 'A Broadway show and dinner.',
    foodNote: 'A pre-theatre dinner.', source: ex(NYC, 'Broadway show', true) },
  { id: 'nyc_central_park_harlem', placeId: 'new_york', title: 'Bike Central Park & the Apollo', slots: ['full'], intensity: 'Light', interests: ['Cities', 'History and culture'],
    summary: 'Bike Central Park, then Harlem and the Apollo Theater.',
    morning: 'Bike Central Park.', afternoon: 'Harlem and the Apollo Theater.', evening: 'Dinner in Harlem.',
    foodNote: 'A soul-food dinner.', source: ex(NYC, 'Central Park & Harlem', true) },
  { id: 'nyc_queens_flushing', placeId: 'new_york', title: 'Queens & Flushing', slots: ['full'], intensity: 'Moderate', interests: ['Cities', 'Food'],
    summary: 'Train out to Flushing for a food tour.',
    morning: 'Train out to Flushing.', afternoon: 'Food tour in Flushing.', evening: 'Return to Manhattan.',
    foodNote: 'A global street-food lunch.', source: ex(NYC, 'Queens & Flushing') },
  { id: 'nyc_bronx_yankees', placeId: 'new_york', title: 'The Bronx & Yankee Stadium', slots: ['full'], intensity: 'Moderate', interests: ['Cities', 'History and culture'],
    summary: 'The Grand Concourse and a Yankee Stadium tour.',
    morning: 'The Bronx and the Grand Concourse.', afternoon: 'A Yankee Stadium tour.', evening: 'Dinner in the Bronx.',
    foodNote: 'A ballpark hot dog.', source: ex(NYC, 'Bronx & Yankees', true) },
  { id: 'nyc_greenwich_village', placeId: 'new_york', title: 'Greenwich Village', slots: ['full', 'half'], intensity: 'Light', interests: ['Cities', 'Relaxation'],
    summary: 'Wander Greenwich Village and Washington Square, then a jazz café.',
    morning: 'Wander Greenwich Village.', afternoon: 'Washington Square and jazz cafés.', evening: 'Dinner in the Village.',
    foodNote: 'A jazz-club evening.', source: ex(NYC, 'Greenwich Village') },
  { id: 'nyc_skyline_sunset', placeId: 'new_york', title: 'Skyline at sunset', slots: ['evening', 'half'], intensity: 'Light', interests: ['Cities', 'Photography'],
    summary: 'Sunset from the Empire State Building or Edge, then dinner.',
    foodNote: 'A final New York slice.', source: ex(NYC, 'Skyline farewell', true) },

  // ---------------- Lima (single-place bundle) ----------------
  { id: 'lima_miraflores', placeId: 'lima', title: 'Miraflores clifftops', slots: ['full', 'half'], intensity: 'Light', interests: ['Cities', 'Food'], arrivalFriendly: true,
    summary: 'Walk the Miraflores clifftop parks down to Larcomar and the bay views.',
    morning: 'Walk the Miraflores clifftop parks.', afternoon: 'Larcomar and the bay views.', evening: 'Dinner in Miraflores.',
    foodNote: 'Try a fresh ceviche.', source: ex(LIMA, 'Miraflores malecón') },
  { id: 'lima_historic_centre', placeId: 'lima', title: 'Historic centre & Larco Museum', slots: ['full'], intensity: 'Light', interests: ['Cities', 'History and culture', 'Food'],
    summary: 'Plaza Mayor and the cathedral, then the Larco Museum.',
    morning: 'Plaza Mayor and the cathedral.', afternoon: 'Larco Museum of pre-Columbian art.', evening: 'Dinner in Barranco.',
    foodNote: 'Try lomo saltado.', source: ex(LIMA, 'Historic centre') },
  { id: 'lima_barranco', placeId: 'lima', title: 'Barranco & art', slots: ['full', 'half'], intensity: 'Light', interests: ['Cities', 'Photography'],
    summary: 'The bohemian Barranco district, its galleries and the Bridge of Sighs.',
    morning: 'Walk the bohemian Barranco district.', afternoon: 'Galleries and the Bridge of Sighs.', evening: 'Dinner in Barranco.',
    foodNote: 'A Peruvian causa potato dish.', source: ex(LIMA, 'Barranco & art') },
  { id: 'lima_huaca_pucllana', placeId: 'lima', title: 'Huaca Pucllana', slots: ['half'], intensity: 'Light', interests: ['History and culture', 'Food'],
    summary: 'The Huaca Pucllana adobe pyramid, right in Miraflores.',
    foodNote: 'A Peruvian anticucho skewer.', source: ex(LIMA, 'Huaca Pucllana', true) },
  { id: 'lima_food_markets', placeId: 'lima', title: 'Cooking class & Surquillo market', slots: ['full', 'half'], intensity: 'Light', interests: ['Food', 'Cities'],
    summary: 'A Peruvian cooking class and a tour of the Surquillo market.',
    morning: 'A Peruvian cooking class.', afternoon: 'Tour the Surquillo market.', evening: 'Dinner of your own dish.',
    foodNote: 'A fresh fruit juice.', source: ex(LIMA, 'Food markets & cooking') },
  { id: 'lima_pachacamac', placeId: 'lima', title: 'Pachacamac ruins', slots: ['full'], intensity: 'Moderate', interests: ['History and culture', 'Nature'],
    summary: 'Day trip south to the Pachacamac oracle site and its museum.',
    morning: 'Drive south to the Pachacamac oracle site.', afternoon: 'Walk the pyramids and museum.', evening: 'Return to Lima.',
    foodNote: 'A coastal fish lunch.', source: ex(LIMA, 'Pachacamac ruins') },
  { id: 'lima_caral', placeId: 'lima', title: 'Caral day trip', slots: ['full'], intensity: 'Moderate', interests: ['History and culture', 'Photography'],
    summary: 'Long day trip to Caral, the oldest city in the Americas.',
    morning: 'Drive to Caral, the oldest city in the Americas.', afternoon: 'Walk the pyramids.', evening: 'Return to Lima.',
    foodNote: 'A packed lunch.', source: ex(LIMA, 'Caral day trip') },
  { id: 'lima_lunahuana', placeId: 'lima', title: 'Lunahuaná valley', slots: ['full'], intensity: 'Moderate', interests: ['Adventure', 'Nature'],
    summary: 'Day trip to the Lunahuaná valley for rafting and a vineyard.',
    morning: 'Drive to the Lunahuaná valley.', afternoon: 'Rafting and a vineyard visit.', evening: 'Return to Lima.',
    foodNote: 'A riverside lunch.', source: ex(LIMA, 'Lunahuaná valley') },
  { id: 'lima_pucusana', placeId: 'lima', title: 'Pucusana fishing cove', slots: ['full'], intensity: 'Light', interests: ['Beaches', 'Food'],
    summary: 'Day trip to the Pucusana fishing cove for a boat ride and seafood.',
    morning: 'Drive to the Pucusana fishing cove.', afternoon: 'Boat ride and seafood lunch.', evening: 'Return to Lima.',
    foodNote: 'A fresh ceviche by the sea.', source: ex(LIMA, 'Pucusana fishing') },
  { id: 'lima_museo_nacion', placeId: 'lima', title: 'Museo de la Nación', slots: ['half'], intensity: 'Light', interests: ['History and culture'],
    summary: "Peru's history from the first cultures to the Incas at the Museo de la Nación.",
    source: ex(LIMA, 'Museo de la Nación', true) },
  { id: 'lima_magic_water', placeId: 'lima', title: 'Magic Water Circuit', slots: ['evening'], intensity: 'Light', interests: ['Cities', 'Relaxation'],
    summary: 'The lit fountains of the Magic Water Circuit in Parque de la Reserva, then dinner.',
    foodNote: 'Picarones for dessert.', source: ex(LIMA, 'Magic water circuit', true) },
  { id: 'lima_ceviche_evening', placeId: 'lima', title: 'Ceviche & pisco sour evening', slots: ['evening'], intensity: 'Light', interests: ['Food', 'Cities'],
    summary: 'A cebichería dinner with a pisco sour.',
    foodNote: 'Ceviche and tiradito.', source: ex(LIMA, 'Ceviche farewell', true) },
  { id: 'lima_barranco_pena', placeId: 'lima', title: 'Barranco peña night', slots: ['evening'], intensity: 'Light', interests: ['History and culture', 'Food'],
    summary: 'Dinner and live Afro-Peruvian music at a peña in Barranco.',
    source: AUTHORED },

  // ---------------- Cusco city (bundle is mostly elsewhere; mostly authored) ----------------
  { id: 'cusco_acclimatise', placeId: 'cusco', title: 'Easy first day at altitude', slots: ['half', 'full'], intensity: 'Light', interests: ['History and culture', 'Cities'], arrivalFriendly: true,
    summary: 'Take it slowly at 3,400 m: the old city and Qorikancha, then a light dinner.',
    morning: 'Slow start to adjust to the altitude.', afternoon: 'The old city and Qorikancha.', evening: 'Light dinner and rest.',
    foodNote: 'Quinoa soup and coca tea; avoid heavy meals.', source: ex(CUSCO, 'Cusco acclimatise', true) },
  { id: 'cusco_market_san_blas', placeId: 'cusco', title: 'San Pedro Market, cathedral & San Blas', slots: ['full', 'half'], intensity: 'Light', interests: ['Food', 'Cities', 'History and culture'],
    summary: 'San Pedro Market, the cathedral on the Plaza de Armas, and the artisan lanes of San Blas.',
    morning: 'Breakfast and fresh juices at San Pedro Market.', afternoon: 'Cusco Cathedral, then the artisan workshops of San Blas.', evening: 'Dinner in San Blas.',
    foodNote: 'A fresh-fruit juice at the market stalls.', source: AUTHORED },
  { id: 'cusco_sacsayhuaman', placeId: 'cusco', title: 'Sacsayhuamán & the ruins above Cusco', slots: ['full', 'half'], intensity: 'Moderate', interests: ['History and culture', 'Photography'], minDayAtStop: 1,
    summary: "Sacsayhuamán's giant walls, then Q'enqo, Puka Pukara and Tambomachay.",
    morning: 'The fortress of Sacsayhuamán above the city.', afternoon: "Q'enqo, Puka Pukara and Tambomachay.", evening: 'Dinner near the Plaza de Armas.',
    foodNote: 'Try alpaca or trout at dinner.', source: AUTHORED },
  { id: 'cusco_chocolate_inca_museum', placeId: 'cusco', title: 'Chocolate workshop & Inca Museum', slots: ['half'], intensity: 'Light', interests: ['Food', 'History and culture'],
    summary: 'A bean-to-bar chocolate workshop, then the Inca Museum.',
    source: AUTHORED },
  { id: 'cusco_pisac', placeId: 'cusco', title: 'Pisac ruins & market', slots: ['full'], intensity: 'Moderate', interests: ['Hiking', 'History and culture'], minDayAtStop: 1,
    summary: 'Day trip to hike the Pisac ruins and browse its artisan market.',
    morning: 'Drive to Pisac and hike up to the ruins.', afternoon: 'Pisac artisan market.', evening: 'Return to Cusco.',
    foodNote: 'Sample empanadas.', source: ex(CUSCO, 'Pisac ruins & market', true) },
  { id: 'cusco_humantay', placeId: 'cusco', title: 'Humantay Lake hike', slots: ['full'], intensity: 'High', interests: ['Hiking', 'Nature', 'Adventure'], minDayAtStop: 2,
    summary: 'Early drive and a steep hike to turquoise Humantay Lake.',
    morning: 'Early drive and ascent.', afternoon: 'Picnic at the turquoise lake.', evening: 'Return to Cusco.',
    foodNote: 'Trail snacks and hot coca tea.', source: ex(CUSCO, 'Humantay Lake hike') },
  { id: 'cusco_rainbow_mountain', placeId: 'cusco', title: 'Rainbow Mountain', slots: ['full'], intensity: 'High', interests: ['Hiking', 'Photography', 'Adventure'], minDayAtStop: 2,
    summary: 'Pre-dawn drive and high-altitude hike to Rainbow Mountain.',
    morning: 'Early drive and ascent.', afternoon: 'Descend and lunch.', evening: 'Return to Cusco for dinner.',
    foodNote: 'A hearty alpaca stew to recover.', source: ex(CUSCO, 'Rainbow Mountain') },

  // ---------------- Ollantaytambo (Sacred Valley base) ----------------
  { id: 'olly_fortress_town', placeId: 'ollantaytambo', title: 'Ollantaytambo fortress & old town', slots: ['full', 'half'], intensity: 'Moderate', interests: ['History and culture', 'Photography'], arrivalFriendly: true,
    summary: "Walk the Inca-era lanes of the old town and climb the fortress terraces.",
    morning: "Walk the Inca-era lanes of Ollantaytambo's old town.", afternoon: 'Climb the terraces of the Ollantaytambo fortress.', evening: 'Dinner by the plaza.',
    foodNote: 'Try roasted corn dishes.', source: ex(CUSCO, 'Sacred Valley', true) },
  { id: 'olly_moray_maras', placeId: 'ollantaytambo', title: 'Moray & Maras', slots: ['full', 'half'], intensity: 'Moderate', interests: ['History and culture', 'Nature', 'Photography'],
    summary: 'The circular terraces of Moray and the Maras salt pans.',
    morning: 'Drive to the Moray circular terraces.', afternoon: 'The Maras salt terraces.', evening: 'Return to Ollantaytambo.',
    foodNote: 'Try rocoto relleno.', source: ex(CUSCO, 'Moray & Maras', true) },
  { id: 'olly_pinkuylluna', placeId: 'ollantaytambo', title: 'Pinkuylluna storehouses hike', slots: ['half', 'short'], intensity: 'Moderate', interests: ['Hiking', 'History and culture'],
    summary: 'A short, steep climb to the Inca storehouses facing the fortress.',
    source: AUTHORED },

  // ---------------- Aguas Calientes (base for Machu Picchu) ----------------
  { id: 'agc_hot_springs', placeId: 'aguas_calientes', title: 'Hot springs & craft market', slots: ['half', 'evening', 'short'], intensity: 'Light', interests: ['Relaxation'], arrivalFriendly: true,
    summary: "Soak in the town's thermal baths, then wander the craft market.",
    source: AUTHORED },
  { id: 'agc_mandor', placeId: 'aguas_calientes', title: 'Mandor gardens & waterfall', slots: ['full', 'half'], intensity: 'Moderate', interests: ['Nature', 'Hiking'],
    summary: 'Walk along the Urubamba river to the Mandor gardens and waterfall.',
    morning: 'Walk beside the rail line along the Urubamba river.', afternoon: 'The Mandor gardens and waterfall.', evening: 'Dinner in town.',
    source: AUTHORED },
  { id: 'agc_site_museum', placeId: 'aguas_calientes', title: 'Machu Picchu site museum', slots: ['half', 'short'], intensity: 'Light', interests: ['History and culture', 'Nature'],
    summary: 'The Manuel Chávez Ballón site museum and its botanical garden.',
    source: AUTHORED },

  // ---------------- Machu Picchu (excursion site; never an overnight) ----------------
  { id: 'mp_citadel', placeId: 'machu_picchu', title: 'Machu Picchu citadel', slots: ['half', 'full'], intensity: 'High', interests: ['History and culture', 'Photography', 'Nature'],
    summary: 'Guided tour of the Machu Picchu citadel (timed entry ticket required).',
    morning: 'Bus up from Aguas Calientes.', afternoon: 'Guided citadel tour.', evening: 'Back down to Aguas Calientes.',
    foodNote: 'Pack a lunch; no food inside the site.', source: ex(CUSCO, 'Machu Picchu', true) },

  // ---------------- Huaraz (single-place bundle) ----------------
  { id: 'huz_first_evening', placeId: 'huaraz', title: 'Easy first evening at altitude', slots: ['evening'], intensity: 'Light', interests: ['Cities', 'Food'], arrivalFriendly: true,
    summary: 'A short stroll around the Plaza de Armas (3,050 m) and a warming dinner.',
    foodNote: 'Try a quinoa soup.', source: AUTHORED },
  { id: 'huz_acclimatise', placeId: 'huaraz', title: 'Acclimatise in Huaraz', slots: ['half', 'full'], intensity: 'Light', interests: ['Cities'], arrivalFriendly: true,
    summary: 'A slow day to adjust to the altitude, with a gentle walk around town.',
    morning: 'Slow start to adjust to the altitude.', afternoon: 'Short walk around the town and the main square.', evening: 'Light dinner.',
    foodNote: 'Try a quinoa soup.', source: ex(HUARAZ, 'Huaraz acclimatise') },
  { id: 'huz_wilcacocha', placeId: 'huaraz', title: 'Laguna Wilcacocha', slots: ['full', 'half'], intensity: 'Moderate', interests: ['Hiking', 'Nature'], minDayAtStop: 1,
    summary: 'A short acclimatisation hike with views of the Cordillera Blanca.',
    morning: 'Short acclimatisation hike above Huaraz.', afternoon: 'Views over the Cordillera Blanca.', evening: 'Return to Huaraz.',
    foodNote: 'A packed lunch.', source: ex(HUARAZ, 'Laguna Wilcacocha', true) },
  { id: 'huz_chavin', placeId: 'huaraz', title: 'Chavín de Huántar', slots: ['full'], intensity: 'Moderate', interests: ['History and culture', 'Photography'],
    summary: 'Day trip to the Chavín temple and its underground galleries.',
    morning: 'Drive to the Chavín archaeological site.', afternoon: 'Tour the ancient temple and the Lanzón.', evening: 'Return to Huaraz.',
    foodNote: 'A highland lunch.', source: ex(HUARAZ, 'Chavín de Huántar') },
  { id: 'huz_llanganuco', placeId: 'huaraz', title: 'Llanganuco lakes', slots: ['full'], intensity: 'Moderate', interests: ['Nature', 'Photography'], minDayAtStop: 1,
    summary: 'Through Huascarán National Park to the twin Llanganuco lakes.',
    morning: 'Drive through Huascarán National Park to Llanganuco.', afternoon: 'Boat on the twin turquoise lakes.', evening: 'Return to Huaraz.',
    foodNote: 'A lakeside packed lunch.', source: ex(HUARAZ, 'Llanganuco lakes') },
  { id: 'huz_laguna69', placeId: 'huaraz', title: 'Laguna 69', slots: ['full'], intensity: 'Highly active', interests: ['Hiking', 'Nature', 'Photography'], minDayAtStop: 2,
    summary: 'A long, high hike to the turquoise glacial lake of Laguna 69.',
    morning: 'Pre-dawn drive and hike to Laguna 69.', afternoon: 'Turquoise glacial lake under the peaks.', evening: 'Return to Huaraz.',
    foodNote: 'A packed lunch on the trail.', source: ex(HUARAZ, 'Laguna 69') },
  { id: 'huz_pastoruri', placeId: 'huaraz', title: 'Pastoruri glacier', slots: ['full'], intensity: 'High', interests: ['Nature', 'Hiking'], minDayAtStop: 2,
    summary: 'Drive to the Pastoruri glacier and the giant Puya Raimondi plants.',
    morning: 'Drive to the Pastoruri glacier.', afternoon: 'Walk to the retreating ice and the Puya Raimondi plants.', evening: 'Return to Huaraz.',
    foodNote: 'A packed lunch.', source: ex(HUARAZ, 'Pastoruri glacier', true) },
  { id: 'huz_monterrey', placeId: 'huaraz', title: 'Monterrey hot springs', slots: ['half'], intensity: 'Light', interests: ['Relaxation', 'Nature'],
    summary: 'Soak in the Monterrey hot springs just outside town.',
    source: ex(HUARAZ, 'Monterrey hot springs', true) },
  { id: 'huz_wilcahuain', placeId: 'huaraz', title: 'Wilcahuain ruins', slots: ['half', 'full'], intensity: 'Moderate', interests: ['History and culture', 'Hiking'],
    summary: 'Hike to the pre-Inca Wilcahuain ruins and their small museum.',
    morning: 'Hike to the Wilcahuain pre-Inca ruins.', afternoon: 'Visit the small site museum.', evening: 'Return to Huaraz.',
    foodNote: 'A highland lunch.', source: ex(HUARAZ, 'Wilcahuain ruins') },
  { id: 'huz_cordillera_negra', placeId: 'huaraz', title: 'Cordillera Negra sunset', slots: ['half'], intensity: 'Light', interests: ['Nature', 'Photography'],
    summary: 'Drive up the Cordillera Negra for sunset over the Blanca range.',
    source: ex(HUARAZ, 'Cordillera Negra views', true) },

  // ---------------- Tokyo (Tokyo-based days only, from the Tokyo & Kyoto bundle) ----------------
  { id: 'tyo_shinjuku', placeId: 'tokyo', title: 'Shinjuku garden & neon evening', slots: ['half', 'evening', 'full'], intensity: 'Moderate', interests: ['Cities', 'Food', 'Photography'], arrivalFriendly: true,
    summary: 'Shinjuku Gyoen garden, then neon Shinjuku and dinner in Omoide Yokocho.',
    morning: 'Stroll Shinjuku Gyoen garden.', afternoon: 'Shibuya crossing and Harajuku streets.', evening: 'Dinner in Omoide Yokocho and neon Shinjuku.',
    foodNote: 'Try fresh sushi at a standing counter.', source: ex(TOKYO, 'Tokyo arrival & Shinjuku', true) },
  { id: 'tyo_asakusa', placeId: 'tokyo', title: 'Asakusa & the old city', slots: ['full'], intensity: 'Moderate', interests: ['History and culture', 'Food', 'Cities'],
    summary: 'Senso-ji temple and Nakamise market, a Sumida river cruise and Akihabara.',
    morning: 'Senso-ji temple and Nakamise market.', afternoon: 'Cruise the Sumida river and explore Akihabara.', evening: 'Izakaya hopping in Ueno.',
    foodNote: 'Sample tempura and street snacks near Asakusa.', source: ex(TOKYO, 'Asakusa & the old city') },
  { id: 'tyo_meiji_shibuya', placeId: 'tokyo', title: 'Meiji Shrine, Harajuku & Shibuya', slots: ['full'], intensity: 'Moderate', interests: ['Cities', 'Food', 'History and culture'],
    summary: 'Meiji Shrine forest, Omotesando boutiques and the Shibuya skyline.',
    morning: 'Quiet morning at the Meiji Shrine forest.', afternoon: 'Cat Street and Omotesando design boutiques.', evening: 'Shibuya skyline view and ramen dinner.',
    foodNote: 'Try a tonkotsu ramen counter.', source: ex(TOKYO, 'Meiji Shrine, Harajuku & Shibuya') },
  // visitsPlaceId: this Tokyo day is spent at Nikko, so it is not offered anywhere in a
  // trip that already visits Nikko, e.g. with the Nikko excursion selected (E3b, E2-1 (c)).
  { id: 'tyo_nikko', placeId: 'tokyo', visitsPlaceId: 'nikko', title: 'Day trip to Nikko', slots: ['full'], intensity: 'High', interests: ['History and culture', 'Nature', 'Photography'],
    summary: "Train north to Nikko's Toshogu shrine, Kegon Falls and Lake Chuzenji.",
    morning: "Train north to Nikko's ornate Toshogu shrine.", afternoon: 'Kegon Falls and Lake Chuzenji.', evening: 'Return to Tokyo for a relaxed dinner.',
    foodNote: 'Try yuba tofu-skin dishes in Nikko.', source: ex(TOKYO, 'Day trip to Nikko') },
  { id: 'tyo_ueno_yanaka', placeId: 'tokyo', title: 'Ueno Park & Yanaka', slots: ['full', 'half'], intensity: 'Light', interests: ['History and culture', 'Cities'],
    summary: 'Ueno Park and the Tokyo National Museum, then the old lanes of Yanaka.',
    morning: 'Ueno Park and the Tokyo National Museum.', afternoon: 'The old-Tokyo lanes of Yanaka.', evening: 'Dinner in Ueno.',
    source: AUTHORED },
  { id: 'tyo_tsukiji_ginza', placeId: 'tokyo', title: 'Tsukiji, Ginza & Hamarikyu', slots: ['full', 'half'], intensity: 'Light', interests: ['Food', 'Cities'],
    summary: 'Breakfast at the Tsukiji outer market, Ginza, and Hamarikyu garden.',
    morning: 'Breakfast at the Tsukiji outer market.', afternoon: 'Ginza, then Hamarikyu garden.', evening: 'Dinner in Ginza.',
    foodNote: 'Tamagoyaki and fresh sushi at Tsukiji.', source: AUTHORED },
  // Tokyo content pass (E5-4): eight further full-day items and three light hub/evening items.
  { id: 'tyo_odaiba_bay', placeId: 'tokyo', title: 'Odaiba & the bay', slots: ['full', 'half'], intensity: 'Light', interests: ['Cities', 'Photography'],
    summary: 'The waterfront island, the bayside parks and the Rainbow Bridge at dusk.',
    morning: 'Cross to Odaiba and walk the waterfront parks.', afternoon: 'The bayside promenade and the science museum.', evening: 'The Rainbow Bridge lit from the seafront.',
    foodNote: 'Seafood at a bayside counter.', source: AUTHORED_JP },

  { id: 'tyo_yanesen_rivers', placeId: 'tokyo', title: 'Kagurazaka & the Kanda river', slots: ['full'], intensity: 'Light', interests: ['Cities', 'Food', 'History and culture'],
    summary: 'The old geisha quarter of Kagurazaka, then the quiet canals toward Iidabashi.',
    morning: 'The sloping lanes and hidden alleys of Kagurazaka.', afternoon: 'Follow the Kanda river canals toward Iidabashi.', evening: 'A small kappo counter in Kagurazaka.',
    foodNote: 'Kagurazaka keeps a cluster of old French-Japanese bistros.', source: AUTHORED_JP },

  { id: 'tyo_imperial_marunouchi', placeId: 'tokyo', title: 'The Imperial Palace & Marunouchi', slots: ['full', 'half'], intensity: 'Light', interests: ['History and culture', 'Cities'],
    summary: 'The East Gardens inside the old castle walls, then the brick streets of Marunouchi.',
    morning: 'The Imperial Palace East Gardens and the castle keep foundations.', afternoon: 'Marunouchi, Tokyo Station’s brick facade and the galleries around it.', evening: 'Dinner in the Marunouchi arcades.',
    source: AUTHORED_JP },

  { id: 'tyo_shimokita_setagaya', placeId: 'tokyo', title: 'Shimokitazawa & the west side', slots: ['full'], intensity: 'Light', interests: ['Cities', 'Food'],
    summary: 'Second-hand shops, small theatres and coffee in Tokyo’s low-rise west.',
    morning: 'Shimokitazawa’s second-hand shops and record stores.', afternoon: 'Setagaya’s backstreets and a neighbourhood coffee stop.', evening: 'A tiny live house or an izakaya counter.',
    foodNote: 'The curry shops here are a local institution.', source: AUTHORED_JP },

  { id: 'tyo_sumida_skytree', placeId: 'tokyo', title: 'Ryogoku & the Skytree side', slots: ['full'], intensity: 'Moderate', interests: ['History and culture', 'Cities', 'Photography'],
    summary: 'The sumo district and the Edo-Tokyo museum, then east across the river to the Skytree.',
    morning: 'Ryogoku: the sumo stables district and the Edo history museum.', afternoon: 'East across the Sumida to the Skytree and the shops beneath it.', evening: 'The city from above after dark.',
    foodNote: 'Chanko-nabe, the sumo stew, is the local dish.', source: AUTHORED_JP },

  { id: 'tyo_takao_hike', placeId: 'tokyo', title: 'Mount Takao', slots: ['full'], intensity: 'Highly active', interests: ['Nature', 'Photography'],
    summary: 'A forested climb at the western edge of the city, with the ridge path and the mountain temple.',
    morning: 'Train west, then climb the forest trail to Yakuo-in temple.', afternoon: 'The ridge path and the long way down.', evening: 'Back in the city for a late, easy dinner.',
    source: AUTHORED_JP },

  { id: 'tyo_roppongi_art', placeId: 'tokyo', title: 'The Roppongi art triangle', slots: ['full', 'half'], intensity: 'Light', interests: ['History and culture', 'Cities'],
    summary: 'Three major galleries within a few streets, and the garden between them.',
    morning: 'The National Art Center and its glass hall.', afternoon: 'Mori Art Museum and the Suntory collection, with the garden in between.', evening: 'The city from the Roppongi observation deck.',
    source: AUTHORED_JP },

  { id: 'tyo_koenji_nakano', placeId: 'tokyo', title: 'Nakano & Koenji', slots: ['full'], intensity: 'Light', interests: ['Cities', 'Food'],
    summary: 'The covered arcades of Nakano and the second-hand streets of Koenji.',
    morning: 'Nakano Broadway’s warren of small shops.', afternoon: 'Koenji’s vintage clothing streets and backstreet cafés.', evening: 'A standing bar under the railway line.',
    foodNote: 'This is one of the city’s best areas for cheap, late food.', source: AUTHORED_JP },

  { id: 'tyo_short_yurakucho', placeId: 'tokyo', title: 'Under the tracks at Yurakucho', slots: ['short', 'half', 'evening'], intensity: 'Light', interests: ['Food', 'Cities'],
    summary: 'The grill counters tucked under the railway arches.',
    foodNote: 'Yakitori and a beer standing up.', arrivalFriendly: true, source: AUTHORED_JP },

  { id: 'tyo_short_depachika', placeId: 'tokyo', title: 'A department-store food hall', slots: ['short', 'half'], intensity: 'Light', interests: ['Food'],
    summary: 'The basement food halls — a last hour well spent before a flight.',
    foodNote: 'Boxed sweets and bento travel well.', arrivalFriendly: true, source: AUTHORED_JP },

  { id: 'tyo_eve_golden_gai', placeId: 'tokyo', title: 'Golden Gai after dark', slots: ['evening'], intensity: 'Light', interests: ['Cities', 'Food'],
    summary: 'Six alleys of tiny bars, each with room for about six people.',
    source: AUTHORED_JP },

  // ---------------- Eastern Canada (C2, Phase C Route Family #2) ----------------
  // All authored: WhereNova has no Base44 Destination bundle for these five
  // places. Enough for minimum-to-typical trip lengths plus evenings.
  //   Toronto 9 · Montréal 8 · Québec City 6 · Ottawa 5 · Niagara Falls 5 = 33
  // The Toronto hub stop on the Niagara spur draws from the Toronto items:
  // content is keyed by placeId, and fill.js won't repeat an item in a trip.

  // ------------------------------- Toronto -------------------------------
  { id: 'tor_market_distillery', placeId: 'toronto', title: 'St Lawrence Market & the Distillery District', slots: ['full'], intensity: 'Light', interests: ['Food', 'History and culture'],
    summary: 'The city’s oldest market in the morning, Victorian warehouses and galleries after lunch.',
    morning: 'St Lawrence Market and the streets around it.', afternoon: 'The Distillery District’s galleries and courtyards.', evening: 'Dinner in the Distillery District.',
    foodNote: 'Peameal bacon on a bun at the market.', arrivalFriendly: true, source: AUTHORED_CA },
  { id: 'tor_cn_harbourfront', placeId: 'toronto', title: 'CN Tower & the harbourfront', slots: ['full'], intensity: 'Moderate', interests: ['Cities', 'Photography'],
    summary: 'Up the tower first, then the lake shore and the Ripley aquarium.',
    morning: 'The CN Tower observation deck.', afternoon: 'Harbourfront and the aquarium.', evening: 'Dinner by the water.',
    source: AUTHORED_CA },
  { id: 'tor_islands', placeId: 'toronto', title: 'The Toronto Islands', slots: ['full'], intensity: 'Light', interests: ['Nature', 'Relaxation'],
    summary: 'A short ferry to car-free islands, beaches and the best view back at the skyline.',
    morning: 'Ferry across and walk to Ward’s Island.', afternoon: 'Beaches, bikes and the boardwalk.', evening: 'Ferry back for dinner downtown.',
    source: AUTHORED_CA },
  { id: 'tor_rom_yorkville', placeId: 'toronto', title: 'The ROM & Yorkville', slots: ['full'], intensity: 'Light', interests: ['History and culture', 'Cities'],
    summary: 'The Royal Ontario Museum, then the shops and patios of Yorkville.',
    morning: 'The Royal Ontario Museum.', afternoon: 'Yorkville and the university campus.', evening: 'Dinner in Yorkville.',
    source: AUTHORED_CA },
  { id: 'tor_kensington_ago', placeId: 'toronto', title: 'Kensington Market & the AGO', slots: ['full'], intensity: 'Light', interests: ['Food', 'Cities'],
    summary: 'A market full of food stalls and vintage shops, next door to the art gallery.',
    morning: 'Kensington Market and Chinatown.', afternoon: 'The Art Gallery of Ontario.', evening: 'Dinner on Dundas West.',
    foodNote: 'Graze the market rather than sitting down for lunch.', source: AUTHORED_CA },
  { id: 'tor_high_park_west', placeId: 'toronto', title: 'High Park & the west end', slots: ['full'], intensity: 'Moderate', interests: ['Nature', 'Cities'],
    summary: 'The city’s big park in the morning, then the cafés of Roncesvalles and Queen West.',
    morning: 'High Park and the ponds.', afternoon: 'Roncesvalles and West Queen West.', evening: 'Dinner on Ossington.',
    source: AUTHORED_CA },
  { id: 'tor_theatre_evening', placeId: 'toronto', title: 'An evening in the theatre district', slots: ['evening'], intensity: 'Light', interests: ['Cities', 'Relaxation'],
    summary: 'A show on King Street with dinner before it.',
    source: AUTHORED_CA },
  { id: 'tor_waterfront_evening', placeId: 'toronto', title: 'The skyline after dark', slots: ['evening', 'half'], intensity: 'Light', interests: ['Photography', 'Relaxation'],
    summary: 'The lake shore at dusk, with the tower lit behind you.',
    source: AUTHORED_CA },
  { id: 'tor_short_market', placeId: 'toronto', title: 'An hour at the market', slots: ['short', 'half'], intensity: 'Light', interests: ['Food'],
    summary: 'A quick wander through St Lawrence Market when there isn’t time for more.',
    arrivalFriendly: true, source: AUTHORED_CA },

  // ------------------------------- Montréal ------------------------------
  { id: 'mtl_vieux_montreal', placeId: 'montreal', title: 'Vieux-Montréal & the old port', slots: ['full'], intensity: 'Light', interests: ['History and culture', 'Cities'],
    summary: 'Cobbled streets, the basilica, and the waterfront the city grew from.',
    morning: 'Notre-Dame Basilica and Place d’Armes.', afternoon: 'The old port and the waterfront.', evening: 'Dinner in Vieux-Montréal.',
    arrivalFriendly: true, source: AUTHORED_CA },
  { id: 'mtl_plateau_mile_end', placeId: 'montreal', title: 'The Plateau & Mile End', slots: ['full'], intensity: 'Light', interests: ['Food', 'Cities'],
    summary: 'Spiral staircases, murals and the bagel-and-smoked-meat argument, settled in person.',
    morning: 'Walk the Plateau’s side streets and murals.', afternoon: 'Mile End’s shops and cafés.', evening: 'Dinner on Saint-Laurent.',
    foodNote: 'A wood-fired bagel, then smoked meat. Both, ideally.', source: AUTHORED_CA },
  { id: 'mtl_mont_royal', placeId: 'montreal', title: 'Mont-Royal & the lookout', slots: ['full'], intensity: 'Moderate', interests: ['Nature', 'Photography'],
    summary: 'Up through the park to the Kondiaronk lookout, then down the other side.',
    morning: 'Climb through Parc du Mont-Royal.', afternoon: 'The lookout, then down to Outremont.', evening: 'Dinner in Outremont.',
    source: AUTHORED_CA },
  { id: 'mtl_museums_downtown', placeId: 'montreal', title: 'Museum of Fine Arts & downtown', slots: ['full'], intensity: 'Light', interests: ['History and culture', 'Cities'],
    summary: 'The Musée des beaux-arts, then the Golden Square Mile and the underground city.',
    morning: 'The Musée des beaux-arts.', afternoon: 'Sainte-Catherine and the underground city.', evening: 'Dinner downtown.',
    source: AUTHORED_CA },
  { id: 'mtl_jean_talon', placeId: 'montreal', title: 'Jean-Talon Market & Little Italy', slots: ['full'], intensity: 'Light', interests: ['Food'],
    summary: 'One of North America’s big open-air markets, with Little Italy around it.',
    morning: 'Jean-Talon Market.', afternoon: 'Little Italy and Mile Ex.', evening: 'Dinner in Little Italy.',
    foodNote: 'Buy lunch in pieces from the stalls.', source: AUTHORED_CA },
  { id: 'mtl_olympic_gardens', placeId: 'montreal', title: 'Olympic Park & the Botanical Garden', slots: ['full'], intensity: 'Moderate', interests: ['Nature', 'History and culture'],
    summary: 'The 1976 stadium and tower, next to one of the largest botanical gardens anywhere.',
    morning: 'The Olympic Park and the tower.', afternoon: 'The Botanical Garden and the Biodôme.', evening: 'Dinner back in the centre.',
    source: AUTHORED_CA },
  { id: 'mtl_evening_saint_laurent', placeId: 'montreal', title: 'An evening on Saint-Laurent', slots: ['evening'], intensity: 'Light', interests: ['Food', 'Relaxation'],
    summary: 'The Main after dark: bars, late food and whatever is playing.',
    source: AUTHORED_CA },
  { id: 'mtl_short_old_port', placeId: 'montreal', title: 'An hour in the old port', slots: ['short', 'half'], intensity: 'Light', interests: ['Relaxation'],
    summary: 'A short walk along the waterfront when there isn’t time for more.',
    arrivalFriendly: true, source: AUTHORED_CA },

  // ----------------------------- Québec City -----------------------------
  { id: 'qc_vieux_quebec', placeId: 'quebec_city', title: 'Vieux-Québec & the Château', slots: ['full'], intensity: 'Light', interests: ['History and culture', 'Cities'],
    summary: 'The walled upper town, the Château Frontenac, and Dufferin Terrace above the river.',
    morning: 'The upper town and Place d’Armes.', afternoon: 'Dufferin Terrace and the ramparts.', evening: 'Dinner in the old town.',
    arrivalFriendly: true, source: AUTHORED_CA },
  { id: 'qc_petit_champlain', placeId: 'quebec_city', title: 'Petit-Champlain & the lower town', slots: ['full'], intensity: 'Light', interests: ['Food', 'Cities'],
    summary: 'The oldest commercial street in North America, reached by the funicular or the breakneck stairs.',
    morning: 'Quartier Petit-Champlain and Place-Royale.', afternoon: 'The old port and the antique district.', evening: 'Dinner in the lower town.',
    foodNote: 'Poutine, properly, at least once.', source: AUTHORED_CA },
  { id: 'qc_citadelle_plains', placeId: 'quebec_city', title: 'The Citadelle & the Plains of Abraham', slots: ['full'], intensity: 'Moderate', interests: ['History and culture', 'Nature'],
    summary: 'The star-shaped fort, then the battlefield park along the cliff.',
    morning: 'The Citadelle and the changing of the guard.', afternoon: 'The Plains of Abraham and the Musée national.', evening: 'Dinner on Grande Allée.',
    source: AUTHORED_CA },
  { id: 'qc_montmorency_orleans', placeId: 'quebec_city', title: 'Montmorency Falls & Île d’Orléans', slots: ['full'], intensity: 'Moderate', interests: ['Nature', 'Food'],
    summary: 'A waterfall taller than Niagara, and a farm island in the river beyond it.',
    morning: 'Montmorency Falls and the suspension bridge.', afternoon: 'Île d’Orléans and its farm stands.', evening: 'Return for dinner in town.',
    foodNote: 'Cider and cheese from the island’s producers.', source: AUTHORED_CA },
  { id: 'qc_evening_terrasse', placeId: 'quebec_city', title: 'Dufferin Terrace at dusk', slots: ['evening', 'half'], intensity: 'Light', interests: ['Photography', 'Relaxation'],
    summary: 'The boardwalk above the St Lawrence as the lights come on.',
    source: AUTHORED_CA },
  { id: 'qc_short_ramparts', placeId: 'quebec_city', title: 'A walk on the ramparts', slots: ['short', 'half'], intensity: 'Light', interests: ['History and culture'],
    summary: 'A short circuit of the only walled city north of Mexico.',
    arrivalFriendly: true, source: AUTHORED_CA },

  // -------------------------------- Ottawa -------------------------------
  { id: 'ott_parliament_byward', placeId: 'ottawa', title: 'Parliament Hill & the ByWard Market', slots: ['full'], intensity: 'Light', interests: ['History and culture', 'Food'],
    summary: 'The Gothic revival parliament buildings, then the market quarter behind them.',
    morning: 'Parliament Hill and the grounds.', afternoon: 'The ByWard Market and the locks.', evening: 'Dinner in the market.',
    foodNote: 'A BeaverTail by the canal.', arrivalFriendly: true, source: AUTHORED_CA },
  { id: 'ott_national_gallery', placeId: 'ottawa', title: 'The National Gallery & the war museum', slots: ['full'], intensity: 'Light', interests: ['History and culture'],
    summary: 'Two of the country’s best collections, a short walk apart.',
    morning: 'The National Gallery of Canada.', afternoon: 'The Canadian War Museum.', evening: 'Dinner in Westboro or the market.',
    source: AUTHORED_CA },
  { id: 'ott_canal_glebe', placeId: 'ottawa', title: 'The Rideau Canal & the Glebe', slots: ['full'], intensity: 'Moderate', interests: ['Nature', 'Relaxation'],
    summary: 'The canal path out of the centre, with the Glebe’s shops at the far end.',
    morning: 'Walk or cycle the canal path.', afternoon: 'The Glebe and Lansdowne.', evening: 'Dinner in the Glebe.',
    source: AUTHORED_CA },
  { id: 'ott_evening_byward', placeId: 'ottawa', title: 'An evening in the ByWard Market', slots: ['evening'], intensity: 'Light', interests: ['Food', 'Relaxation'],
    summary: 'The market quarter after dark, which is where Ottawa eats.',
    source: AUTHORED_CA },
  { id: 'ott_short_canal', placeId: 'ottawa', title: 'A short walk along the canal', slots: ['short', 'half'], intensity: 'Light', interests: ['Relaxation'],
    summary: 'The locks and the canal edge, when there is only an hour.',
    arrivalFriendly: true, source: AUTHORED_CA },

  // ---------------------------- Niagara Falls ----------------------------
  { id: 'nia_falls_close', placeId: 'niagara_falls', title: 'The falls, up close', slots: ['full'], intensity: 'Light', interests: ['Nature', 'Photography'],
    summary: 'Table Rock, the boat beneath the Horseshoe Falls, and the tunnels behind them.',
    morning: 'Table Rock and the brink of the Horseshoe Falls.', afternoon: 'The boat trip and the tunnels behind the falls.', evening: 'Dinner overlooking the falls.',
    arrivalFriendly: true, source: AUTHORED_CA },
  { id: 'nia_on_the_lake', placeId: 'niagara_falls', title: 'Niagara-on-the-Lake & the wine route', slots: ['full'], intensity: 'Light', interests: ['Food', 'Relaxation'],
    summary: 'The parkway north along the river to a 19th-century town surrounded by vineyards.',
    morning: 'The Niagara Parkway and the river.', afternoon: 'Niagara-on-the-Lake and a winery or two.', evening: 'Dinner in town before heading back.',
    foodNote: 'Icewine is the local speciality, and it is very sweet.', source: AUTHORED_CA },
  { id: 'nia_gorge_whirlpool', placeId: 'niagara_falls', title: 'The gorge and the whirlpool', slots: ['full'], intensity: 'Moderate', interests: ['Hiking', 'Nature'],
    summary: 'The white-water walk downstream, the whirlpool, and the aero car above it.',
    morning: 'The white-water walk along the gorge.', afternoon: 'The whirlpool and the aero car.', evening: 'Dinner back near the falls.',
    source: AUTHORED_CA },
  { id: 'nia_evening_illumination', placeId: 'niagara_falls', title: 'The falls lit at night', slots: ['evening'], intensity: 'Light', interests: ['Photography', 'Relaxation'],
    summary: 'The illumination after dark, which is the version most people remember.',
    source: AUTHORED_CA },
  { id: 'nia_short_table_rock', placeId: 'niagara_falls', title: 'Table Rock and the brink', slots: ['short', 'half'], intensity: 'Light', interests: ['Nature'],
    summary: 'The closest you can stand to the edge, when there is only an hour.',
    arrivalFriendly: true, source: AUTHORED_CA },

  // ---------------- Japan (E2, Phase E Route Family #3) ----------------
  // Copied verbatim from e2-japan-content-2026-09-29.js. All authored: WhereNova's only
  // Japan bundle has Tokyo-based days and nothing standalone for these five places.
  //   Kyoto 10 (a base, the optional spur) · Nikko 2 · Kamakura 2 · Nara 2 · Osaka 2 = 18
  // Kyoto items are ordinary base items. Nikko, Kamakura, Nara and Osaka are excursion
  // sites: the scheduler gives each ONE site block of its hoursOnSite (Nikko 4, Kamakura 6,
  // Nara 5, Osaka 6), a 'half' slot, so their items are slots: ['half'] and each fits its
  // own site's hours (the Nikko pair fit 4 hours; Kegon Falls and Lake Chuzenji do not).
  // -------------------------------- Kyoto --------------------------------
  { id: 'kyo_higashiyama', placeId: 'kyoto', title: 'Higashiyama: Kiyomizu-dera & the old lanes', slots: ['full'], intensity: 'Moderate', interests: ['History and culture', 'Photography'],
    summary: 'The hillside temple, the stone lanes below it, and Gion as the light goes.',
    morning: 'Kiyomizu-dera and its wooden veranda over the city.', afternoon: 'Ninenzaka and Sannenzaka, then Yasaka Shrine.', evening: 'Dinner in Gion and a walk along Hanamikoji.',
    foodNote: 'Matcha sweets on the lanes below the temple.', source: AUTHORED_JP },
  { id: 'kyo_fushimi_inari', placeId: 'kyoto', title: 'Fushimi Inari & Tofuku-ji', slots: ['full', 'half'], intensity: 'Moderate', interests: ['Hiking', 'Photography', 'History and culture'],
    summary: 'Thousands of vermilion gates up a wooded hill, then a quiet Zen garden nearby.',
    morning: 'Walk the torii gates at Fushimi Inari, as far up the hill as you like.', afternoon: 'Tofuku-ji and its gardens.', evening: 'Dinner back in the centre.',
    source: AUTHORED_JP },
  { id: 'kyo_arashiyama', placeId: 'kyoto', title: 'Arashiyama & the bamboo grove', slots: ['full'], intensity: 'Moderate', interests: ['Nature', 'Photography', 'History and culture'],
    summary: 'A river valley on the western edge of the city: a Zen temple, a bamboo grove and a wooden bridge.',
    morning: 'Tenryu-ji and its garden, then the bamboo grove.', afternoon: 'Togetsukyo bridge and the riverside.', evening: 'Dinner in Arashiyama or back in the centre.',
    foodNote: 'Yudofu, the simmered-tofu dish Kyoto is known for.', source: AUTHORED_JP },
  { id: 'kyo_kinkakuji_north', placeId: 'kyoto', title: 'Kinkaku-ji & the north-west temples', slots: ['full'], intensity: 'Light', interests: ['History and culture', 'Photography'],
    summary: 'The Golden Pavilion, a famous rock garden, and a hillside shrine.',
    morning: 'Kinkaku-ji, the Golden Pavilion.', afternoon: 'Ryoan-ji’s rock garden and Kitano Tenmangu.', evening: 'Dinner near Kitano.',
    source: AUTHORED_JP },
  { id: 'kyo_philosophers_path', placeId: 'kyoto', title: 'The Philosopher’s Path', slots: ['full'], intensity: 'Light', interests: ['Nature', 'History and culture', 'Relaxation'],
    summary: 'A canal-side walk between two temples, with a big Zen temple at one end.',
    morning: 'Ginkaku-ji, the Silver Pavilion.', afternoon: 'The Philosopher’s Path, then Nanzen-ji.', evening: 'Dinner near Okazaki.',
    source: AUTHORED_JP },
  { id: 'kyo_nijo_nishiki', placeId: 'kyoto', title: 'Nijo Castle & Nishiki Market', slots: ['full'], intensity: 'Light', interests: ['Food', 'History and culture', 'Cities'],
    summary: 'A shogun’s castle in the morning, then the covered food market in the centre.',
    morning: 'Nijo Castle and its garden.', afternoon: 'Nishiki Market and the arcades around it.', evening: 'Dinner in Pontocho.',
    foodNote: 'Graze the market: pickles, skewers and rolled omelette.', source: AUTHORED_JP },
  { id: 'kyo_sanjusangendo', placeId: 'kyoto', title: 'Sanjusangendo & the station quarter', slots: ['half'], intensity: 'Light', interests: ['History and culture'],
    summary: 'A long temple hall holding a thousand gilded statues.',
    source: AUTHORED_JP },
  { id: 'kyo_gion_evening', placeId: 'kyoto', title: 'Gion and Pontocho after dark', slots: ['evening'], intensity: 'Light', interests: ['Food', 'Cities', 'Relaxation'],
    summary: 'Lantern-lit lanes on both sides of the river, and somewhere small to eat.',
    arrivalFriendly: true, source: AUTHORED_JP },
  { id: 'kyo_kamo_evening', placeId: 'kyoto', title: 'The Kamo River at dusk', slots: ['evening', 'half'], intensity: 'Light', interests: ['Relaxation', 'Photography'],
    summary: 'The riverbank walk through the middle of the city as the lights come on.',
    arrivalFriendly: true, source: AUTHORED_JP },
  { id: 'kyo_short_station', placeId: 'kyoto', title: 'Kyoto Station & Higashi Honganji', slots: ['short', 'half'], intensity: 'Light', interests: ['Cities', 'History and culture'],
    summary: 'The huge modern station with a rooftop view, and a great temple hall a few minutes’ walk away.',
    arrivalFriendly: true, source: AUTHORED_JP },

  // --------------------- Nikko (excursion site, 4 hours) ---------------------
  { id: 'nik_toshogu', placeId: 'nikko', title: 'Toshogu shrine & the sacred bridge', slots: ['half'], intensity: 'Moderate', interests: ['History and culture', 'Photography'],
    summary: 'The Shinkyo bridge, then the richly carved shrine complex of the first Tokugawa shogun.',
    foodNote: 'Yuba, the local tofu-skin dishes, for lunch.', source: AUTHORED_JP },
  { id: 'nik_rinnoji_futarasan', placeId: 'nikko', title: 'Rinno-ji, Futarasan Shrine & the abyss walk', slots: ['half'], intensity: 'Light', interests: ['History and culture', 'Nature', 'Relaxation'],
    summary: 'A quieter circuit: a great temple hall, a forest shrine, and a riverside path lined with stone statues.',
    source: AUTHORED_JP },

  // -------------------- Kamakura (excursion site, 6 hours) --------------------
  { id: 'kam_buddha_hase', placeId: 'kamakura', title: 'The Great Buddha & Hase-dera', slots: ['half'], intensity: 'Light', interests: ['History and culture', 'Photography'],
    summary: 'The outdoor bronze Buddha, then a hillside temple with a view over the bay.',
    source: AUTHORED_JP },
  { id: 'kam_hachimangu_komachi', placeId: 'kamakura', title: 'Hachimangu & Komachi-dori', slots: ['half'], intensity: 'Moderate', interests: ['History and culture', 'Food', 'Cities'],
    summary: 'The main shrine at the end of a long approach, and the snack street that leads to the station.',
    foodNote: 'Street snacks along Komachi-dori.', source: AUTHORED_JP },

  // ---------------------- Nara (excursion site, 5 hours) ----------------------
  { id: 'nar_todaiji_park', placeId: 'nara', title: 'Todai-ji & the deer of Nara Park', slots: ['half'], intensity: 'Light', interests: ['History and culture', 'Nature', 'Photography'],
    summary: 'The world’s largest wooden hall, its giant bronze Buddha, and the park’s free-roaming deer.',
    foodNote: 'Buy the special deer crackers sold in the park; other food is bad for the deer.', source: AUTHORED_JP },
  { id: 'nar_kasuga_naramachi', placeId: 'nara', title: 'Kasuga Taisha & the old merchant town', slots: ['half'], intensity: 'Light', interests: ['History and culture', 'Nature', 'Cities'],
    summary: 'A lantern-lined forest shrine, then the preserved streets of the old town.',
    source: AUTHORED_JP },

  // --------------------- Osaka (excursion site, 6 hours) ---------------------
  { id: 'osa_castle_town', placeId: 'osaka', title: 'Osaka Castle & the old town', slots: ['half'], intensity: 'Moderate', interests: ['History and culture', 'Cities', 'Photography'],
    summary: 'The rebuilt castle keep and its park, then the temples and back streets nearby.',
    source: AUTHORED_JP },
  { id: 'osa_dotonbori_kuromon', placeId: 'osaka', title: 'Dotonbori & Kuromon Market food crawl', slots: ['half'], intensity: 'Light', interests: ['Food', 'Cities'],
    summary: 'The neon canal street and the covered market beside it, eaten in small pieces.',
    foodNote: 'Takoyaki, okonomiyaki and kushikatsu are the local trio.', source: AUTHORED_JP }
]);
