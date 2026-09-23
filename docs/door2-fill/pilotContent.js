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
  { id: 'tyo_nikko', placeId: 'tokyo', title: 'Day trip to Nikko', slots: ['full'], intensity: 'High', interests: ['History and culture', 'Nature', 'Photography'],
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
    foodNote: 'Tamagoyaki and fresh sushi at Tsukiji.', source: AUTHORED }
]);
