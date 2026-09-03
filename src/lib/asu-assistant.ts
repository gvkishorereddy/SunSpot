import {
  ASU_ACADEMIC_CALENDAR_SOURCE,
  getAcademicContext,
} from "../data/asu-academic-calendar";
import {
  ASU_EVENTS_SOURCE,
  dateKeyInTimeZone,
  formatAsuEventTime,
  groupTodayEvents,
  type AsuEvent,
} from "./asu-events";
import {
  evaluateBuildingHours,
  type BuildingHoursInput,
} from "./operating-hours";
import { estimateCrowdLevel } from "./crowd-estimate";

export type AssistantBuildingInput = BuildingHoursInput & {
  name: string;
  campus: string;
  address: string | null;
  category: string;
  official_hours_url: string | null;
  location_source_url: string | null;
  baseline_crowd_level: number;
  slug?: string;
};

export type KnowledgeSource = {
  id: string;
  title: string;
  url: string;
  excerpt: string;
};

export type QuestionTimeRange = {
  startAt: Date;
  endAt: Date;
  label: string;
};

export type AssistantRequestPlan = {
  campus: string | null;
  availability: string | null;
  intents: string[];
  keywords: string[];
  selectedBuildingHint: string | null;
  answerGoal: string;
};

const CLOCK_PATTERN = "(\\d{1,2})(?::([0-5]\\d))?\\s*(a\\.?m\\.?|p\\.?m\\.?)?";

function normalizeMeridiem(value: string | undefined) {
  return value?.toLowerCase().replace(/\./g, "") as "am" | "pm" | undefined;
}

function clockMinutes(
  hourValue: string,
  minuteValue: string | undefined,
  meridiem: "am" | "pm",
) {
  const hour = Number(hourValue);
  const minute = Number(minuteValue ?? "0");
  if (hour < 1 || hour > 12) return null;
  return (hour % 12) * 60 + minute + (meridiem === "pm" ? 12 * 60 : 0);
}

function formatMinute(minute: number) {
  const normalized = minute % (24 * 60);
  const hour = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const hour12 = hour % 12 || 12;
  return `${hour12}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""} ${hour < 12 ? "AM" : "PM"}`;
}

function localMinute(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Phoenix",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

function rangeFromMinutes(
  startMinute: number,
  endMinute: number,
  now: Date,
): QuestionTimeRange {
  const midnight = new Date(`${dateKeyInTimeZone(now)}T00:00:00-07:00`);
  return {
    startAt: new Date(midnight.getTime() + startMinute * 60_000),
    endAt: new Date(midnight.getTime() + endMinute * 60_000),
    label: `${formatMinute(startMinute)}–${formatMinute(endMinute)}`,
  };
}

export function parseQuestionTimeRange(
  question: string,
  now = new Date(),
): QuestionTimeRange | null {
  const rangePattern = new RegExp(
    `(?:\\bfrom\\s+|\\bbetween\\s+)?${CLOCK_PATTERN}\\s*(?:-|–|—|\\bto\\b|\\band\\b)\\s*${CLOCK_PATTERN}`,
    "i",
  );
  const range = question.match(rangePattern);

  if (range) {
    let startMeridiem = normalizeMeridiem(range[3]);
    let endMeridiem = normalizeMeridiem(range[6]);
    const startHour = Number(range[1]);
    const endHour = Number(range[4]);

    if (!startMeridiem && endMeridiem) {
      startMeridiem =
        endMeridiem === "pm" && startHour > endHour ? "am" : endMeridiem;
    }
    if (!endMeridiem && startMeridiem) {
      endMeridiem =
        startMeridiem === "am" && endHour < startHour ? "pm" : startMeridiem;
    }
    if (!startMeridiem || !endMeridiem) return null;

    const startMinute = clockMinutes(range[1], range[2], startMeridiem);
    let endMinute = clockMinutes(range[4], range[5], endMeridiem);
    if (startMinute === null || endMinute === null) return null;
    if (endMinute <= startMinute) endMinute += 24 * 60;
    if (endMinute - startMinute > 12 * 60) return null;

    return rangeFromMinutes(startMinute, endMinute, now);
  }

  const after = question.match(
    new RegExp(`\\bafter\\s+${CLOCK_PATTERN}`, "i"),
  );
  if (after) {
    const meridiem = normalizeMeridiem(after[3]);
    if (!meridiem) return null;
    const startMinute = clockMinutes(after[1], after[2], meridiem);
    return startMinute === null
      ? null
      : rangeFromMinutes(startMinute, 24 * 60, now);
  }

  const before = question.match(
    new RegExp(`\\bbefore\\s+${CLOCK_PATTERN}`, "i"),
  );
  if (before) {
    const meridiem = normalizeMeridiem(before[3]);
    if (!meridiem) return null;
    const endMinute = clockMinutes(before[1], before[2], meridiem);
    const startMinute = localMinute(now);
    return endMinute === null || endMinute <= startMinute
      ? null
      : rangeFromMinutes(startMinute, endMinute, now);
  }

  return null;
}

export function filterEventsForTimeRange(
  events: AsuEvent[],
  range: QuestionTimeRange | null,
) {
  if (!range) return events;
  const start = range.startAt.getTime();
  const end = range.endAt.getTime();
  return events.filter((event) => {
    const eventStart = Date.parse(event.startsAt);
    const eventEnd = Date.parse(event.endsAt);
    return eventStart < end && eventEnd > start;
  });
}

export function filterEventsForQuestionCampus(
  events: AsuEvent[],
  question: string,
) {
  const requestedCampus = getRequestedCampus(question);

  if (!requestedCampus) return events;
  return events.filter((event) =>
    event.location.toLowerCase().includes(requestedCampus.toLowerCase()),
  );
}

export function getRequestedCampus(question: string) {
  const normalizedQuestion = question.toLowerCase();
  return [
    { aliases: ["downtown phoenix", "downtown"], campus: "Downtown Phoenix" },
    { aliases: ["polytechnic", "poly campus"], campus: "Polytechnic" },
    { aliases: ["tempe"], campus: "Tempe" },
    { aliases: ["west valley", "west campus"], campus: "West Valley" },
  ].find(({ aliases }) =>
    aliases.some((alias) => normalizedQuestion.includes(alias)),
  )?.campus ?? null;
}

function sourceKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildBuildingKnowledgeSources(
  building: AssistantBuildingInput,
  now = new Date(),
  idPrefix = sourceKey(building.slug || building.name),
): KnowledgeSource[] {
  const hours = evaluateBuildingHours(building, now);
  const hoursUrl =
    building.official_hours_url ||
    building.location_source_url ||
    "https://www.asu.edu/map/interactive/";
  const locationUrl =
    building.location_source_url ||
    building.official_hours_url ||
    "https://www.asu.edu/map/interactive/";
  const id = (kind: string) => (idPrefix ? `${idPrefix}-${kind}` : kind);
  const referenceTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: building.timezone || "America/Phoenix",
  }).format(now);

  return [
    {
      id: id("official-hours"),
      title: `${building.name} official hours`,
      url: hoursUrl,
      excerpt: `At ${referenceTime} MST today, ${building.name} is ${hours.status === "open" ? "open" : hours.status === "closed" ? "closed" : "waiting for verified hours"}. Today's hours are ${hours.todayHours}. ${hours.statusDetail}.`,
    },
    {
      id: id("location"),
      title: `${building.name} location`,
      url: locationUrl,
      excerpt: `${building.name} is a ${building.category.toLowerCase()} on ASU's ${building.campus} campus.${building.address ? ` Its address is ${building.address}.` : ""}`,
    },
  ];
}

export function buildAcademicKnowledgeSource(
  now = new Date(),
): KnowledgeSource {
  const academic = getAcademicContext(dateKeyInTimeZone(now));
  return {
    id: "academic-calendar",
    title: "ASU academic calendar",
    url: ASU_ACADEMIC_CALENDAR_SOURCE,
    excerpt: academic.event
      ? `The ASU academic calendar marks today as ${academic.event.name}. ${academic.term ? `It falls within ${academic.term.name}.` : ""}`
      : academic.term
        ? `Today falls within ${academic.term.name}. Classes end ${academic.term.classesEndOn}, and the term ends ${academic.term.endsOn}.`
        : "Today is outside the currently verified ASU academic terms in SunSpot.",
  };
}

export function buildEventKnowledgeSources(
  events: AsuEvent[],
  now = new Date(),
  idPrefix = "campus-event",
): KnowledgeSource[] {
  const groupedEvents = groupTodayEvents(events, now);
  const remainingEvents = [
    ...groupedEvents.happeningNow,
    ...groupedEvents.laterToday,
  ];

  return remainingEvents.slice(0, 10).map((event, index) => {
    const happeningNow = groupedEvents.happeningNow.some(
      (candidate) => candidate.id === event.id,
    );
    return {
      id: `${idPrefix}-${index + 1}`,
      title: event.title,
      url: event.url,
      excerpt: `${event.title} is ${happeningNow ? "happening now" : "scheduled later today"} from ${formatAsuEventTime(event)} MST at ${event.location}.`,
    };
  });
}

export function buildCampusOptionSources(
  buildings: AssistantBuildingInput[],
  campus: string | null,
  now = new Date(),
): KnowledgeSource[] {
  return buildings
    .filter((building) => !campus || building.campus === campus)
    .map((building) => {
      const hours = evaluateBuildingHours(building, now);
      const crowd = estimateCrowdLevel(building, now, hours);
      return { building, hours, crowd };
    })
    .filter(({ hours, crowd }) => hours.isOpen && crowd.score !== null)
    .sort((left, right) =>
      (left.crowd.score ?? 10) - (right.crowd.score ?? 10),
    )
    .map(({ building, hours, crowd }) => ({
      id: `campus-option-${sourceKey(building.slug || building.name)}`,
      title: `Study option: ${building.name}`,
      url:
        building.official_hours_url ||
        building.location_source_url ||
        "https://www.asu.edu/map/interactive/",
      excerpt: `${building.name} on the ${building.campus} campus is ${hours.statusDetail.toLowerCase()}. SunSpot's schedule-based forecast is ${crowd.score}/10 (${crowd.label}); this is an estimate, not a live measurement.${building.address ? ` Address: ${building.address}.` : ""}`,
    }));
}

const STOP_WORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "at",
  "can",
  "for",
  "here",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "of",
  "on",
  "the",
  "there",
  "this",
  "to",
  "today",
  "what",
  "when",
  "where",
]);

function tokens(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(/\s+/)
        .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
    ),
  );
}

function hasEventIntent(normalizedQuestion: string) {
  return (
    /\b(event|events|happening|activity|activities|fun)\b/.test(
      normalizedQuestion,
    ) || /\bwhat (?:can|could|should) (?:i|we) do\b/.test(normalizedQuestion)
  );
}

export function buildAssistantRequestPlan(
  question: string,
  availability: QuestionTimeRange | null,
  selectedBuildingHint: string | null,
): AssistantRequestPlan {
  const normalizedQuestion = question.toLowerCase();
  const intents: string[] = [];

  if (hasEventIntent(normalizedQuestion)) {
    intents.push("events");
  }
  if (/\b(crowd|crowded|busy|quiet|packed|forecast)\b/.test(normalizedQuestion)) {
    intents.push("crowd");
  }
  if (/\b(open|close|closed|closing|hour|hours)\b/.test(normalizedQuestion)) {
    intents.push("hours");
  }
  if (/\b(study|space|spot|seat|library)\b/.test(normalizedQuestion)) {
    intents.push("study-space");
  }
  if (/\b(where|address|located|location|near|nearby)\b/.test(normalizedQuestion)) {
    intents.push("location");
  }
  if (/\b(calendar|class|classes|break|final|finals|holiday|semester|term)\b/.test(normalizedQuestion)) {
    intents.push("academic-calendar");
  }
  if (intents.length === 0) intents.push("general-campus-information");

  const ignoredKeywords = new Set([
    "after",
    "before",
    "between",
    "free",
    "from",
    "pm",
    "am",
  ]);
  const keywords = tokens(question)
    .filter((token) => !ignoredKeywords.has(token) && !/^\d+$/.test(token))
    .slice(0, 14);

  const answerGoal = intents.includes("events")
    ? "Recommend up to three eligible events from the provided event facts. Respect the campus and availability constraints exactly. If fewer events qualify, do not pad the answer with unrelated events. You may add one open, lower-crowd campus option when useful."
    : intents.includes("hours")
      ? "Answer only the operating-hours request for the named place from the provided official-hours facts. Do not add events or alternative places."
      : intents.includes("academic-calendar")
        ? "Answer only the academic-calendar request from the provided calendar facts. Do not add campus events, locations, or study recommendations."
        : intents.includes("crowd") || intents.includes("study-space")
          ? "Recommend the most useful open campus option from the provided hours and crowd facts, clearly labeling crowd values as SunSpot forecasts rather than live measurements."
        : "Answer the campus-information request using only the most relevant provided facts.";

  return {
    campus: getRequestedCampus(question),
    availability: availability?.label ?? null,
    intents,
    keywords,
    selectedBuildingHint,
    answerGoal,
  };
}

export function filterKnowledgeSourcesForPlan(
  sources: KnowledgeSource[],
  plan: AssistantRequestPlan,
) {
  const knownIntent = plan.intents.some(
    (intent) => intent !== "general-campus-information",
  );
  if (!knownIntent) return sources;

  return sources.filter((source) => {
    const isEvent =
      source.id.startsWith("campus-event") ||
      source.id === "availability-events";
    const isCampusOption = source.id.startsWith("campus-option");
    const isHours = source.id.endsWith("-official-hours");
    const isLocation = source.id.endsWith("-location");
    const isAcademic = source.id === "academic-calendar";

    return (
      (plan.intents.includes("events") && (isEvent || isCampusOption)) ||
      ((plan.intents.includes("crowd") ||
        plan.intents.includes("study-space")) &&
        (isCampusOption || isHours || isLocation)) ||
      (plan.intents.includes("hours") && (isHours || isLocation)) ||
      (plan.intents.includes("location") && isLocation) ||
      (plan.intents.includes("academic-calendar") && isAcademic)
    );
  });
}

export function answerMatchesRequestPlan(
  answer: string,
  plan: AssistantRequestPlan,
  sources: KnowledgeSource[],
) {
  const normalizedAnswer = answer.toLowerCase();
  const eventSources = sources.filter((source) =>
    source.id.startsWith("campus-event"),
  );
  const campusOptions = sources.filter((source) =>
    source.id.startsWith("campus-option"),
  );

  if (
    plan.intents.includes("events") &&
    eventSources.length > 0 &&
    !eventSources.some((source) =>
      normalizedAnswer.includes(source.title.toLowerCase()),
    )
  ) {
    return false;
  }

  if (
    (plan.intents.includes("crowd") ||
      plan.intents.includes("study-space")) &&
    campusOptions.length > 0 &&
    !/\b(?:10|[1-9])\/10\b/.test(answer)
  ) {
    return false;
  }

  if (plan.intents.includes("hours") && /\bevents?\b/.test(normalizedAnswer)) {
    return false;
  }

  if (
    plan.intents.includes("academic-calendar") &&
    sources.some((source) => source.id === "academic-calendar") &&
    /(don't|do not) have.{0,35}academic|academic.{0,35}(not available|no data)|can't confirm the exact (?:date|end)/i.test(
      answer,
    )
  ) {
    return false;
  }

  return true;
}

export function buildKnowledgeSources(
  building: AssistantBuildingInput,
  events: AsuEvent[],
  eventsSourceUrl = ASU_EVENTS_SOURCE,
  now = new Date(),
): KnowledgeSource[] {
  const selectedEventSources = buildEventKnowledgeSources(
    events,
    now,
    "asu-event",
  );
  const sources: KnowledgeSource[] = [
    ...buildBuildingKnowledgeSources(building, now, ""),
    buildAcademicKnowledgeSource(now),
  ];

  if (selectedEventSources.length === 0) {
    sources.push({
      id: "asu-events",
      title: `ASU Events at ${building.name}`,
      url: eventsSourceUrl,
      excerpt: `The official ASU Events search lists no events happening now or later today at ${building.name}.`,
    });
  } else {
    sources.push(...selectedEventSources);
  }

  return sources;
}

export function retrieveKnowledge(
  question: string,
  sources: KnowledgeSource[],
  limit = 4,
): KnowledgeSource[] {
  const questionTokens = tokens(question);
  const normalizedQuestion = question.toLowerCase();
  const eventIntent = hasEventIntent(normalizedQuestion);
  const requestedCampus = [
    "downtown phoenix",
    "polytechnic",
    "tempe",
    "west valley",
  ].find((campus) => normalizedQuestion.includes(campus));

  return sources
    .map((source, index) => {
      const sourceTokens = new Set(
        tokens(`${source.title} ${source.excerpt}`),
      );
      let score = questionTokens.reduce(
        (total, token) => total + (sourceTokens.has(token) ? 2 : 0),
        0,
      );
      const sourceText = `${source.title} ${source.excerpt}`.toLowerCase();

      if (requestedCampus) {
        score += sourceText.includes(`${requestedCampus} campus`) ? 12 : -6;
      }

      if (
        (source.id === "official-hours" || source.id.endsWith("-official-hours")) &&
        /\b(open|close|closed|closing|hour|hours|tonight|tomorrow)\b/.test(
          normalizedQuestion,
        )
      ) {
        score += 8;
      }
      if (
        source.id.startsWith("asu-event") &&
        eventIntent
      ) {
        score += 20;
      }
      if (
        source.id.startsWith("campus-event") &&
        eventIntent
      ) {
        score += 20;
      }
      if (
        source.id.startsWith("campus-option") &&
        /\b(study|quiet|space|spot|recommend|suggest|alternative|available)\b/.test(
          normalizedQuestion,
        )
      ) {
        score += 8;
      }
      if (
        (source.id === "location" || source.id.endsWith("-location")) &&
        /\b(where|address|located|location|campus)\b/.test(
          normalizedQuestion,
        ) &&
        !eventIntent
      ) {
        score += 8;
      }
      if (
        source.id === "academic-calendar" &&
        /\b(calendar|class|classes|break|final|finals|holiday|semester|term)\b/.test(
          normalizedQuestion,
        )
      ) {
        score += 8;
      }

      return { source, score, index };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(1, limit))
    .map(({ source }) => source);
}

export function buildRetrievalAnswer(
  sources: KnowledgeSource[],
): string {
  if (sources.length === 0) {
    return "I could not find enough verified ASU information to answer that question.";
  }

  const answer = sources
    .slice(0, 2)
    .map((source) => source.excerpt)
    .join(" ");

  return answer.length > 700 ? `${answer.slice(0, 697).trimEnd()}…` : answer;
}

export function extractResponseText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as {
    output_text?: unknown;
    output?: Array<{
      content?: Array<{ type?: string; text?: unknown }>;
    }>;
    choices?: Array<{
      message?: { content?: unknown };
    }>;
  };

  if (
    typeof response.output_text === "string" &&
    response.output_text.trim()
  ) {
    return response.output_text.trim();
  }

  const chatText = response.choices?.[0]?.message?.content;
  if (typeof chatText === "string" && chatText.trim()) {
    return chatText.trim();
  }

  const text = (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text as string)
    .join("\n")
    .trim();

  return text || null;
}
