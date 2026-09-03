import { describe, expect, it } from "vitest";

import {
  crowdLabel,
  filterReportsWithinLastHour,
  haversineDistanceMeters,
  reportSubmissionSchema,
} from "./study-scout";

describe("haversineDistanceMeters", () => {
  it("returns zero for identical coordinates", () => {
    expect(haversineDistanceMeters(33.4190755, -111.9346142, 33.4190755, -111.9346142)).toBe(0);
  });

  it("calculates the distance between the seeded libraries", () => {
    const distance = haversineDistanceMeters(33.4190755, -111.9346142, 33.42, -111.9306);
    expect(distance).toBeGreaterThan(370);
    expect(distance).toBeLessThan(400);
  });
});

describe("crowdLabel", () => {
  it.each([
    [1, "Quiet"],
    [3, "Quiet"],
    [4, "Moderate"],
    [6, "Moderate"],
    [7, "Busy"],
    [8, "Busy"],
    [9, "Packed"],
    [10, "Packed"],
    [null, "No reports"],
  ] as const)("labels %s as %s", (score, label) => {
    expect(crowdLabel(score)).toBe(label);
  });
});

describe("reportSubmissionSchema", () => {
  const validReport = {
    buildingId: "8db23084-7da6-40f9-96b0-0a4094e1ad39",
    crowdLevel: 5,
    note: "  Seats on level two  ",
    latitude: 33.419,
    longitude: -111.934,
    accuracy: 18.4,
  };

  it("accepts and trims a valid report", () => {
    const parsed = reportSubmissionSchema.parse(validReport);
    expect(parsed.note).toBe("Seats on level two");
  });

  it.each([
    { field: "crowdLevel", value: 11 },
    { field: "crowdLevel", value: 1.5 },
    { field: "latitude", value: 91 },
    { field: "longitude", value: -181 },
    { field: "accuracy", value: -1 },
    { field: "note", value: "x".repeat(281) },
    { field: "buildingId", value: "not-a-uuid" },
  ])("rejects invalid $field", ({ field, value }) => {
    expect(reportSubmissionSchema.safeParse({ ...validReport, [field]: value }).success).toBe(false);
  });
});

describe("filterReportsWithinLastHour", () => {
  const now = new Date("2026-09-02T20:00:00.000Z");
  const reports = [
    { id: "recent", created_at: "2026-09-02T19:59:00.000Z" },
    { id: "boundary", created_at: "2026-09-02T19:00:00.000Z" },
    { id: "old", created_at: "2026-09-02T18:59:59.999Z" },
    { id: "future", created_at: "2026-09-02T20:00:00.001Z" },
    { id: "invalid", created_at: "not-a-date" },
  ];

  it("keeps only timestamps from the previous hour", () => {
    expect(filterReportsWithinLastHour(reports, now).map((report) => report.id)).toEqual([
      "recent",
      "boundary",
    ]);
  });
});
