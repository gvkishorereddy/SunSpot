import { NextResponse } from "next/server";

import { DEMO_BUILDINGS } from "@/data/demo-buildings";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("buildings")
      .select(
        "id, slug, name, campus, address, latitude, longitude, verification_radius_m, category, weekly_hours, special_hours, official_hours_url, location_source_url, hours_verified_on, baseline_crowd_level, timezone",
      )
      .eq("active", true)
      .order("campus", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;

    return NextResponse.json(
      { buildings: data ?? [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    if (process.env.NODE_ENV === "development") {
      return NextResponse.json(
        { buildings: DEMO_BUILDINGS, demo: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        code: "server_error",
        message: "We could not load study locations. Please try again.",
      },
      { status: 500 },
    );
  }
}
