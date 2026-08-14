// Deterministic, local dietary filtering for itinerary food/drink text.
// Rule-based string substitution per selected diet — no AI, no external APIs.
// Applies to every day's morning/afternoon/evening/food_note.

const HALAL_RULES = [
  [/\bbifana pork sandwich\b/gi, "grilled chicken sandwich"],
  [/\bbifana\b/gi, "grilled chicken sandwich"],
  [/\bpork sausage\b/gi, "chicken sausage"],
  [/\bpork\b/gi, "chicken"],
  [/\bbacon\b/gi, "turkey"],
  [/\bjamón\b/gi, "turkey"],
  [/\bjamon\b/gi, "turkey"],
  [/\bham\b/gi, "turkey"],
  [/\bchorizo\b/gi, "spiced chicken"],
  [/\bprosciutto\b/gi, "grilled chicken"],
  [/\bpata negra\b/gi, "cured turkey"],
  [/\bsai oua\b/gi, "grilled chicken"],
  [/\blardons\b/gi, "chicken bits"],
  [/\bfrancesinha\b/gi, "grilled chicken sandwich"],
  [/\bfrancesinho\b/gi, "grilled chicken sandwich"],
  [/\bport wine tasting\b/gi, "grape juice tasting"],
  [/\bport wine\b/gi, "grape juice"],
  [/\bwine tasting\b/gi, "vineyard tour"],
  [/\bwine estate\b/gi, "vineyard estate"],
  [/\bwine pairing\b/gi, "grape juice pairing"],
  [/\bwinery\b/gi, "vineyard"],
  [/\bqvevri wine\b/gi, "qvevri grape juice"],
  [/\bsanto wine\b/gi, "Santo grape juice"],
  [/\bcappadocia wine\b/gi, "Cappadocia grape juice"],
  [/\bhome wine\b/gi, "home-made juice"],
  [/\bcape brandy\b/gi, "grape juice"],
  [/\bbrandy\b/gi, "grape juice"],
  [/\bfino sherry\b/gi, "chilled tea"],
  [/\bsherry\b/gi, "grape juice"],
  [/\bpisco sour\b/gi, "lemon sour"],
  [/\bpisco\b/gi, "grape juice"],
  [/\bchampagne\b/gi, "sparkling grape juice"],
  [/\bprosecco\b/gi, "sparkling grape juice"],
  [/\bbeer\b/gi, "malt drink"],
  [/\bvodka\b/gi, "sparkling water"],
  [/\bmead\b/gi, "honey drink"],
  [/\bcocktail\b/gi, "mocktail"],
  [/\bcaipirinha\b/gi, "lime soda"],
  [/\bcachaca\b/gi, "lime soda"],
  [/\bwine\b/gi, "grape juice"],
  [/\bTry a northern Thai specialty\b/gi, "Try a halal-friendly northern Thai specialty"]
];

const VEGETARIAN_RULES = [
  [/\bnyama choma\b/gi, "grilled vegetable skewers"],
  [/\bbalik ekmek\b/gi, "grilled vegetable sandwich"],
  [/\bfish sauce\b/gi, "soy sauce"],
  [/\bfish tacos\b/gi, "vegetable tacos"],
  [/\bfish stew\b/gi, "vegetable stew"],
  [/\bgrilled fish\b/gi, "grilled halloumi"],
  [/\bbeef rib\b/gi, "portobello rib"],
  [/\bbeef\b/gi, "grilled portobello"],
  [/\blamb\b/gi, "grilled vegetables"],
  [/\balpaca\b/gi, "potato cake"],
  [/\bchicken\b/gi, "grilled vegetables"],
  [/\bturkey\b/gi, "grilled vegetables"],
  [/\bduck\b/gi, "vegetable stir-fry"],
  [/\bgoat\b/gi, "chickpea stew"],
  [/\bpork sausage\b/gi, "vegetable sausage"],
  [/\bpork\b/gi, "grilled vegetables"],
  [/\bbacon\b/gi, "smoked tofu"],
  [/\bham\b/gi, "smoked tofu"],
  [/\bsai oua\b/gi, "vegetable patty"],
  [/\bsausage\b/gi, "vegetable sausage"],
  [/\bchorizo\b/gi, "spiced vegetables"],
  [/\bprosciutto\b/gi, "grilled vegetables"],
  [/\bsteak\b/gi, "grilled portobello"],
  [/\bburger\b/gi, "vegetable burger"],
  [/\bmtsvadi\b/gi, "grilled vegetables"],
  [/\bcuy\b/gi, "potato cake"],
  [/\boxtail\b/gi, "vegetable stew"],
  [/\bbison\b/gi, "portobello"],
  [/\bvenison\b/gi, "mushroom"],
  [/\bmeat\b/gi, "vegetable"],
  [/\bseafood\b/gi, "grilled vegetables"],
  [/\bshrimp\b/gi, "grilled vegetables"],
  [/\bprawns\b/gi, "grilled vegetables"],
  [/\bprawn\b/gi, "grilled vegetables"],
  [/\bsquid\b/gi, "grilled vegetables"],
  [/\boctopus\b/gi, "grilled vegetables"],
  [/\bcalamari\b/gi, "grilled vegetables"],
  [/\bcrab\b/gi, "grilled vegetables"],
  [/\blobster\b/gi, "grilled vegetables"],
  [/\btrout\b/gi, "grilled halloumi"],
  [/\bsalmon\b/gi, "grilled halloumi"],
  [/\bsnapper\b/gi, "grilled halloumi"],
  [/\bsea bream\b/gi, "grilled halloumi"],
  [/\bsardines\b/gi, "grilled halloumi"],
  [/\bsardine\b/gi, "grilled halloumi"],
  [/\bmackerel\b/gi, "grilled halloumi"],
  [/\btuna\b/gi, "grilled halloumi"],
  [/\bcod\b/gi, "grilled halloumi"],
  [/\bwhiting\b/gi, "grilled halloumi"],
  [/\bmahi-mahi\b/gi, "grilled halloumi"],
  [/\bdorado\b/gi, "grilled halloumi"],
  [/\bbarramundi\b/gi, "grilled halloumi"],
  [/\bfish\b/gi, "grilled vegetables"]
];

const VEGAN_EXTRA_RULES = [
  [/\bpastel de nata\b/gi, "vegan custard tart"],
  [/\bhalloumi\b/gi, "cashew spread"],
  [/\bfeta\b/gi, "cashew spread"],
  [/\bgraviera\b/gi, "cashew spread"],
  [/\bpayoyo\b/gi, "cashew spread"],
  [/\bcheese\b/gi, "cashew spread"],
  [/\bcheesy\b/gi, "creamy"],
  [/\bdairy\b/gi, "plant-based alternative"],
  [/\begg coffee\b/gi, "black coffee"],
  [/\beggs\b/gi, "tofu scramble"],
  [/\begg\b/gi, "tofu scramble"],
  [/\bmilk\b/gi, "oat milk"],
  [/\bbutter\b/gi, "olive oil"],
  [/\bcream\b/gi, "coconut cream"],
  [/\byogurt\b/gi, "coconut yogurt"],
  [/\byoghurt\b/gi, "coconut yogurt"],
  [/\bhoney\b/gi, "agave syrup"],
  [/\bmayo\b/gi, "vegan mayo"],
  [/\bghee\b/gi, "olive oil"]
];

const GLUTEN_FREE_RULES = [
  [/\bsoy sauce\b/gi, "tamari"],
  [/\bflatbread\b/gi, "rice flatbread"],
  [/\bcornbread\b/gi, "gluten-free cornbread"],
  [/\bpancakes\b/gi, "rice pancakes"],
  [/\bpancake\b/gi, "rice pancake"],
  [/\bdumplings\b/gi, "rice dumplings"],
  [/\bdumpling\b/gi, "rice dumpling"],
  [/\bcouscous\b/gi, "rice"],
  [/\bbulgar\b/gi, "rice"],
  [/\bnoodles\b/gi, "rice noodles"],
  [/\bpasta\b/gi, "rice noodles"],
  [/\bpita\b/gi, "rice pita"],
  [/\bpastry\b/gi, "gluten-free pastry"],
  [/\bcrust\b/gi, "gluten-free crust"],
  [/\bflour\b/gi, "rice flour"],
  [/\bseitan\b/gi, "gluten-free protein"],
  [/\bwheat\b/gi, "rice"],
  [/\bbeer\b/gi, "gluten-free beer"],
  [/\bpretzel\b/gi, "gluten-free pretzel"],
  [/\bbiscuit\b/gi, "gluten-free biscuit"],
  [/\bbread\b/gi, "gluten-free bread"],
  [/\bpies\b/gi, "gluten-free pies"],
  [/\bpie\b/gi, "gluten-free pie"]
];

const RULES = {
  Halal: HALAL_RULES,
  Vegetarian: VEGETARIAN_RULES,
  Vegan: [...VEGETARIAN_RULES, ...VEGAN_EXTRA_RULES],
  "Gluten-free": GLUTEN_FREE_RULES
};

function applyDiet(text, dietary) {
  if (!text) return text;
  const rules = RULES[dietary];
  if (!rules || !rules.length) return text;
  let out = text;
  for (const [re, rep] of rules) out = out.replace(re, rep);
  out = out.replace(/\s{2,}/g, " ").trim();
  // Preserve sentence-start capitalization of the original first letter.
  const first = text.charAt(0);
  if (first && first === first.toUpperCase() && first !== first.toLowerCase()) {
    out = out.charAt(0).toUpperCase() + out.slice(1);
  }
  return out;
}

export function applyDietToItinerary(itinerary, dietary) {
  if (!itinerary || !itinerary.length) return itinerary;
  if (!RULES[dietary]) return itinerary;
  return itinerary.map((d) => ({
    ...d,
    morning: applyDiet(d.morning, dietary),
    afternoon: applyDiet(d.afternoon, dietary),
    evening: applyDiet(d.evening, dietary),
    food_note: applyDiet(d.food_note, dietary)
  }));
}