import { NextRequest, NextResponse } from "next/server";

import { dateKeyInTimeZone } from "@/lib/asu-events";
import {
  buildAsuEventsUrl,
  eventMatchesBuilding,
  isSupportedEventBuilding,
  parseAsuEventCards,
} from "@/lib/asu-events-source";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const buildingSlug = request.nextUrl.searchParams.get("buildingSlug")?.trim();

  if (!buildingSlug || !isSupportedEventBuilding(buildingSlug)) {
    return NextResponse.json(
      { code: "invalid_building", message: "Choose a supported ASU building." },
      { status: 400 },
    );
  }

  const now = new Date();
  const sourceUrl = buildAsuEventsUrl(buildingSlug, now);
  if (!sourceUrl) {
    return NextResponse.json(
      { code: "invalid_building", message: "Choose a supported ASU building." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "SunSpot-ASU-events/1.0",
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) throw new Error(`ASU Events returned ${response.status}`);

    const html = await response.text();
    const events = Array.from(
      new Map(
        parseAsuEventCards(html)
          .filter((event) => eventMatchesBuilding(event, buildingSlug))
          .map((event) => [event.id, event]),
      ).values(),
    ).sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));

    return NextResponse.json(
      {
        events,
        date: dateKeyInTimeZone(now),
        fetchedAt: now.toISOString(),
        sourceUrl: sourceUrl.toString(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        code: "source_unavailable",
        message: "ASU Events is temporarily unavailable. Please try again.",
      },
      { status: 502 },
    );
  }
}
