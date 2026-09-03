import { describe, expect, it } from "vitest";

import {
  evaluateBuildingHours,
  type SpecialHours,
  type WeeklyHours,
} from "./operating-hours";

const daily: WeeklyHours = {
  sunday: [{ open: "08:00", close: "20:00" }],
  monday: [{ open: "08:00", close: "20:00" }],
  tuesday: [{ open: "08:00", close: "20:00" }],
  wednesday: [{ open: "08:00", close: "20:00" }],
  thursday: [{ open: "08:00", close: "20:00" }],
  friday: [{ open: "08:00", close: "20:00" }],
  saturday: [{ open: "08:00", close: "20:00" }],
};

function building(weekly_hours: unknown, special_hours: unknown = {}) {
  return { weekly_hours, special_hours, timezone: "America/Phoenix" };
}

describe("evaluateBuildingHours", () => {
  it("handles an ordinary weekday opening", () => {
    const result = evaluateBuildingHours(
      building(daily),
      new Date("2026-09-02T18:00:00Z"),
    );
    expect(result.isOpen).toBe(true);
    expect(result.statusDetail).toBe("Open until 8 PM");
    expect(result.todayHours).toBe("8 AM–8 PM");
  });

  it("uses different weekend hours", () => {
    const weekly = { ...daily, saturday: [{ open: "10:00", close: "14:00" }] };
    const result = evaluateBuildingHours(
      building(weekly),
      new Date("2026-09-05T17:30:00Z"),
    );
    expect(result.isOpen).toBe(true);
    expect(result.todayHours).toBe("10 AM–2 PM");
    expect(result.isWeekend).toBe(true);
  });

  it("supports a 24-hour schedule", () => {
    const alwaysOpen = Object.fromEntries(
      Object.keys(daily).map((day) => [day, [{ open: "00:00", close: "24:00" }]]),
    );
    const result = evaluateBuildingHours(
      building(alwaysOpen),
      new Date("2026-09-03T06:15:00Z"),
    );
    expect(result.isOpen).toBe(true);
    expect(result.todayHours).toBe("Open 24 hours");
  });

  it("supports hours that cross midnight", () => {
    const weekly = {
      ...daily,
      friday: [{ open: "18:00", close: "02:00" }],
      saturday: [],
    };
    const result = evaluateBuildingHours(
      building(weekly),
      new Date("2026-09-05T07:30:00Z"),
    );
    expect(result.isOpen).toBe(true);
    expect(result.statusDetail).toBe("Open until 2 AM");
    expect(result.minutesUntilClose).toBe(90);
  });

  it("lets a special closure override weekly hours", () => {
    const special: SpecialHours = { "2026-09-07": [] };
    const result = evaluateBuildingHours(
      building(daily, special),
      new Date("2026-09-07T18:00:00Z"),
    );
    expect(result.isOpen).toBe(false);
    expect(result.todayHours).toBe("Closed");
    expect(result.statusDetail).toContain("Opens tomorrow");
  });

  it("lets special hours replace an ordinary closure", () => {
    const weekly = { ...daily, monday: [] };
    const special: SpecialHours = {
      "2026-09-07": [{ open: "09:00", close: "17:00" }],
    };
    const result = evaluateBuildingHours(
      building(weekly, special),
      new Date("2026-09-07T18:00:00Z"),
    );
    expect(result.isOpen).toBe(true);
    expect(result.todayHours).toBe("9 AM–5 PM");
  });

  it("returns unknown for missing or malformed schedules", () => {
    expect(
      evaluateBuildingHours(building(null), new Date("2026-09-02T18:00:00Z"))
        .status,
    ).toBe("unknown");
    expect(
      evaluateBuildingHours(
        building({ ...daily, monday: [{ open: "soon", close: "later" }] }),
        new Date("2026-09-02T18:00:00Z"),
      ).status,
    ).toBe("unknown");
  });
});
