// Append the country to a destination name only when the normalized name does
// not already contain or end with that country. Prevents accessible labels like
// "Tokyo & Kyoto, Japan, Japan" or "Canadian Rockies, Canada, Canada" when the
// curated name already embeds the country. Does not modify destination records.
export function nameWithCountry(name, country) {
  const n = (name || "").trim();
  const c = (country || "").trim();
  if (!n) return c;
  if (!c) return n;
  const nLow = n.toLowerCase();
  const cLow = c.toLowerCase();
  if (nLow === cLow) return n;
  if (nLow.includes(cLow)) return n;
  return `${n}, ${c}`;
}