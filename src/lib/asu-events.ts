export const ASU_EVENTS_SOURCE = "https://asuevents.asu.edu/";
export const ASU_TIME_ZONE = "America/Phoenix";

export type AsuEvent = {
  id: string;
  title: string;
  url: string;
  startsAt: string;
  endsAt: string;
  location: string;
};

export type TodayEventGroups = {
  happeningNow: AsuEvent[];
  laterToday: AsuEvent[];
};

export function dateKeyInTimeZone(
  date: Date,
  timeZone = ASU_TIME_ZONE,
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${value.year}-${value.month}-${value.day}`;
}

export function groupTodayEvents(
  events: AsuEvent[],
  now = new Date(),
): TodayEventGroups {
  const today = dateKeyInTimeZone(now);
  const nowMs = now.getTime();
  const happeningNow: AsuEvent[] = [];
  const laterToday: AsuEvent[] = [];

  for (const event of events) {
    const startsAt = Date.parse(event.startsAt);
    const endsAt = Date.parse(event.endsAt);

    if (
      !Number.isFinite(startsAt) ||
      !Number.isFinite(endsAt) ||
      dateKeyInTimeZone(new Date(startsAt)) !== today ||
      endsAt <= nowMs
    ) {
      continue;
    }

    if (startsAt <= nowMs) happeningNow.push(event);
    else laterToday.push(event);
  }

  const byStartTime = (left: AsuEvent, right: AsuEvent) =>
    Date.parse(left.startsAt) - Date.parse(right.startsAt);

  return {
    happeningNow: happeningNow.sort(byStartTime),
    laterToday: laterToday.sort(byStartTime),
  };
}

export function formatAsuEventTime(event: AsuEvent): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: ASU_TIME_ZONE,
  });

  return `${formatter.format(new Date(event.startsAt))}–${formatter.format(new Date(event.endsAt))}`;
}
