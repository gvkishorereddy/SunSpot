export const ASU_TIME_ZONE = "America/Phoenix";

export const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export type HoursInterval = {
  open: string;
  close: string;
};

export type WeeklyHours = Partial<Record<Weekday, HoursInterval[]>>;
export type SpecialHours = Record<string, HoursInterval[]>;

export type BuildingHoursInput = {
  weekly_hours: unknown;
  special_hours: unknown;
  timezone?: string | null;
};

export type OperatingStatus = {
  status: "open" | "closed" | "unknown";
  isOpen: boolean;
  todayHours: string;
  statusDetail: string;
  minutesUntilClose: number | null;
  nextOpening: string | null;
  dateKey: string;
  localMinute: number;
  isWeekend: boolean;
};

type ZonedParts = {
  dateKey: string;
  weekday: Weekday;
  hour: number;
  minute: number;
};

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isHoursInterval(value: unknown): value is HoursInterval {
  if (!isPlainObject(value)) return false;
  if (typeof value.open !== "string" || typeof value.close !== "string") {
    return false;
  }
  if (!TIME_PATTERN.test(value.open) || !TIME_PATTERN.test(value.close)) {
    return false;
  }
  return value.open !== "24:00";
}

function parseWeeklyHours(value: unknown): WeeklyHours | null {
  if (!isPlainObject(value)) return null;
  const parsed: WeeklyHours = {};

  for (const weekday of WEEKDAYS) {
    const intervals = value[weekday];
    if (!Array.isArray(intervals) || !intervals.every(isHoursInterval)) {
      return null;
    }
    parsed[weekday] = intervals;
  }

  return parsed;
}

function parseSpecialHours(value: unknown): SpecialHours | null {
  if (!isPlainObject(value)) return null;
  const parsed: SpecialHours = {};

  for (const [dateKey, intervals] of Object.entries(value)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
    if (!Array.isArray(intervals) || !intervals.every(isHoursInterval)) {
      return null;
    }
    parsed[dateKey] = intervals;
  }

  return parsed;
}

function timeToMinutes(value: string) {
  if (value === "24:00") return 24 * 60;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function displayTime(value: string) {
  const totalMinutes = timeToMinutes(value);
  if (totalMinutes === 24 * 60) return "midnight";
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const hour12 = hour % 12 || 12;
  const suffix = hour < 12 ? "AM" : "PM";
  return `${hour12}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${suffix}`;
}

function getZonedParts(date: Date, timeZone: string): ZonedParts | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
    const weekday = values.weekday?.toLowerCase() as Weekday;
    if (!WEEKDAYS.includes(weekday)) return null;

    return {
      dateKey: `${values.year}-${values.month}-${values.day}`,
      weekday,
      hour: Number(values.hour),
      minute: Number(values.minute),
    };
  } catch {
    return null;
  }
}

export function getArizonaDateKey(date: Date) {
  return getZonedParts(date, ASU_TIME_ZONE)?.dateKey ?? "";
}

function scheduleForDate(
  date: Date,
  weekly: WeeklyHours,
  special: SpecialHours,
  timeZone: string,
) {
  const parts = getZonedParts(date, timeZone);
  if (!parts) return null;
  const intervals = Object.hasOwn(special, parts.dateKey)
    ? special[parts.dateKey]
    : weekly[parts.weekday];
  return intervals ? { parts, intervals } : null;
}

function formatSchedule(intervals: HoursInterval[]) {
  if (intervals.length === 0) return "Closed";
  if (
    intervals.length === 1 &&
    intervals[0].open === "00:00" &&
    intervals[0].close === "24:00"
  ) {
    return "Open 24 hours";
  }
  return intervals
    .map((interval) => `${displayTime(interval.open)}–${displayTime(interval.close)}`)
    .join(", ");
}

function activeInterval(
  today: HoursInterval[],
  yesterday: HoursInterval[],
  localMinute: number,
) {
  for (const interval of today) {
    const opens = timeToMinutes(interval.open);
    const closes = timeToMinutes(interval.close);
    if (closes > opens && localMinute >= opens && localMinute < closes) {
      return { interval, minutesUntilClose: closes - localMinute, closesTomorrow: false };
    }
    if (closes <= opens && localMinute >= opens) {
      return {
        interval,
        minutesUntilClose: 24 * 60 - localMinute + closes,
        closesTomorrow: true,
      };
    }
  }

  for (const interval of yesterday) {
    const opens = timeToMinutes(interval.open);
    const closes = timeToMinutes(interval.close);
    if (closes <= opens && localMinute < closes) {
      return {
        interval,
        minutesUntilClose: closes - localMinute,
        closesTomorrow: false,
      };
    }
  }

  return null;
}

function nextOpeningLabel(
  now: Date,
  weekly: WeeklyHours,
  special: SpecialHours,
  timeZone: string,
  localMinute: number,
) {
  for (let offset = 0; offset <= 8; offset += 1) {
    const candidateDate = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const schedule = scheduleForDate(candidateDate, weekly, special, timeZone);
    if (!schedule) return null;

    for (const interval of schedule.intervals) {
      const opens = timeToMinutes(interval.open);
      if (offset === 0 && opens <= localMinute) continue;
      const dayLabel =
        offset === 0
          ? "today"
          : offset === 1
            ? "tomorrow"
            : schedule.parts.weekday.charAt(0).toUpperCase() +
              schedule.parts.weekday.slice(1);
      return `${dayLabel} at ${displayTime(interval.open)}`;
    }
  }
  return null;
}

export function evaluateBuildingHours(
  building: BuildingHoursInput,
  now = new Date(),
): OperatingStatus {
  const timeZone = building.timezone || ASU_TIME_ZONE;
  const weekly = parseWeeklyHours(building.weekly_hours);
  const special = parseSpecialHours(building.special_hours);
  const current = getZonedParts(now, timeZone);

  if (!weekly || !special || !current) {
    return {
      status: "unknown",
      isOpen: false,
      todayHours: "Hours unavailable",
      statusDetail: "Check the official hours before visiting",
      minutesUntilClose: null,
      nextOpening: null,
      dateKey: current?.dateKey ?? "",
      localMinute: current ? current.hour * 60 + current.minute : 0,
      isWeekend: current
        ? current.weekday === "saturday" || current.weekday === "sunday"
        : false,
    };
  }

  const today = scheduleForDate(now, weekly, special, timeZone);
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterday = scheduleForDate(yesterdayDate, weekly, special, timeZone);
  if (!today || !yesterday) {
    return {
      status: "unknown",
      isOpen: false,
      todayHours: "Hours unavailable",
      statusDetail: "Check the official hours before visiting",
      minutesUntilClose: null,
      nextOpening: null,
      dateKey: current.dateKey,
      localMinute: current.hour * 60 + current.minute,
      isWeekend: current.weekday === "saturday" || current.weekday === "sunday",
    };
  }

  const localMinute = current.hour * 60 + current.minute;
  const active = activeInterval(today.intervals, yesterday.intervals, localMinute);
  const nextOpening = active
    ? null
    : nextOpeningLabel(now, weekly, special, timeZone, localMinute);
  const isWeekend = current.weekday === "saturday" || current.weekday === "sunday";

  if (active) {
    const close = displayTime(active.interval.close);
    return {
      status: "open",
      isOpen: true,
      todayHours: formatSchedule(today.intervals),
      statusDetail: `Open until ${close}${active.closesTomorrow ? " tomorrow" : ""}`,
      minutesUntilClose: active.minutesUntilClose,
      nextOpening: null,
      dateKey: current.dateKey,
      localMinute,
      isWeekend,
    };
  }

  return {
    status: "closed",
    isOpen: false,
    todayHours: formatSchedule(today.intervals),
    statusDetail: nextOpening ? `Closed · Opens ${nextOpening}` : "Closed",
    minutesUntilClose: null,
    nextOpening,
    dateKey: current.dateKey,
    localMinute,
    isWeekend,
  };
}
