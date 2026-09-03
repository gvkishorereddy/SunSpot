import {
  ASU_EVENTS_SOURCE,
  ASU_TIME_ZONE,
  type AsuEvent,
  dateKeyInTimeZone,
} from "./asu-events";

type EventLocationMatcher = {
  searchText: string;
  campus: string;
  venueAliases: string[];
  excludeAliases?: string[];
};

const EVENT_LOCATION_MATCHERS: Record<string, EventLocationMatcher> = {
  "downtown-phoenix-campus-library": {
    searchText: "University Center",
    campus: "Downtown Phoenix campus",
    venueAliases: ["University Center", "UCENT"],
  },
  "student-center-post-office-downtown": {
    searchText: "Post Office",
    campus: "Downtown Phoenix campus",
    venueAliases: ["Student Center at the Post Office", "Student Center @ the Post Office"],
  },
  "polytechnic-campus-library": {
    searchText: "Academic Center",
    campus: "Polytechnic campus",
    venueAliases: ["Academic Center"],
  },
  "polytechnic-student-union": {
    searchText: "Student Union",
    campus: "Polytechnic campus",
    venueAliases: ["Student Union", "Polytechnic Student Union", "STUN"],
  },
  "design-arts-library-tempe": {
    searchText: "Design North",
    campus: "Tempe campus",
    venueAliases: ["Design North", "Design and the Arts Library"],
  },
  "hayden-library-tempe": {
    searchText: "Hayden Library",
    campus: "Tempe campus",
    venueAliases: ["Hayden Library"],
  },
  "memorial-union-tempe": {
    searchText: "Memorial Union",
    campus: "Tempe campus",
    venueAliases: ["Memorial Union"],
    excludeAliases: ["Memorial Union Mall"],
  },
  "music-library-tempe": {
    searchText: "Music Building",
    campus: "Tempe campus",
    venueAliases: ["Music Building", "Music Library"],
  },
  "noble-library-tempe": {
    searchText: "Noble Library",
    campus: "Tempe campus",
    venueAliases: ["Noble Library"],
  },
  "student-pavilion-tempe": {
    searchText: "Student Pavilion",
    campus: "Tempe campus",
    venueAliases: ["Student Pavilion"],
  },
  "fletcher-library-west-valley": {
    searchText: "Fletcher Library",
    campus: "West Valley campus",
    venueAliases: ["Fletcher Library"],
  },
  "university-center-west-valley": {
    searchText: "UCB",
    campus: "West Valley campus",
    venueAliases: ["University Center", "UCB"],
  },
};

const MONTHS: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

function decodeHtml(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    lt: "<",
    nbsp: " ",
    ndash: "–",
    quot: '"',
    rsquo: "’",
  };

  return value.replace(
    /&(#x?[0-9a-f]+|[a-z]+);/gi,
    (entity, code: string) => {
      if (code.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
      }
      if (code.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
      }
      return namedEntities[code.toLowerCase()] ?? entity;
    },
  );
}

function cleanHtmlText(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function toArizonaTimestamp(dateLabel: string, timeLabel: string): string | null {
  const dateMatch = dateLabel.match(
    /^(?:[A-Za-z]{3},\s+)?([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})$/,
  );
  const timeMatch = timeLabel.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!dateMatch || !timeMatch) return null;

  const month = MONTHS[dateMatch[1]];
  if (!month) return null;

  let hour = Number(timeMatch[1]) % 12;
  if (timeMatch[3].toLowerCase() === "pm") hour += 12;

  const isoDate = `${dateMatch[3]}-${String(month).padStart(2, "0")}-${dateMatch[2].padStart(2, "0")}`;
  const isoTime = `${String(hour).padStart(2, "0")}:${timeMatch[2]}:00`;

  // Arizona stays on Mountain Standard Time (UTC−07:00) year-round.
  const timestamp = new Date(`${isoDate}T${isoTime}-07:00`);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

export function parseAsuEventCards(html: string): AsuEvent[] {
  const events: AsuEvent[] = [];
  const cardPattern = /<a\s+href="(\/event\/[^"#]+)"[^>]*>\s*<li>([\s\S]*?)<\/li>\s*<\/a>/gi;

  for (const match of html.matchAll(cardPattern)) {
    const body = match[2];
    const titleMatch = body.match(
      /<h2\s+class="event-list-title">([\s\S]*?)<\/h2>/i,
    );
    const dateMatch = body.match(/<strong>([^<]+)<\/strong>\s*,\s*<span\s+class="time-wrapper">/i);
    const times = Array.from(
      body.matchAll(/<span\s+class="smart-date--time">([^<]+)<\/span>/gi),
      (timeMatch) => cleanHtmlText(timeMatch[1]),
    );
    const locationMatch = body.match(
      /<i\s+class="[^"]*fa-map-marker-alt[^"]*"><\/i>([\s\S]*?)<\/div>/i,
    );

    if (!titleMatch || !dateMatch || times.length < 2 || !locationMatch) continue;

    const startsAt = toArizonaTimestamp(cleanHtmlText(dateMatch[1]), times[0]);
    const endsAtInitial = toArizonaTimestamp(cleanHtmlText(dateMatch[1]), times[1]);
    if (!startsAt || !endsAtInitial) continue;

    const startMs = Date.parse(startsAt);
    let endMs = Date.parse(endsAtInitial);
    if (endMs <= startMs) endMs += 24 * 60 * 60 * 1000;

    const relativeUrl = decodeHtml(match[1]);
    events.push({
      id: relativeUrl,
      title: cleanHtmlText(titleMatch[1]),
      url: new URL(relativeUrl, ASU_EVENTS_SOURCE).toString(),
      startsAt,
      endsAt: new Date(endMs).toISOString(),
      location: cleanHtmlText(locationMatch[1]).replace(/^,\s*/, ""),
    });
  }

  return events;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSupportedEventBuilding(buildingSlug: string): boolean {
  return buildingSlug in EVENT_LOCATION_MATCHERS;
}

export function eventMatchesBuilding(
  event: AsuEvent,
  buildingSlug: string,
): boolean {
  const matcher = EVENT_LOCATION_MATCHERS[buildingSlug];
  if (!matcher) return false;

  const location = normalize(event.location);
  const isExcluded = matcher.excludeAliases?.some((alias) =>
    location.includes(normalize(alias)),
  );

  return (
    !isExcluded &&
    location.includes(normalize(matcher.campus)) &&
    matcher.venueAliases.some((alias) => location.includes(normalize(alias)))
  );
}

export function buildAsuEventsUrl(
  buildingSlug: string,
  now = new Date(),
): URL | null {
  const matcher = EVENT_LOCATION_MATCHERS[buildingSlug];
  if (!matcher) return null;

  const date = dateKeyInTimeZone(now, ASU_TIME_ZONE);
  const url = new URL(ASU_EVENTS_SOURCE);
  url.searchParams.set("eventDate[min]", date);
  url.searchParams.set("eventDate[max]", date);
  url.searchParams.set("searchText", matcher.searchText);
  url.searchParams.set("page", "0");
  return url;
}
