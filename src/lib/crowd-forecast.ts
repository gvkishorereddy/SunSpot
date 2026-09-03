import {
  ASU_TIME_ZONE,
  dateKeyInTimeZone,
  type AsuEvent,
} from "./asu-events";
import {
  estimateCrowdLevel,
  resolveCrowdSignal,
  type CrowdBuildingInput,
  type CrowdSignal,
} from "./crowd-estimate";
import { evaluateBuildingHours } from "./operating-hours";
import { crowdLabel } from "./study-scout";

const HOUR_MS = 60 * 60 * 1000;

export type CrowdForecastPoint = {
  at: string;
  timeLabel: string;
  score: number | null;
  label: string;
  status: "live" | "forecast" | "closed" | "unavailable";
  eventCount: number;
  explanation: string;
};

function clampScore(score: number) {
  return Math.max(1, Math.min(10, Math.round(score)));
}

function eventsDuringHour(events: AsuEvent[], start: Date) {
  const windowStart = start.getTime();
  const windowEnd = windowStart + HOUR_MS;

  return events.filter((event) => {
    const eventStart = Date.parse(event.startsAt);
    const eventEnd = Date.parse(event.endsAt);
    return (
      Number.isFinite(eventStart) &&
      Number.isFinite(eventEnd) &&
      eventStart < windowEnd &&
      eventEnd > windowStart
    );
  }).length;
}

function addEventEffect(signal: CrowdSignal, eventCount: number): CrowdSignal {
  if (signal.score === null || !signal.isEstimated || eventCount === 0) {
    return signal;
  }

  const eventDelta = Math.min(2, eventCount);
  const score = clampScore(signal.score + eventDelta);

  return {
    ...signal,
    score,
    label: crowdLabel(score),
    explanation: `${signal.explanation} ${
      eventCount === 1
        ? "One ASU event overlaps this hour."
        : `${eventCount} ASU events overlap this hour.`
    }`,
    factors: [
      ...signal.factors,
      {
        label: `${eventCount} ${eventCount === 1 ? "event" : "events"}`,
        delta: eventDelta,
      },
    ],
  };
}

function pointFromSignal(
  at: Date,
  signal: CrowdSignal,
  eventCount: number,
  timeLabel: string,
): CrowdForecastPoint {
  const status =
    signal.sourceLabel === "Student reports"
      ? "live"
      : signal.sourceLabel === "Closed"
        ? "closed"
        : signal.sourceLabel === "Unavailable"
          ? "unavailable"
          : "forecast";

  return {
    at: at.toISOString(),
    timeLabel,
    score: signal.score,
    label: signal.label,
    status,
    eventCount,
    explanation: signal.explanation,
  };
}

function formatHour(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    timeZone,
  }).format(date);
}

export function buildCrowdForecast(
  building: CrowdBuildingInput,
  events: AsuEvent[],
  reports: Array<{ crowd_level: number }>,
  now = new Date(),
): CrowdForecastPoint[] {
  const timeZone = building.timezone || ASU_TIME_ZONE;
  const today = dateKeyInTimeZone(now, timeZone);
  if (!today) return [];

  const currentHours = evaluateBuildingHours(building, now);
  const currentEvents = eventsDuringHour(events, now);
  // "Now" must match the primary crowd card exactly. Event data influences
  // future projections, but it must not create two current crowd values.
  const currentSignal = resolveCrowdSignal(
    building,
    reports,
    now,
    currentHours,
  );
  const points = [
    pointFromSignal(now, currentSignal, currentEvents, "Now"),
  ];

  const minutesToNextHour = 60 - (currentHours.localMinute % 60);
  let cursor = new Date(now.getTime() + minutesToNextHour * 60_000);

  while (
    dateKeyInTimeZone(cursor, timeZone) === today &&
    points.length < 25
  ) {
    const hours = evaluateBuildingHours(building, cursor);
    const eventCount = eventsDuringHour(events, cursor);
    const signal = addEventEffect(
      estimateCrowdLevel(building, cursor, hours),
      eventCount,
    );
    points.push(
      pointFromSignal(
        cursor,
        signal,
        eventCount,
        formatHour(cursor, timeZone),
      ),
    );
    cursor = new Date(cursor.getTime() + HOUR_MS);
  }

  return points;
}
