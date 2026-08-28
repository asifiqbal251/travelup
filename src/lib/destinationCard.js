// Single source of truth for destination card geometry so every card in a
// discovery rail / Saved Trips rail / collection renders with identical width,
// aspect ratio and crop — no first-card enlargement, no content-dependent
// height. Imported by DiscoveryDestinationCard and SavedTripRail.
export const DEST_CARD_WIDTH = "w-[78vw] max-w-[300px] sm:w-[300px] lg:w-[320px]";
export const DEST_CARD_ASPECT = "aspect-[4/5]";
// Reserved title area keeps long names from shifting sibling card heights.
export const DEST_TITLE_CLAMP = "line-clamp-2 min-h-[2.6em] leading-tight";