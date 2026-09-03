import { describe, expect, it } from "vitest";

import { estimateCrowdLevel, resolveCrowdSignal } from "./crowd-estimate";
import type { WeeklyHours } from "./operating-hours";

const alwaysOpen: WeeklyHours = {
  sunday: [{ open: "00:00", close: "24:00" }],
  monday: [{ open: "00:00", close: "24:00" }],
  tuesday: [{ open: "00:00", close: "24:00" }],
  wednesday: [{ open: "00:00", close: "24:00" }],
  thursday: [{ open: "00:00", close: "24:00" }],
  friday: [{ open: "00:00", close: "24:00" }],
  saturday: [{ open: "00:00", close: "24:00" }],
};

const baseBuilding = {
  baseline_crowd_level: 5,
  weekly_hours: alwaysOpen,
  special_hours: {},
  timezone: "America/Phoenix",
};

describe("estimateCrowdLevel", () => {
  it("uses weekday time windows during an active semester", () => {
    const result = estimateCrowdLevel(
      baseBuilding,
      new Date("2026-09-02T19:00:00Z"),
    );
    expect(result.score).toBe(7);
    expect(result.factors.map((factor) => factor.label)).toContain("Weekday midday");
    expect(result.sourceLabel).toBe("Estimated");
  });

  it("reduces estimates on weekends", () => {
    const result = estimateCrowdLevel(
      baseBuilding,
      new Date("2026-09-05T19:00:00Z"),
    );
    expect(result.score).toBe(4);
  });

  it("reduces estimates during academic breaks", () => {
    const result = estimateCrowdLevel(
      baseBuilding,
      new Date("2026-10-12T19:00:00Z"),
    );
    expect(result.score).toBe(5);
    expect(result.factors.map((factor) => factor.label)).toContain("Fall Break");
  });

  it("raises estimates during finals", () => {
    const result = estimateCrowdLevel(
      baseBuilding,
      new Date("2026-12-09T19:00:00Z"),
    );
    expect(result.score).toBe(10);
    expect(result.factors.map((factor) => factor.label)).toContain("Final exams");
  });

  it("subtracts for a university closure", () => {
    const result = estimateCrowdLevel(
      baseBuilding,
      new Date("2026-09-07T19:00:00Z"),
    );
    expect(result.score).toBe(5);
    expect(result.factors.map((factor) => factor.label)).toContain("Labor Day");
  });

  it("returns no score for a closed building", () => {
    const closed = {
      ...baseBuilding,
      weekly_hours: { ...alwaysOpen, wednesday: [] },
    };
    const result = estimateCrowdLevel(closed, new Date("2026-09-02T19:00:00Z"));
    expect(result.score).toBeNull();
    expect(result.sourceLabel).toBe("Closed");
  });

  it("reduces an estimate shortly before closing", () => {
    const building = {
      ...baseBuilding,
      weekly_hours: {
        ...alwaysOpen,
        wednesday: [{ open: "08:00", close: "17:00" }],
      },
    };
    const result = estimateCrowdLevel(building, new Date("2026-09-02T23:45:00Z"));
    expect(result.score).toBe(4);
    expect(result.factors.map((factor) => factor.label)).toContain(
      "Closing within 30 minutes",
    );
  });
});

describe("resolveCrowdSignal", () => {
  it("returns an estimate when an open building has no recent reports", () => {
    const result = resolveCrowdSignal(
      baseBuilding,
      [],
      new Date("2026-09-02T19:00:00Z"),
    );
    expect(result.score).toBe(7);
    expect(result.isEstimated).toBe(true);
    expect(result.sourceLabel).toBe("Estimated");
  });

  it("lets recent student reports override an estimate", () => {
    const result = resolveCrowdSignal(
      baseBuilding,
      [{ crowd_level: 8 }, { crowd_level: 9 }],
      new Date("2026-09-02T19:00:00Z"),
    );
    expect(result.score).toBe(8.5);
    expect(result.label).toBe("Packed");
    expect(result.isEstimated).toBe(false);
    expect(result.sourceLabel).toBe("Student reports");
  });
});
