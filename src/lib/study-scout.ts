import { z } from "zod";

export const ONE_HOUR_MS = 60 * 60 * 1000;
export const MAX_LOCATION_ACCURACY_M = 200;
export const MAX_ACCURACY_ALLOWANCE_M = 100;

export type RecentReport = {
  id: string;
  crowd_level: number;
  note: string | null;
  distance_m: number;
  location_accuracy_m: number;
  created_at: string;
};

export const reportSubmissionSchema = z.object({
  buildingId: z.uuid(),
  crowdLevel: z.number().int().min(1).max(10),
  note: z.string().trim().max(280).optional().default(""),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().nonnegative(),
});

export function crowdLabel(score: number | null): string {
  if (score === null) return "No reports";
  if (score <= 3) return "Quiet";
  if (score <= 6) return "Moderate";
  if (score <= 8) return "Busy";
  return "Packed";
}

export function haversineDistanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const earthRadiusM = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const latitudeARadians = toRadians(latitudeA);
  const latitudeBRadians = toRadians(latitudeB);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeARadians) *
      Math.cos(latitudeBRadians) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusM * Math.asin(Math.sqrt(haversine));
}

export function filterReportsWithinLastHour<T extends { created_at: string }>(
  reports: T[],
  now = new Date(),
): T[] {
  const newestAllowed = now.getTime();
  const oldestAllowed = newestAllowed - ONE_HOUR_MS;

  return reports.filter((report) => {
    const createdAt = Date.parse(report.created_at);
    return (
      Number.isFinite(createdAt) &&
      createdAt >= oldestAllowed &&
      createdAt <= newestAllowed
    );
  });
}

export function summarizeReports(reports: Array<{ crowd_level: number }>) {
  const count = reports.length;
  const averageCrowdLevel = count
    ? Number(
        (
          reports.reduce((total, report) => total + report.crowd_level, 0) /
          count
        ).toFixed(1),
      )
    : null;

  return { count, averageCrowdLevel };
}

export function oneHourAgoIso(now = new Date()): string {
  return new Date(now.getTime() - ONE_HOUR_MS).toISOString();
}
