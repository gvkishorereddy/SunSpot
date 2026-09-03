import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("buildings")
      .select(
        "id, slug, name, campus, address, latitude, longitude, verification_radius_m",
      )
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) throw error;

    return NextResponse.json(
      { buildings: data ?? [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        code: "server_error",
        message: "We could not load study locations. Please try again.",
      },
      { status: 500 },
    );
  }
}
