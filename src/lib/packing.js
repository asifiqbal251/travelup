// Deterministic packing-list generation.

const CATEGORY_ORDER = [
  "Documents and money",
  "Clothing",
  "Footwear",
  "Toiletries and health",
  "Electronics",
  "Activity-specific equipment",
  "Destination-specific items",
  "Optional items"
];

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function generatePackingList(dest, prefs) {
  const buckets = {};
  CATEGORY_ORDER.forEach((c) => (buckets[c] = []));
  const add = (cat, label) => {
    if (!buckets[cat]) buckets[cat] = [];
    if (label && !buckets[cat].includes(label)) buckets[cat].push(label);
  };

  // Base — universal core
  add("Documents and money", "Passport (valid 6+ months)");
  add("Documents and money", "Travel insurance documents");
  add("Documents and money", "Credit and debit cards");
  add("Documents and money", "Some local currency");
  add("Documents and money", "Emergency cash (separate)");
  add("Documents and money", "Photocopy or photo of passport");
  add("Documents and money", "Return ticket copy");
  add("Clothing", "Underwear (enough for trip + 2)");
  add("Clothing", "Socks");
  add("Clothing", "T-shirts / tops");
  add("Clothing", "Long-sleeve shirt");
  add("Clothing", "Trousers or jeans");
  add("Clothing", "Light jumper or hoodie");
  add("Clothing", "Sleepwear");
  add("Clothing", "Rain jacket or light shell");
  add("Footwear", "Comfortable walking shoes");
  add("Footwear", "Sandals or flip-flops");
  add("Toiletries and health", "Toothbrush and toothpaste");
  add("Toiletries and health", "Deodorant");
  add("Toiletries and health", "Shampoo and soap");
  add("Toiletries and health", "Sunscreen");
  add("Toiletries and health", "Basic first-aid kit");
  add("Toiletries and health", "Personal medications");
  add("Toiletries and health", "Hand sanitiser");
  add("Electronics", "Phone and charger");
  add("Electronics", "Power adapter / converter");
  add("Electronics", "Power bank");
  add("Electronics", "Headphones");
  add("Optional items", "Reusable water bottle");
  add("Optional items", "Daypack or small backpack");
  add("Optional items", "Sunglasses");
  add("Optional items", "Notebook and pen");
  add("Optional items", "Snacks for travel");

  // Climate
  const climate = prefs.climate;
  if (climate === "Warm") {
    add("Clothing", "Light breathable clothing");
    add("Clothing", "Sun hat");
    add("Toiletries and health", "Insect repellent");
  } else if (climate === "Mild") {
    add("Clothing", "Layers for cool evenings");
  } else if (climate === "Cool") {
    add("Clothing", "Warm jacket");
    add("Clothing", "Scarf");
  } else if (climate === "Cold or snowy") {
    add("Clothing", "Insulated winter coat");
    add("Clothing", "Thermal base layers");
    add("Clothing", "Gloves");
    add("Clothing", "Warm hat");
  }

  // Interests / activities
  const interests = prefs.interests || [];
  if (interests.includes("Hiking")) {
    add("Footwear", "Hiking boots");
    add("Activity-specific equipment", "Moisture-wicking hiking clothes");
    add("Activity-specific equipment", "Trekking poles (optional)");
  }
  if (interests.includes("Beaches")) {
    add("Clothing", "Swimwear");
    add("Activity-specific equipment", "Quick-dry beach towel");
    add("Toiletries and health", "Reef-safe sunscreen");
  }
  if (interests.includes("Wildlife")) {
    add("Activity-specific equipment", "Binoculars (optional)");
    add("Clothing", "Neutral-coloured clothing");
  }
  if (interests.includes("Photography")) {
    add("Activity-specific equipment", "Camera and lenses");
    add("Activity-specific equipment", "Extra batteries and memory cards");
    add("Activity-specific equipment", "Tripod (optional)");
  }
  if (interests.includes("Adventure")) {
    add("Clothing", "Quick-dry clothing");
  }

  // Dietary
  const diet = prefs.dietary;
  if (diet === "Vegetarian" || diet === "Vegan" || diet === "Gluten-free") {
    add("Optional items", `${diet} snacks for limited options`);
  }
  if (diet === "Halal") {
    add("Optional items", "Halal snack backup for remote areas");
  }

  // Trip length
  const days = prefs.travelDays || 7;
  if (days >= 10) {
    add("Optional items", "Laundry bag");
    add("Optional items", "Travel detergent");
  }

  // Destination-specific
  (dest.seasonal_packing || []).forEach((item) => add("Destination-specific items", item));

  // Assemble with stable ids
  return CATEGORY_ORDER.map((category) => {
    const labels = buckets[category] || [];
    return {
      category,
      items: labels.map((label, idx) => ({
        id: `${slug(category)}-${idx}`,
        label,
        custom: false
      }))
    };
  }).filter((g) => g.items.length > 0);
}