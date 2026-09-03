import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  filterReportsWithinLastHour,
  haversineDistanceMeters,
  MAX_ACCURACY_ALLOWANCE_M,
  MAX_LOCATION_ACCURACY_M,
  oneHourAgoIso,
  reportSubmissionSchema,
  summarizeReports,
  type RecentReport,
} from "@/lib/study-scout";
import { evaluateBuildingHours } from "@/lib/operating-hours";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const buildingIdSchema = z.uuid();

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export async function GET(request: NextRequest) {
  const buildingId = request.nextUrl.searchParams.get("buildingId");
  const parsedBuildingId = buildingIdSchema.safeParse(buildingId);

  if (!parsedBuildingId.success) {
    return errorResponse(
      "invalid_building",
      "Choose a valid study location.",
      400,
    );
  }

  try {
    const now = new Date();
    const { data, error } = await getSupabaseAdmin()
      .from("crowd_reports")
      .select(
        "id, crowd_level, note, distance_m, location_accuracy_m, created_at",
      )
      .eq("building_id", parsedBuildingId.data)
      .gte("created_at", oneHourAgoIso(now))
      .order("created_at", { ascending: false });

    if (error) throw error;

    const reports = filterReportsWithinLastHour(
      (data ?? []) as RecentReport[],
      now,
    );
    const summary = summarizeReports(reports);

    return NextResponse.json(
      { reports, ...summary },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    if (process.env.NODE_ENV === "development") {
      return NextResponse.json(
        { reports: [], count: 0, averageCrowdLevel: null, demo: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return errorResponse(
      "server_error",
      "We could not load recent reports. Please try again.",
      500,
    );
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_request", "Send a valid JSON body.", 400);
  }

  const parsed = reportSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "invalid_request",
      "Check the building, crowd level, note, and location values.",
      400,
    );
  }

  const {
    buildingId,
    crowdLevel,
    note,
    latitude,
    longitude,
    accuracy,
  } = parsed.data;

  if (accuracy > MAX_LOCATION_ACCURACY_M) {
    return errorResponse(
      "inaccurate_location",
      "Location accuracy must be 200 meters or better. Try again outdoors or near a window.",
      422,
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: building, error: buildingError } = await supabase
      .from("buildings")
      .select(
        "id, latitude, longitude, verification_radius_m, weekly_hours, special_hours, timezone",
      )
      .eq("id", buildingId)
      .eq("active", true)
      .maybeSingle();

    if (buildingError) throw buildingError;
    if (!building) {
      return errorResponse(
        "invalid_building",
        "That study location is not available.",
        404,
      );
    }

    const operatingStatus = evaluateBuildingHours(building);
    if (!operatingStatus.isOpen) {
      return errorResponse(
        "building_closed",
        operatingStatus.status === "unknown"
          ? "Reports are paused until this building's hours can be verified."
          : "Crowd reports are only accepted while this building is open.",
        409,
      );
    }

    const distance = haversineDistanceMeters(
      latitude,
      longitude,
      building.latitude,
      building.longitude,
    );
    const allowedDistance =
      building.verification_radius_m +
      Math.min(accuracy, MAX_ACCURACY_ALLOWANCE_M);

    if (distance > allowedDistance) {
      return errorResponse(
        "too_far",
        "You appear to be too far from this building to submit a report.",
        403,
      );
    }

    const { data: report, error: insertError } = await supabase
      .from("crowd_reports")
      .insert({
        building_id: buildingId,
        crowd_level: crowdLevel,
        note: note || null,
        distance_m: Math.round(distance),
        location_accuracy_m: Math.round(accuracy),
      })
      .select(
        "id, crowd_level, note, distance_m, location_accuracy_m, created_at",
      )
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({ report }, { status: 201 });
  } catch {
    return errorResponse(
      "server_error",
      "We could not submit your report. Please try again.",
      500,
    );
  }
}
