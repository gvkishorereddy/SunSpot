import { describe, expect, it } from "vitest";

import {
  type AsuEvent,
  dateKeyInTimeZone,
  groupTodayEvents,
} from "./asu-events";

function event(
  id: string,
  startsAt: string,
  endsAt: string,
): AsuEvent {
  return {
    id,
    title: id,
    url: `https://asuevents.asu.edu/event/${id}`,
    startsAt,
    endsAt,
    location: "Hayden Library, Tempe campus",
  };
}

describe("dateKeyInTimeZone", () => {
  it("uses Arizona time near the UTC date boundary", () => {
    expect(dateKeyInTimeZone(new Date("2026-09-03T05:30:00.000Z"))).toBe(
      "2026-09-02",
    );
  });
});

describe("groupTodayEvents", () => {
  it("separates active events from later events and removes ended events", () => {
    const events = [
      event("ended", "2026-09-02T15:00:00.000Z", "2026-09-02T16:00:00.000Z"),
      event("active", "2026-09-02T16:30:00.000Z", "2026-09-02T18:00:00.000Z"),
      event("later", "2026-09-02T19:00:00.000Z", "2026-09-02T20:00:00.000Z"),
    ];

    expect(
      groupTodayEvents(events, new Date("2026-09-02T17:00:00.000Z")),
    ).toEqual({
      happeningNow: [events[1]],
      laterToday: [events[2]],
    });
  });

  it("treats the exact end time as ended", () => {
    const endingNow = event(
      "ending-now",
      "2026-09-02T16:00:00.000Z",
      "2026-09-02T17:00:00.000Z",
    );

    expect(
      groupTodayEvents([endingNow], new Date("2026-09-02T17:00:00.000Z")),
    ).toEqual({ happeningNow: [], laterToday: [] });
  });

  it("does not include an event from another Arizona calendar day", () => {
    const tomorrow = event(
      "tomorrow",
      "2026-09-03T16:00:00.000Z",
      "2026-09-03T17:00:00.000Z",
    );

    expect(
      groupTodayEvents([tomorrow], new Date("2026-09-02T17:00:00.000Z")),
    ).toEqual({ happeningNow: [], laterToday: [] });
  });
});
