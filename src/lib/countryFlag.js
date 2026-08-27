// Restrained country flag emoji for destination location lines. Returns an
// empty string when the country can't be reliably mapped, so callers render
// `flag + " " + country` and simply omit the flag when unknown. No network —
// flags are regional-indicator emoji derived from an ISO2 mapping.

const COUNTRY_TO_ISO2 = {
  "Argentina": "AR", "Australia": "AU", "Austria": "AT", "Bangladesh": "BD",
  "Belgium": "BE", "Brazil": "BR", "Bulgaria": "BG", "Cambodia": "KH",
  "Canada": "CA", "Chile": "CL", "China": "CN", "Colombia": "CO", "Croatia": "HR",
  "Cuba": "CU", "Cyprus": "CY", "Czech Republic": "CZ", "Denmark": "DK",
  "Egypt": "EG", "Estonia": "EE", "Finland": "FI", "France": "FR", "Germany": "DE",
  "Ghana": "GH", "Greece": "GR", "Hong Kong": "HK", "Hungary": "HU", "Iceland": "IS",
  "India": "IN", "Indonesia": "ID", "Iran": "IR", "Ireland": "IE", "Israel": "IL",
  "Italy": "IT", "Japan": "JP", "Jordan": "JO", "Kenya": "KE", "Latvia": "LV",
  "Lithuania": "LT", "Malaysia": "MY", "Mexico": "MX", "Morocco": "MA",
  "Namibia": "NA", "Nepal": "NP", "Netherlands": "NL", "New Zealand": "NZ",
  "Nigeria": "NG", "Norway": "NO", "Pakistan": "PK", "Peru": "PE", "Philippines": "PH",
  "Poland": "PL", "Portugal": "PT", "Qatar": "QA", "Romania": "RO", "Russia": "RU",
  "Saudi Arabia": "SA", "Serbia": "RS", "Singapore": "SG", "Slovakia": "SK",
  "South Africa": "ZA", "South Korea": "KR", "Spain": "ES", "Sri Lanka": "LK",
  "Sweden": "SE", "Switzerland": "CH", "Taiwan": "TW", "Tanzania": "TZ",
  "Thailand": "TH", "Tunisia": "TN", "Türkiye": "TR", "Turkey": "TR", "Ukraine": "UA",
  "United Arab Emirates": "AE", "United Kingdom": "GB", "United States": "US",
  "Uruguay": "UY", "Venezuela": "VE", "Vietnam": "VN"
};

function iso2ToFlag(iso2) {
  if (!iso2 || iso2.length !== 2) return "";
  const a = iso2.toUpperCase();
  const c1 = a.charCodeAt(0) - 65;
  const c2 = a.charCodeAt(1) - 65;
  if (c1 < 0 || c1 > 25 || c2 < 0 || c2 > 25) return "";
  return String.fromCodePoint(0x1f1e6 + c1, 0x1f1e6 + c2);
}

export function flagForCountry(country) {
  if (!country) return "";
  const iso = COUNTRY_TO_ISO2[String(country).trim()];
  return iso ? iso2ToFlag(iso) : "";
}