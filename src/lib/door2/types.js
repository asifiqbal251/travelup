// Door 2 contracts (v5 + additive fields marked ➕ for the skeleton scheduler).
// JSDoc typedefs only: this module has no runtime behaviour.

/**
 * @typedef {'base'|'gateway'|'attraction'} VisitKind
 */

/**
 * A place a traveller can be. A Place never carries an airport; gateways live
 * on the Connection.
 * @typedef {Object} Place
 * @property {string} id                 Stable id, e.g. "cusco".
 * @property {string} name               Display name.
 * @property {string[]} aliases          Alternative names for search/matching.
 * @property {string} countryId          ISO-ish country id, e.g. "PE".
 * @property {{lat: number, lng: number}} coordinates  WGS84 position.
 * @property {VisitKind} visitKind       'attraction' places can never be an overnight base.
 * @property {number} utcOffsetHours     ➕ Fixed UTC offset. The pilot does not model DST (known ≤1h error).
 */

/**
 * @typedef {'flight_international'|'flight_domestic'|'train'|'road_private_transfer'|'coach_scheduled'|'local_shuttle'|'ferry'} ConnectionMode
 */

/**
 * @typedef {Object} ConnectionSegment
 * @property {ConnectionMode} mode       Mode of this segment.
 * @property {number} inVehicleHours     Time moving in this segment.
 * @property {{min: number, max: number}} [typicalRangeHours]  Display only.
 */

/**
 * A catalogue transport row. Buffers are never stored here; they are combined
 * with transport time only at request time (see bufferRuleset.js).
 * @typedef {Object} Connection
 * @property {string} id                 Stable id, e.g. "conn_lim_cuz_air".
 * @property {string} fromPlaceId        Authored origin place.
 * @property {string} toPlaceId          Authored destination place.
 * @property {ConnectionMode} mode       Primary mode; selects the buffer rule.
 * @property {number} inVehicleHours     Must equal the sum of `segments` when segments are present.
 * @property {ConnectionSegment[]} [segments]  Individual legs of a multi-segment trip.
 * @property {number} [layoverHours]     Time *between* segments only.
 * @property {{min: number, max: number}} [typicalRangeHours]  Display only, never read by the engine.
 * @property {string} [gatewayId]        e.g. "NRT".
 * @property {string} [processingProfile]  e.g. "US_preclearance"; never traveller-eligibility wording.
 * @property {{origin: number, destination: number}} [localTransferHours]  Door-to-terminal time at each end.
 * @property {'bidirectional'|'oneway'} direction  Whether the row may be used in reverse.
 * @property {string[]} gatewayRequirements  Requirements at the gateway (informational).
 * @property {string[]} assumptions      Authoring assumptions behind the numbers.
 * @property {string[]} sources          Where the numbers came from.
 * @property {string|null} reviewedBy    Reviewer; null means draft.
 * @property {string|null} reviewedAt    Review timestamp; null means draft.
 * @property {number} version            Row version.
 */

/**
 * @typedef {Object} BufferRuleset
 * @property {string} id                 e.g. "buffer_ruleset_v2".
 * @property {Object<string, {preHours: number, postHours: number}>} modes  Per-mode allowances at the true origin/destination.
 * @property {{eachEndHours: number}} localTransferDefault  Used when a Connection has no localTransferHours.
 */

/**
 * @typedef {Object} RoutePackageExcursion
 * @property {string} placeId            The attraction visited (never an overnight location).
 * @property {string} connectionId       Connection from the base stop to the attraction.
 * @property {number} hoursOnSite        Time spent at the attraction.
 */

/**
 * ➕ One stop in an authored route package.
 * `nights: 0` means pass-through: the traveller changes transport there and doesn't stay.
 * @typedef {Object} RoutePackageStop
 * @property {string} id                 Authored and stable (e.g. "pc_cusco"), never an array index.
 * @property {string} placeId            Where the stop is.
 * @property {number} minNights          Fewest nights at this stop.
 * @property {number} maxNights          Most nights at this stop (0 = always pass-through).
 * @property {RoutePackageExcursion[]} excursions  Day trips from this stop.
 */

/**
 * @typedef {Object} RoutePackage
 * @property {string} id                 e.g. "peru_classic".
 * @property {string} name               Display name.
 * @property {string} countryId          ➕ Country this package covers.
 * @property {RoutePackageStop[]} stops  ➕ Ordered journey including the return path; the origin is implicit at both ends.
 * @property {string[]} placeIds         Derived: every stop and excursion place.
 * @property {{minNights: number, maxNights: number, extensions: string[]}} visitRules  Kept for v5 compatibility; not read by the scheduler.
 * @property {boolean} reviewed          Whether the package itself has been reviewed.
 * @property {string[]} [assumptions]    ➕ Authoring assumptions (e.g. the Cusco acclimatisation minimum).
 * @property {string} [preferredGatewayId]  ➕ Prefer connections with this gateway.
 */

/**
 * @typedef {Object} RouteResultStop
 * @property {string} id                 RoutePackageStop id.
 * @property {string} placeId            Where the stop is.
 * @property {number} nights             Nights currently assigned (minNights until scheduled).
 * @property {number} minNights          From the package.
 * @property {number} maxNights          From the package.
 * @property {boolean} isRequired        True when the stop or one of its excursions is a required place.
 * @property {RoutePackageExcursion[]} excursions  Day trips from this stop.
 */

/**
 * @typedef {Object} RouteResult
 * @property {'authored'|'composed'} source  Only 'authored' exists in the skeleton.
 * @property {string} routePackageId     Package this route came from.
 * @property {RouteResultStop[]} stops   Ordered stops.
 * @property {string[]} connectionIds    One per leg: origin→first stop, stop→stop, last stop→origin.
 * @property {boolean} usesDraftData     ➕ True when any used connection is unreviewed.
 */

/**
 * @typedef {Object} TripSpecStop
 * @property {string} id                 Stop id (package stop id for recommendations).
 * @property {string} placeId            Where the stop is.
 * @property {string} placeSource        e.g. 'recommendation' or 'user'.
 * @property {number} nights             Nights at this stop.
 * @property {boolean} isRequired        Whether the traveller required it.
 */

/**
 * @typedef {Object} TripSpecChoices
 * @property {string[]} pinned           Content the traveller pinned.
 * @property {string[]} rejected         Content the traveller rejected.
 * @property {string[]} placed           Content the traveller placed by hand.
 */

/**
 * @typedef {Object} TripSpec
 * @property {string} originPlaceId      Where the traveller leaves from and returns to.
 * @property {{kind: 'place'|'country', id: string}} destination  ➕ The traveller's "going to".
 * @property {number} travelMonth        1–12.
 * @property {string} [startDate]        ISO date, optional.
 * @property {string} [endDate]          ISO date, optional.
 * @property {number} totalDays          Departure day through home-arrival day, inclusive.
 * @property {string} travellerType      e.g. 'solo', 'couple'.
 * @property {string[]} interests        Interest tags.
 * @property {string} pace               Pace preference (not read by the skeleton).
 * @property {string} budget             Budget band.
 * @property {string[]} requiredPlaceIds Places the trip must include.
 * @property {string|null} routeTemplateId  Route package used.
 * @property {TripSpecStop[]} stops      Stops of the chosen route.
 * @property {TripSpecChoices} choices   Traveller content choices.
 */

/**
 * @typedef {'destination_not_covered'|'route_not_supported'|'duration_too_short'|'required_place_conflict'|'connection_unreviewed'|'content_insufficient'} FailureStateName
 */

/**
 * A concrete way forward offered with every failure.
 * @typedef {{action: string, detail: string} & Object<string, any>} FailureOption
 */

/**
 * @typedef {Object} FailureResult
 * @property {false} ok
 * @property {FailureStateName} state    Which failure.
 * @property {string} message            Plain-language sentence for the traveller.
 * @property {FailureOption[]} options   At least one way forward.
 * @property {any} [detail]              Machine-readable detail.
 */

/**
 * @typedef {Object} BlockTransport
 * @property {string} connectionId       Catalogue row used.
 * @property {ConnectionMode} mode       Mode of the row.
 * @property {number} inVehicleHours     In-vehicle time (segments sum).
 * @property {number} [layoverHours]     Time between segments.
 * @property {string} bufferRulesetId    Ruleset used for pre/post allowances.
 * @property {number} bufferRulesetVersion  Version of that ruleset.
 * @property {number} computedUsableTimeLost  Door-to-door hours, computed at request time.
 * @property {boolean} estimated         True: not a real timetable.
 * @property {string} fromPlaceId        ➕ Departure place (oriented).
 * @property {string} toPlaceId          ➕ Arrival place (oriented).
 * @property {string} [gatewayId]        ➕ e.g. "NRT".
 * @property {boolean} overnight         ➕ In transit at 02:00 in either end's local clock.
 * @property {number} arriveDayNumber    ➕ Trip day of arrival, local at toPlaceId.
 * @property {string} arriveTime         ➕ "HH:MM" local at toPlaceId.
 */

/**
 * @typedef {Object} Provenance
 * @property {'curated'|'generated'|'user'|'external'} source
 * @property {boolean} reviewed          False whenever draft data was used.
 * @property {'low'|'medium'|'high'} confidence
 * @property {Object} [generation]       Generator metadata (not used by the skeleton).
 * @property {ContentSource} [content]   ➕ Filled activities: the content item's `source`.
 */

/**
 * ➕ Where a content item came from.
 * @typedef {{kind: 'extracted', bundleId: string, bundleName: string, templateTitle: string, edited?: boolean} | {kind: 'authored', note: string}} ContentSource
 */

/**
 * ➕ One curated activity on the per-place pilot shelf (pilotContent.js).
 * @typedef {Object} ContentItem
 * @property {string} id                 Stable id, e.g. "cusco_pisac".
 * @property {string} placeId            The one place it happens at.
 * @property {string} title              Display title.
 * @property {Array<'full'|'half'|'evening'|'short'>} slots  Slot kinds it fits.
 * @property {'Light'|'Moderate'|'High'|'Highly active'} intensity
 * @property {string[]} interests        WhereNova interest labels.
 * @property {string} summary            One line, used for every slot kind.
 * @property {string} [morning]          Present whenever slots includes 'full'.
 * @property {string} [afternoon]        Present whenever slots includes 'full'.
 * @property {string} [evening]          Present whenever slots includes 'full'.
 * @property {string} [foodNote]
 * @property {boolean} [arrivalFriendly] Good as the first thing at a new stop.
 * @property {number} [minDayAtStop]     Not before this many days after arriving (altitude safety).
 * @property {ContentSource} source      Provenance back to the source bundle, or 'authored'.
 */

/**
 * ➕ The activity on a filled block (fill.js).
 * @typedef {Object} BlockActivity
 * @property {string} templateId         ContentItem id.
 * @property {string} title
 * @property {'full'|'half'|'evening'|'short'} slot  ➕ Slot class of the block.
 * @property {string} summary            ➕ The item's one-line summary.
 * @property {string} intensity
 * @property {string[]} interests
 * @property {string} [foodNote]
 * @property {string} [morning]          Full slots only.
 * @property {string} [afternoon]        Full slots only.
 * @property {string} [evening]          Full slots only.
 */

/**
 * @typedef {Object} Block
 * @property {string} id                 Deterministic id (see schedule.js).
 * @property {'travel'|'activity'|'meal'|'rest'|'free'|'open'} type
 * @property {{stopId: string|null, contentId: string|null}} anchor  Stop the block belongs to, and its content/connection.
 * @property {string|null} placeId       Where it happens (departure place for travel).
 * @property {string} startTime          "HH:MM", local at placeId.
 * @property {number} durationHours      Length of the block.
 * @property {BlockActivity} [activity] Filled later by fill.js.
 * @property {BlockTransport} [transport]  Present on travel blocks.
 * @property {Provenance} provenance
 * @property {string} generationStatus   'ok' for the skeleton.
 * @property {boolean} userEdited        Always false in the skeleton.
 * @property {boolean} locked            Always false in the skeleton.
 * @property {Object} [liveData]         Reserved for live data.
 * @property {string} [note]             e.g. 'in_transit' on a filler rest block.
 * @property {{reason: 'no_eligible_content', slot: string}} [gap]  ➕ Set by fill.js on an open block it couldn't fill (generationStatus 'unavailable').
 */

/**
 * @typedef {Object} Day
 * @property {string} id                 'day:<n>'.
 * @property {number} dayNumber          1..totalDays.
 * @property {Block[]} blocks            Sorted by start.
 */

/**
 * @typedef {Object} Trip
 * @property {string} id
 * @property {'draft'|'valid'|'conflict'|'incomplete'} status
 * @property {TripSpec} spec
 * @property {Day[]} days
 * @property {string[]} warnings        ➕ Scheduler warnings, e.g. 'nights_above_package_max'.
 * @property {{engine: string, schema: string, content: string, routeData: string, bufferRuleset: string}} versions
 * @property {Object[]} history
 * @property {Array<{blockId: string, dayNumber: number, placeId: string, slot: string}>} [contentGaps]  ➕ Open blocks fill.js left unfilled (filled Trips only).
 */

export {};
