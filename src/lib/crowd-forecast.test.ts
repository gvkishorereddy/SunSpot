import { describe, expect, it } from "vitest";

import type { AsuEvent } from "./asu-events";
import { buildCrowdForecast } from "./crowd-forecast";
import type { WeeklyHours } from "./operating-hours";

const dailyHours: WeeklyHours = {
  sunday: [{ open: "08:00", close: "22:00" }],
  monday: [{ open: "08:00", close: "22:00" }],
  tuesday: [{ open: "08:00", close: "22:00" }],
  wednesday: [{ open: "08:00", close: "22:00" }],
  thursday: [{ open: "08:00", close: "22:00" }],
  friday: [{ open: "08:00", close: "22:00" }],
  saturday: [{ open: "08:00", close: "22:00" }],
};

const building = {
  baseline_crowd_level: 5,
  weekly_hours: dailyHours,
  special_hours: {},
  timezone: "America/Phoenix",
};

const now = new Date("2026-09-03T17:15:00.000Z");

describe("buildCrowdForecast", () => {
  it("builds hourly points from now through the rest of the Arizona day", () => {
    const forecast = buildCrowdForecast(building, [], [], now);

    expect(forecast[0].timeLabel).toBe("Now");
    expect(forecast[1].timeLabel).toBe("11 AM");
    expect(forecast.at(-1)?.timeLabel).toBe("11 PM");
  });

  it("uses recent reports for now but forecasts future hours", () => {
    const forecast = buildCrowdForecast(
      building,
      [],
      [{ crowd_level: 8 }, { crowd_level: 9 }],
      now,
    );

    expect(forecast[0]).toMatchObject({
      score: 8.5,
      label: "Packed",
      status: "live",
    });
    expect(forecast[1].status).toBe("forecast");
  });

  it("raises an estimated hour when an ASU event overlaps it", () => {
    const event: AsuEvent = {
      id: "event-1",
      title: "Student event",
      url: "https://example.com/event-1",
      startsAt: "2026-09-03T18:15:00.000Z",
      endsAt: "2026-09-03T19:15:00.000Z",
      location: "Test building",
    };
    const withoutEvent = buildCrowdForecast(building, [], [], now);
    const withEvent = buildCrowdForecast(building, [event], [], now);

    expect(withEvent[1].eventCount).toBe(1);
    expect(withEvent[1].score).toBe((withoutEvent[1].score ?? 0) + 1);
    expect(withEvent[1].explanation).toContain("ASU event");
  });

  it("keeps the Now value identical when an event overlaps the current hour", () => {
    const currentEvent: AsuEvent = {
      id: "event-now",
      title: "Current student event",
      url: "https://example.com/event-now",
      startsAt: "2026-09-03T17:30:00.000Z",
      endsAt: "2026-09-03T18:30:00.000Z",
      location: "Test building",
    };
    const withoutEvent = buildCrowdForecast(building, [], [], now);
    const withEvent = buildCrowdForecast(building, [currentEvent], [], now);

    expect(withEvent[0].eventCount).toBe(1);
    expect(withEvent[0].score).toBe(withoutEvent[0].score);
  });

  it("marks hours after closing without a crowd score", () => {
    const forecast = buildCrowdForecast(building, [], [], now);
    const tenPm = forecast.find((point) => point.timeLabel === "10 PM");

    expect(tenPm).toMatchObject({
      score: null,
      label: "Closed",
      status: "closed",
    });
  });
});
