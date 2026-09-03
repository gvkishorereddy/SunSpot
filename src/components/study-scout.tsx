"use client";

import {
  AlertCircle,
  Building2,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  ExternalLink,
  Info,
  LocateFixed,
  MapPin,
  RefreshCw,
  Send,
  Sparkles,
  SunMedium,
  TrendingUp,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ASU_ACADEMIC_CALENDAR_SOURCE,
  ASU_CALENDAR_VERIFIED_ON,
} from "@/data/asu-academic-calendar";
import {
  ASU_EVENTS_SOURCE,
  type AsuEvent,
  formatAsuEventTime,
  groupTodayEvents,
} from "@/lib/asu-events";
import {
  buildCrowdForecast,
  type CrowdForecastPoint,
} from "@/lib/crowd-forecast";
import { resolveCrowdSignal } from "@/lib/crowd-estimate";
import { evaluateBuildingHours } from "@/lib/operating-hours";
import { crowdLabel, type RecentReport } from "@/lib/study-scout";

type Building = {
  id: string;
  slug: string;
  name: string;
  campus: string;
  address: string | null;
  category: string;
  weekly_hours: unknown;
  special_hours: unknown;
  official_hours_url: string | null;
  location_source_url: string | null;
  hours_verified_on: string | null;
  baseline_crowd_level: number;
  timezone: string;
};

type Coordinates = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

type ReportsPayload = {
  reports: RecentReport[];
  count: number;
  averageCrowdLevel: number | null;
};

type EventsPayload = {
  events: AsuEvent[];
  fetchedAt: string;
  sourceUrl: string;
};

type AskPayload = {
  answer: string;
  mode: "ai" | "retrieval";
  notice: string | null;
  sources: Array<{
    id: string;
    title: string;
    url: string;
    excerpt: string;
  }>;
};

type LocationState =
  | "idle"
  | "verifying"
  | "verified"
  | "denied"
  | "inaccurate"
  | "unavailable";

type SubmitState =
  | "idle"
  | "submitting"
  | "success"
  | "too_far"
  | "inaccurate"
  | "closed"
  | "error";

const crowdLevels = Array.from({ length: 10 }, (_, index) => index + 1);

function relativeTime(isoDate: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(isoDate).getTime()) / 60_000),
  );
  if (minutes < 1) return "Just now";
  if (minutes === 1) return "1 minute ago";
  return `${minutes} minutes ago`;
}

function reportTone(score: number | null) {
  if (score === null) return "bg-stone-100 text-stone-600";
  if (score <= 3) return "bg-emerald-50 text-emerald-700";
  if (score <= 6) return "bg-amber-50 text-amber-800";
  if (score <= 8) return "bg-orange-50 text-orange-800";
  return "bg-rose-50 text-rose-800";
}

function hoursTone(status: "open" | "closed" | "unknown") {
  if (status === "open") return "bg-emerald-50 text-emerald-700 ring-emerald-600/15";
  if (status === "closed") return "bg-stone-100 text-stone-700 ring-stone-500/15";
  return "bg-amber-50 text-amber-800 ring-amber-600/15";
}

function forecastBarTone(point: CrowdForecastPoint) {
  if (point.status === "live") return "bg-sky-500";
  if (point.score === null) return "bg-stone-300";
  if (point.score <= 3) return "bg-emerald-500";
  if (point.score <= 6) return "bg-amber-400";
  if (point.score <= 8) return "bg-orange-500";
  return "bg-rose-600";
}

function locationMessage(state: LocationState) {
  switch (state) {
    case "verifying":
      return "Checking your approximate location…";
    case "verified":
      return "Location verified. You can submit this report.";
    case "denied":
      return "Location access was denied. Enable it in your browser settings, then try again.";
    case "inaccurate":
      return "Your location is not accurate enough. Try again outdoors or near a window.";
    case "unavailable":
      return "We could not get your location. Check your connection and try again.";
    default:
      return "Verify that you’re near the selected building before submitting.";
  }
}

function formatVerifiedDate(value: string | null) {
  if (!value) return "Verification date unavailable";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function EventRow({ event, happeningNow }: { event: AsuEvent; happeningNow: boolean }) {
  return (
    <li className="min-w-0 rounded-2xl border border-stone-200 p-3.5 sm:p-4">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl ${
            happeningNow ? "bg-emerald-100 text-emerald-700" : "bg-gold/20 text-gold-dark"
          }`}
        >
          <CalendarClock aria-hidden="true" size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <a
              className="font-extrabold text-ink hover:text-maroon hover:underline"
              href={event.url}
              target="_blank"
              rel="noreferrer"
            >
              {event.title}
            </a>
            {happeningNow && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-700">
                Happening now
              </span>
            )}
          </div>
          <p className="mt-1 text-sm font-bold text-maroon">{formatAsuEventTime(event)} MST</p>
          <p className="mt-1 text-sm leading-5 text-stone-500">{event.location}</p>
        </div>
        <ExternalLink aria-hidden="true" className="mt-1 hidden shrink-0 text-stone-300 sm:block" size={15} />
      </div>
    </li>
  );
}

function FormattedAnswer({ answer }: { answer: string }) {
  const displayAnswer = answer.replace(/^\s*\*\s+/gm, "• ");

  return (
    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-700">
      {displayAnswer.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={index} className="font-extrabold text-ink">
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        ),
      )}
    </p>
  );
}

export function StudyScout() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState("");
  const [campusFilter, setCampusFilter] = useState("All campuses");
  const [buildingsLoading, setBuildingsLoading] = useState(true);
  const [buildingsError, setBuildingsError] = useState(false);
  const [reports, setReports] = useState<RecentReport[]>([]);
  const [reportCount, setReportCount] = useState(0);
  const [averageCrowdLevel, setAverageCrowdLevel] = useState<number | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState(false);
  const [events, setEvents] = useState<AsuEvent[]>([]);
  const [eventsSourceUrl, setEventsSourceUrl] = useState(ASU_EVENTS_SOURCE);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState(false);
  const [crowdLevel, setCrowdLevel] = useState(5);
  const [note, setNote] = useState("");
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locationState, setLocationState] = useState<LocationState>("idle");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [question, setQuestion] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState(false);
  const [askResult, setAskResult] = useState<AskPayload | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  const campuses = useMemo(
    () => ["All campuses", ...Array.from(new Set(buildings.map((building) => building.campus)))],
    [buildings],
  );

  const filteredBuildings = useMemo(
    () =>
      campusFilter === "All campuses"
        ? buildings
        : buildings.filter((building) => building.campus === campusFilter),
    [buildings, campusFilter],
  );

  const selectedBuilding = useMemo(
    () => buildings.find((building) => building.id === selectedBuildingId),
    [buildings, selectedBuildingId],
  );
  const selectedBuildingSlug = selectedBuilding?.slug ?? "";

  const operatingStatus = useMemo(
    () => (selectedBuilding && now ? evaluateBuildingHours(selectedBuilding, now) : null),
    [selectedBuilding, now],
  );

  const crowdSignal = useMemo(
    () =>
      selectedBuilding && now
        ? resolveCrowdSignal(selectedBuilding, reports, now, operatingStatus ?? undefined)
        : null,
    [selectedBuilding, reports, now, operatingStatus],
  );

  const todayEvents = useMemo(
    () => (now ? groupTodayEvents(events, now) : { happeningNow: [], laterToday: [] }),
    [events, now],
  );

  const crowdForecast = useMemo(
    () =>
      selectedBuilding && now
        ? buildCrowdForecast(selectedBuilding, events, reports, now)
        : [],
    [selectedBuilding, events, reports, now],
  );

  const reportsAllowed = operatingStatus?.isOpen === true;

  const loadReports = useCallback(
    async (showLoading = false) => {
      if (!selectedBuildingId) return;
      if (showLoading) setReportsLoading(true);

      try {
        const response = await fetch(
          `/api/reports?buildingId=${encodeURIComponent(selectedBuildingId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("Unable to load reports");
        const payload = (await response.json()) as ReportsPayload;
        setReports(payload.reports);
        setReportCount(payload.count);
        setAverageCrowdLevel(payload.averageCrowdLevel);
        setReportsError(false);
      } catch {
        setReportsError(true);
      } finally {
        if (showLoading) setReportsLoading(false);
      }
    },
    [selectedBuildingId],
  );

  const loadEvents = useCallback(
    async (showLoading = false) => {
      if (!selectedBuildingSlug) return;
      if (showLoading) setEventsLoading(true);

      try {
        const response = await fetch(
          `/api/events?buildingSlug=${encodeURIComponent(selectedBuildingSlug)}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("Unable to load events");
        const payload = (await response.json()) as EventsPayload;
        setEvents(payload.events);
        setEventsSourceUrl(payload.sourceUrl);
        setEventsError(false);
      } catch {
        setEvents([]);
        setEventsError(true);
      } finally {
        if (showLoading) setEventsLoading(false);
      }
    },
    [selectedBuildingSlug],
  );

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setNow(new Date()), 0);
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadBuildings() {
      try {
        const response = await fetch("/api/buildings", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load buildings");
        const payload = (await response.json()) as { buildings: Building[] };
        if (!active) return;
        setBuildings(payload.buildings);
        setSelectedBuildingId(payload.buildings[0]?.id ?? "");
        setBuildingsError(false);
      } catch {
        if (active) setBuildingsError(true);
      } finally {
        if (active) setBuildingsLoading(false);
      }
    }

    void loadBuildings();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedBuildingId) return;
    const initialLoadTimer = window.setTimeout(() => void loadReports(true), 0);
    const refreshTimer = window.setInterval(() => void loadReports(), 30_000);
    return () => {
      window.clearTimeout(initialLoadTimer);
      window.clearInterval(refreshTimer);
    };
  }, [loadReports, selectedBuildingId]);

  useEffect(() => {
    if (!selectedBuildingSlug) return;
    const initialLoadTimer = window.setTimeout(() => void loadEvents(true), 0);
    const refreshTimer = window.setInterval(() => void loadEvents(), 5 * 60_000);
    return () => {
      window.clearTimeout(initialLoadTimer);
      window.clearInterval(refreshTimer);
    };
  }, [loadEvents, selectedBuildingSlug]);

  function resetSubmissionState() {
    setCoordinates(null);
    setLocationState("idle");
    setSubmitState("idle");
    setReports([]);
    setReportCount(0);
    setAverageCrowdLevel(null);
    setEvents([]);
    setEventsError(false);
    setEventsSourceUrl(ASU_EVENTS_SOURCE);
    setQuestion("");
    setAskLoading(false);
    setAskError(false);
    setAskResult(null);
  }

  function chooseBuilding(id: string) {
    setSelectedBuildingId(id);
    resetSubmissionState();
  }

  function chooseCampus(campus: string) {
    setCampusFilter(campus);
    const choices =
      campus === "All campuses"
        ? buildings
        : buildings.filter((building) => building.campus === campus);
    if (!choices.some((building) => building.id === selectedBuildingId)) {
      setSelectedBuildingId(choices[0]?.id ?? "");
      resetSubmissionState();
    }
  }

  function verifyLocation() {
    setSubmitState("idle");
    if (!reportsAllowed) {
      setSubmitState("closed");
      return;
    }

    if (!("geolocation" in navigator)) {
      setLocationState("unavailable");
      return;
    }

    setLocationState("verifying");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const accuracy = position.coords.accuracy;
        if (!Number.isFinite(accuracy) || accuracy > 200) {
          setCoordinates(null);
          setLocationState("inaccurate");
          return;
        }

        setCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy,
        });
        setLocationState("verified");
      },
      (error) => {
        setCoordinates(null);
        setLocationState(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12_000 },
    );
  }

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportsAllowed) {
      setSubmitState("closed");
      return;
    }
    if (!coordinates || !selectedBuildingId) return;

    setSubmitState("submitting");
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingId: selectedBuildingId,
          crowdLevel,
          note,
          ...coordinates,
        }),
      });
      const payload = (await response.json()) as { code?: string };

      if (!response.ok) {
        if (payload.code === "too_far") setSubmitState("too_far");
        else if (payload.code === "building_closed") setSubmitState("closed");
        else if (payload.code === "inaccurate_location") {
          setSubmitState("inaccurate");
          setCoordinates(null);
          setLocationState("inaccurate");
        } else setSubmitState("error");
        return;
      }

      setSubmitState("success");
      setNote("");
      setCoordinates(null);
      setLocationState("idle");
      await loadReports();
    } catch {
      setSubmitState("error");
    }
  }

  async function askSunSpot(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!selectedBuildingId || trimmedQuestion.length < 3) return;

    setAskLoading(true);
    setAskError(false);
    setAskResult(null);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingId: selectedBuildingId,
          question: trimmedQuestion,
        }),
      });
      if (!response.ok) throw new Error("Unable to answer question");
      setAskResult((await response.json()) as AskPayload);
    } catch {
      setAskError(true);
    } finally {
      setAskLoading(false);
    }
  }

  const displayScore = crowdSignal?.score ?? averageCrowdLevel;
  const displayLabel = crowdSignal?.label ?? crowdLabel(averageCrowdLevel);

  return (
    <main className="min-h-screen min-w-0 overflow-x-clip">
      <header className="border-b border-white/10 bg-maroon text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-8 sm:py-5">
          <a className="flex min-w-0 items-center gap-2.5 sm:gap-3" href="#top" aria-label="SunSpot home">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gold text-maroon shadow-sm sm:size-10 sm:rounded-2xl">
              <SunMedium aria-hidden="true" size={22} strokeWidth={2.2} />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-extrabold tracking-tight sm:text-lg">SunSpot</span>
              <span className="block text-[9px] font-semibold uppercase tracking-[0.18em] text-white/60 sm:text-[11px] sm:tracking-[0.2em]">
                Study Scout
              </span>
            </span>
          </a>
          <span className="shrink-0 rounded-full border border-white/15 bg-white/8 px-2.5 py-1.5 text-[11px] font-medium text-white/70 sm:px-3 sm:text-xs">
            <span className="sm:hidden">4 campuses</span>
            <span className="hidden sm:inline">4 ASU campuses</span>
          </span>
        </div>
      </header>

      <section id="top" className="hero-grid border-b border-stone-200/80">
        <div className="mx-auto max-w-6xl px-4 py-9 sm:px-8 sm:py-12 lg:py-16">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex max-w-full items-center gap-2 rounded-full border border-gold/35 bg-gold/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-maroon sm:mb-5 sm:text-xs sm:tracking-[0.16em]">
              <span className="size-1.5 rounded-full bg-gold-dark" />
              Live + schedule-aware
            </div>
            <h1 className="text-balance text-[2rem] font-black leading-[1.04] tracking-[-0.045em] text-ink sm:text-5xl lg:text-6xl">
              Find your study spot <span className="text-maroon">before you walk in.</span>
            </h1>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10 lg:py-12">
        <section aria-labelledby="location-heading" className="mb-6 min-w-0 sm:mb-7">
          <div className="mb-4 flex items-end justify-between gap-3 sm:gap-4">
            <div className="min-w-0">
              <p className="eyebrow">Location</p>
              <h2 id="location-heading" className="mt-1 text-lg font-extrabold tracking-tight text-ink sm:text-xl">
                Where are you headed?
              </h2>
            </div>
            <button
              type="button"
              onClick={() => void Promise.all([loadReports(true), loadEvents(true)])}
              disabled={!selectedBuildingId || reportsLoading || eventsLoading}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-2 text-xs font-semibold text-stone-500 transition hover:bg-stone-100 hover:text-maroon disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-3 sm:text-sm"
            >
              <RefreshCw aria-hidden="true" size={16} className={reportsLoading || eventsLoading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          <div className="horizontal-scroll mb-3 flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Filter by campus">
            {campuses.map((campus) => (
              <button
                key={campus}
                type="button"
                aria-pressed={campusFilter === campus}
                onClick={() => chooseCampus(campus)}
                className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-bold transition ${
                  campusFilter === campus
                    ? "border-maroon bg-maroon text-white"
                    : "border-stone-300 bg-white text-stone-600 hover:border-maroon hover:text-maroon"
                }`}
              >
                {campus}
              </button>
            ))}
          </div>

          <div className="relative">
            <MapPin aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-maroon" size={20} />
            <select
              className="h-14 w-full min-w-0 appearance-none truncate rounded-2xl border border-stone-300 bg-white pl-11 pr-11 text-sm font-bold text-ink shadow-card outline-none transition focus:border-gold-dark focus:ring-4 focus:ring-gold/20 disabled:cursor-wait disabled:text-stone-400 sm:pl-12 sm:pr-12 sm:text-base"
              value={selectedBuildingId}
              onChange={(event) => chooseBuilding(event.target.value)}
              disabled={buildingsLoading || filteredBuildings.length === 0}
              aria-label="Select a study building"
            >
              {buildingsLoading && <option>Loading study locations…</option>}
              {!buildingsLoading && filteredBuildings.length === 0 && <option>No locations in this campus</option>}
              {filteredBuildings.map((building) => (
                <option key={building.id} value={building.id}>
                  {building.name} · {building.campus}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-stone-400" size={20} />
          </div>

          {selectedBuilding && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-sm text-stone-500">
              <CalendarDays aria-hidden="true" className="shrink-0 text-maroon" size={16} />
              <span className="font-bold text-stone-700">Today’s hours:</span>
              <span>{operatingStatus?.todayHours ?? "Calculating…"}</span>
            </div>
          )}

          {buildingsError && (
            <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
              <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
              Study locations could not be loaded. Check the server configuration and try again.
            </div>
          )}
        </section>

        {selectedBuilding ? (
          <div className="grid min-w-0 gap-5 sm:gap-7 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)] lg:items-start">
            <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-7">
              <section aria-labelledby="events-heading" className="order-3 min-w-0 rounded-3xl border border-stone-200 bg-white p-4 shadow-card sm:p-6">
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="eyebrow">At this building</p>
                    <h2 id="events-heading" className="mt-1 text-xl font-black tracking-tight text-ink sm:text-2xl">
                      Today’s events
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-stone-500">
                      Happening now and still to come today, in Arizona time.
                    </p>
                  </div>
                  <a
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-maroon hover:underline"
                    href={eventsSourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Official ASU Events <ExternalLink aria-hidden="true" size={13} />
                  </a>
                </div>

                {eventsLoading ? (
                  <div aria-label="Loading today's events" className="mt-5 space-y-3">
                    {[0, 1].map((item) => (
                      <div key={item} className="h-24 animate-pulse rounded-2xl bg-stone-100" />
                    ))}
                  </div>
                ) : eventsError ? (
                  <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">
                    <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
                    ASU’s event schedule could not be loaded. Try refreshing in a moment.
                  </div>
                ) : todayEvents.happeningNow.length === 0 && todayEvents.laterToday.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center">
                    <CalendarDays aria-hidden="true" className="mx-auto text-gold-dark" size={26} />
                    <p className="mt-3 font-extrabold text-ink">No events remaining today</p>
                    <p className="mt-1 text-sm leading-6 text-stone-500">
                      ASU Events does not list anything happening now or later today at {selectedBuilding.name}.
                    </p>
                  </div>
                ) : (
                  <div className="mt-5 space-y-5">
                    {todayEvents.happeningNow.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-sm font-extrabold text-emerald-700">Happening now</h3>
                        <ol className="space-y-3">
                          {todayEvents.happeningNow.map((event) => (
                            <EventRow key={event.id} event={event} happeningNow />
                          ))}
                        </ol>
                      </div>
                    )}
                    {todayEvents.laterToday.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-sm font-extrabold text-stone-700">Later today</h3>
                        <ol className="space-y-3">
                          {todayEvents.laterToday.map((event) => (
                            <EventRow key={event.id} event={event} happeningNow={false} />
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <section aria-labelledby="crowd-heading" className="order-1 min-w-0 overflow-hidden rounded-3xl border border-maroon/20 bg-white shadow-[0_22px_60px_-34px_rgba(140,29,64,0.55)]">
                <div className="border-b border-stone-100 p-4 sm:p-6">
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4">
                    <div>
                      <p className="eyebrow">Right now</p>
                      <h2 id="crowd-heading" className="mt-1 text-xl font-black tracking-tight text-ink sm:text-2xl">
                        Crowd level
                      </h2>
                    </div>
                    <div className="flex max-w-full flex-wrap gap-2 sm:justify-end">
                      {operatingStatus && (
                        <span className={`rounded-full px-3 py-1.5 text-sm font-extrabold ring-1 ring-inset ${hoursTone(operatingStatus.status)}`}>
                          {operatingStatus.status === "open"
                            ? "Open now"
                            : operatingStatus.status === "closed"
                              ? "Closed"
                              : "Check hours"}
                        </span>
                      )}
                      <span className={`rounded-full px-3 py-1.5 text-sm font-bold ${reportTone(displayScore)}`}>
                        {displayLabel}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 divide-x divide-stone-200 rounded-2xl bg-stone-50 p-3.5 sm:mt-6 sm:p-4">
                    <div className="min-w-0 pr-3 sm:pr-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-stone-500">
                        <Users aria-hidden="true" size={17} /> Crowd score
                      </div>
                      <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-ink sm:text-4xl">
                        {displayScore === null || displayScore === undefined ? "—" : displayScore}
                        <span className="ml-1 text-base font-bold text-stone-400">/10</span>
                      </p>
                    </div>
                    <div className="min-w-0 pl-3 sm:pl-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-stone-500">
                        <Clock3 aria-hidden="true" size={17} /> Last hour
                      </div>
                      <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-ink sm:text-4xl">{reportCount}</p>
                      <p className="text-sm font-medium text-stone-400">{reportCount === 1 ? "report" : "reports"}</p>
                    </div>
                  </div>

                  {crowdSignal && (
                    <div className="mt-4 rounded-2xl border border-stone-200 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${crowdSignal.isEstimated ? "bg-violet-50 text-violet-700" : "bg-sky-50 text-sky-700"}`}>
                          {crowdSignal.sourceLabel}
                        </span>
                        {crowdSignal.isEstimated && crowdSignal.score !== null && (
                          <span className="text-xs font-semibold text-stone-400">Not a live measurement</span>
                        )}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-stone-600">{crowdSignal.explanation}</p>
                      {crowdSignal.factors.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2" aria-label="Estimate factors">
                          {crowdSignal.factors.map((factor) => (
                            <span key={`${factor.label}-${factor.delta}`} className="rounded-lg bg-stone-100 px-2 py-1 text-[11px] font-semibold text-stone-600">
                              {factor.label}{factor.delta === 0 ? "" : ` ${factor.delta > 0 ? "+" : ""}${factor.delta}`}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {crowdForecast.length > 0 && (
                    <div className="mt-6 border-t border-stone-100 pt-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <TrendingUp aria-hidden="true" className="text-maroon" size={18} />
                            <h3 className="font-extrabold text-ink">Today’s crowd forecast</h3>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-stone-500">
                            Hourly projection for the rest of today in Arizona time.
                          </p>
                        </div>
                        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-extrabold text-violet-700">
                          Forecast
                        </span>
                      </div>

                      <div className="horizontal-scroll mt-5 overflow-x-auto pb-3">
                        <ol className="flex min-w-max items-end gap-2" aria-label="Hourly crowd forecast">
                          {crowdForecast.map((point) => (
                            <li
                              key={point.at}
                              className="w-16 shrink-0 text-center"
                              title={point.explanation}
                              aria-label={`${point.timeLabel}: ${point.score === null ? point.label : `${point.label}, ${point.score} out of 10`}${point.eventCount ? `, ${point.eventCount} ${point.eventCount === 1 ? "event" : "events"}` : ""}`}
                            >
                              <p className="mb-1 text-xs font-black tabular-nums text-ink">
                                {point.score ?? "—"}
                              </p>
                              <div className="mx-auto flex h-24 w-10 items-end rounded-xl bg-stone-100 p-1" aria-hidden="true">
                                <span
                                  className={`w-full rounded-lg ${forecastBarTone(point)}`}
                                  style={{
                                    height:
                                      point.score === null
                                        ? "6px"
                                        : `${Math.max(12, point.score * 10)}%`,
                                  }}
                                />
                              </div>
                              <p className="mt-2 text-xs font-bold text-stone-700">{point.timeLabel}</p>
                              <p className={`mt-0.5 truncate text-[10px] font-semibold ${point.eventCount ? "text-maroon" : "text-stone-400"}`}>
                                {point.status === "live"
                                  ? "Live"
                                  : point.eventCount
                                    ? `${point.eventCount} ${point.eventCount === 1 ? "event" : "events"}`
                                    : point.label}
                              </p>
                            </li>
                          ))}
                        </ol>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-stone-500" aria-label="Forecast inputs">
                        <span className="rounded-lg bg-stone-100 px-2 py-1">Operating hours</span>
                        <span className="rounded-lg bg-stone-100 px-2 py-1">Academic calendar</span>
                        <span className="rounded-lg bg-stone-100 px-2 py-1">ASU events</span>
                        <span className="rounded-lg bg-stone-100 px-2 py-1">Recent reports</span>
                      </div>
                      <p className="mt-3 text-[11px] leading-5 text-stone-400">
                        Forecasts are estimates, not live measurements. Event effects appear after the official ASU event schedule loads.
                      </p>
                    </div>
                  )}
                </div>

                <div className="p-5 sm:p-6">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <h3 className="font-extrabold text-ink">Recent reports</h3>
                    <span className="text-right text-xs font-medium text-stone-400">Auto-refreshes every 30s</span>
                  </div>

                  {reportsLoading ? (
                    <div aria-label="Loading recent reports" className="space-y-3">
                      {[0, 1, 2].map((item) => (
                        <div key={item} className="h-20 animate-pulse rounded-2xl bg-stone-100" />
                      ))}
                    </div>
                  ) : reportsError ? (
                    <div role="alert" className="rounded-2xl border border-rose-100 bg-rose-50 p-5 text-center">
                      <AlertCircle aria-hidden="true" className="mx-auto text-rose-600" size={24} />
                      <p className="mt-2 font-bold text-rose-900">Reports are unavailable</p>
                      <p className="mt-1 text-sm text-rose-700">Try refreshing in a moment.</p>
                    </div>
                  ) : reports.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center sm:p-8">
                      <SunMedium aria-hidden="true" className="mx-auto text-gold-dark" size={28} />
                      <p className="mt-3 font-extrabold text-ink">No reports in the last hour</p>
                      <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-stone-500">
                        {reportsAllowed
                          ? "The crowd card uses a clearly labeled schedule-based estimate until a nearby student reports."
                          : "This building is closed, so reports and crowd estimates are paused."}
                      </p>
                    </div>
                  ) : (
                    <ol className="space-y-3">
                      {reports.map((report) => (
                        <li key={report.id} className="rounded-2xl border border-stone-200 p-4 transition hover:border-stone-300">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex min-w-0 items-start gap-3">
                              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-maroon text-base font-black text-white">
                                {report.crowd_level}
                              </span>
                              <div className="min-w-0">
                                <p className="font-bold text-ink">{crowdLabel(report.crowd_level)}</p>
                                {report.note && <p className="mt-1 break-words text-sm leading-6 text-stone-600">{report.note}</p>}
                              </div>
                            </div>
                            <time className="shrink-0 text-xs font-medium text-stone-400" dateTime={report.created_at}>
                              {relativeTime(report.created_at)}
                            </time>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </section>
            </div>

            <aside className="order-2 min-w-0 lg:sticky lg:top-6">
              <form onSubmit={submitReport} className="min-w-0 rounded-3xl border border-stone-200 bg-white p-4 shadow-card sm:p-6" aria-labelledby="report-heading">
                <p className="eyebrow">Help the next student</p>
                <h2 id="report-heading" className="mt-1 text-xl font-black tracking-tight text-ink sm:text-2xl">Share a crowd report</h2>
                <p className="mt-2 text-sm leading-6 text-stone-500">It takes a few seconds and stays visible for one hour.</p>

                {!reportsAllowed && operatingStatus && (
                  <div className="mt-5 flex items-start gap-2 rounded-2xl bg-stone-100 p-4 text-sm font-semibold leading-6 text-stone-700">
                    <Building2 aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
                    Reports are paused while this building is {operatingStatus.status === "closed" ? "closed" : "waiting for verified hours"}.
                  </div>
                )}

                <fieldset disabled={!reportsAllowed} className="disabled:opacity-55">
                  <div className="mt-7">
                    <div className="flex items-center justify-between">
                      <legend className="text-sm font-extrabold text-ink">Crowd level</legend>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${reportTone(crowdLevel)}`}>
                        {crowdLabel(crowdLevel)} · {crowdLevel}/10
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-10 lg:grid-cols-5 xl:grid-cols-10">
                      {crowdLevels.map((level) => (
                        <button
                          key={level}
                          type="button"
                          aria-label={`Crowd level ${level}, ${crowdLabel(level)}`}
                          aria-pressed={crowdLevel === level}
                          onClick={() => {
                            setCrowdLevel(level);
                            setSubmitState("idle");
                          }}
                          className="crowd-button"
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] font-semibold text-stone-400">
                      <span>Quiet</span><span>Packed</span>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor="note" className="text-sm font-extrabold text-ink">Optional note</label>
                      <span className="text-xs font-medium tabular-nums text-stone-400">{note.length}/280</span>
                    </div>
                    <textarea
                      id="note"
                      value={note}
                      onChange={(event) => {
                        setNote(event.target.value);
                        setSubmitState("idle");
                      }}
                      maxLength={280}
                      rows={3}
                      placeholder="e.g. Plenty of tables upstairs"
                      className="mt-2 w-full resize-none rounded-2xl border border-stone-300 bg-white p-3.5 text-sm leading-6 text-ink outline-none transition placeholder:text-stone-400 focus:border-gold-dark focus:ring-4 focus:ring-gold/20"
                    />
                  </div>

                  <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl ${locationState === "verified" ? "bg-emerald-100 text-emerald-700" : "bg-white text-maroon"}`}>
                        {locationState === "verified" ? <Check aria-hidden="true" size={17} /> : <LocateFixed aria-hidden="true" size={17} />}
                      </span>
                      <div>
                        <p className="text-sm font-extrabold text-ink">Verify location</p>
                        <p className="mt-1 text-xs leading-5 text-stone-500" aria-live="polite">{locationMessage(locationState)}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={verifyLocation}
                      disabled={locationState === "verifying" || !selectedBuildingId || !reportsAllowed}
                      className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-bold text-ink transition hover:border-maroon hover:text-maroon disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {locationState === "verifying" && <RefreshCw aria-hidden="true" className="animate-spin" size={16} />}
                      {locationState === "verified" ? "Verify again" : locationState === "verifying" ? "Verifying…" : "Verify location"}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={!coordinates || submitState === "submitting" || !reportsAllowed}
                    className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-maroon px-5 text-sm font-extrabold text-white shadow-button transition hover:bg-maroon-light focus:outline-none focus:ring-4 focus:ring-maroon/20 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:shadow-none"
                  >
                    {submitState === "submitting" ? <RefreshCw aria-hidden="true" className="animate-spin" size={17} /> : <Send aria-hidden="true" size={17} />}
                    {submitState === "submitting" ? "Submitting…" : "Submit crowd report"}
                  </button>
                </fieldset>

                <div className="mt-4 min-h-6 text-sm" aria-live="polite">
                  {submitState === "success" && <p className="flex items-start gap-2 font-semibold text-emerald-700"><Check aria-hidden="true" className="mt-0.5 shrink-0" size={16} /> Report submitted. Thanks for helping!</p>}
                  {submitState === "too_far" && <p role="alert" className="flex items-start gap-2 font-semibold text-rose-700"><AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={16} /> You appear to be too far from this building.</p>}
                  {submitState === "inaccurate" && <p role="alert" className="flex items-start gap-2 font-semibold text-rose-700"><AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={16} /> Your location accuracy became too low. Verify again.</p>}
                  {submitState === "closed" && <p role="alert" className="flex items-start gap-2 font-semibold text-stone-700"><AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={16} /> Reports are accepted only while the selected building is open.</p>}
                  {submitState === "error" && <p role="alert" className="flex items-start gap-2 font-semibold text-rose-700"><AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={16} /> Something went wrong. Your report was not submitted.</p>}
                </div>

                <div className="mt-3 flex items-start gap-2 border-t border-stone-100 pt-4 text-[11px] leading-5 text-stone-400">
                  <Info aria-hidden="true" className="mt-0.5 shrink-0" size={14} />
                  <p>Location checks approximate proximity and can be spoofed. Your precise coordinates are never stored.</p>
                </div>
              </form>

              <section aria-labelledby="ask-heading" className="mt-5 min-w-0 overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-card sm:mt-7">
                <div className="bg-gradient-to-br from-violet-50 via-white to-gold/10 p-4 sm:p-6">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-700">
                      <Sparkles aria-hidden="true" size={20} />
                    </span>
                    <div>
                      <p className="eyebrow">Grounded campus answers</p>
                      <h2 id="ask-heading" className="mt-1 text-xl font-black tracking-tight text-ink sm:text-2xl">
                        Ask SunSpot
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-stone-500">
                        Ask about ASU building hours, locations, today’s events, or study options across campus.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2" aria-label="Suggested questions">
                    {[
                      "Which Tempe study spot is quietest right now?",
                      "What events are happening on the Tempe campus today?",
                      "Is Hayden Library open tonight?",
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => {
                          setQuestion(suggestion);
                          setAskError(false);
                          setAskResult(null);
                        }}
                        className="max-w-full rounded-full border border-violet-200 bg-white px-3 py-2 text-left text-xs font-bold leading-5 text-violet-700 transition hover:border-violet-400 hover:bg-violet-50"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={askSunSpot} className="mt-4">
                    <label htmlFor="sunspot-question" className="sr-only">Ask a question about the selected building</label>
                    <textarea
                      id="sunspot-question"
                      value={question}
                      onChange={(event) => {
                        setQuestion(event.target.value);
                        setAskError(false);
                      }}
                      maxLength={300}
                      rows={3}
                      placeholder="e.g. Is this building open after my 7 PM class?"
                      className="w-full resize-none rounded-2xl border border-violet-200 bg-white p-3.5 text-sm leading-6 text-ink outline-none transition placeholder:text-stone-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                    />
                    <div className="mt-2 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <span className="text-xs font-medium tabular-nums text-stone-400">{question.length}/300</span>
                      <button
                        type="submit"
                        disabled={askLoading || question.trim().length < 3}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 text-sm font-extrabold text-white transition hover:bg-violet-800 focus:outline-none focus:ring-4 focus:ring-violet-200 disabled:cursor-not-allowed disabled:bg-stone-300 sm:w-auto"
                      >
                        {askLoading ? <RefreshCw aria-hidden="true" className="animate-spin" size={16} /> : <Sparkles aria-hidden="true" size={16} />}
                        {askLoading ? "Checking ASU sources…" : "Get answer"}
                      </button>
                    </div>
                  </form>
                </div>

                <div className="border-t border-stone-100 p-4 sm:p-6" aria-live="polite">
                  {askLoading ? (
                    <div className="space-y-2" aria-label="Loading answer">
                      <div className="h-4 w-11/12 animate-pulse rounded bg-stone-100" />
                      <div className="h-4 w-full animate-pulse rounded bg-stone-100" />
                      <div className="h-4 w-8/12 animate-pulse rounded bg-stone-100" />
                    </div>
                  ) : askError ? (
                    <div role="alert" className="flex items-start gap-2 text-sm font-semibold text-rose-700">
                      <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
                      SunSpot could not check the ASU sources. Try again in a moment.
                    </div>
                  ) : askResult ? (
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${askResult.mode === "ai" ? "bg-violet-100 text-violet-700" : "bg-sky-50 text-sky-700"}`}>
                          {askResult.mode === "ai" ? "ASU Air answer" : "Source summary"}
                        </span>
                        <span className="text-xs font-semibold text-stone-400">Grounded in {askResult.sources.length} sources</span>
                      </div>
                      <FormattedAnswer answer={askResult.answer} />
                      {askResult.notice && (
                        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">{askResult.notice}</p>
                      )}
                      <div className="mt-4 border-t border-stone-100 pt-4">
                        <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-stone-400">ASU sources</p>
                        <ul className="mt-2 space-y-2">
                          {askResult.sources.map((source) => (
                            <li key={source.id}>
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-start gap-1.5 text-xs font-bold leading-5 text-maroon hover:underline"
                              >
                                {source.title} <ExternalLink aria-hidden="true" className="mt-0.5 shrink-0" size={12} />
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm leading-6 text-stone-500">
                      Answers stay focused on the selected building and show the ASU sources used.
                    </p>
                  )}
                </div>
              </section>
            </aside>
          </div>
        ) : !buildingsLoading && !buildingsError ? (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-10 text-center">
            <Building2 aria-hidden="true" className="mx-auto text-stone-400" size={30} />
            <p className="mt-3 font-extrabold text-ink">No verified locations are available</p>
            <p className="mt-1 text-sm text-stone-500">Choose another campus or check again later.</p>
          </div>
        ) : null}
      </div>

      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-7 text-xs leading-5 text-stone-500 sm:px-8">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 font-semibold sm:flex sm:flex-wrap sm:gap-x-5 sm:gap-y-2">
            <a className="hover:text-maroon hover:underline" href={ASU_ACADEMIC_CALENDAR_SOURCE} target="_blank" rel="noreferrer">ASU academic calendar</a>
            <a className="hover:text-maroon hover:underline" href="https://lib.asu.edu/hours" target="_blank" rel="noreferrer">ASU Library hours</a>
            <a className="hover:text-maroon hover:underline" href="https://eoss.asu.edu/student-unions/hours-of-operation" target="_blank" rel="noreferrer">ASU student union hours</a>
            <a className="hover:text-maroon hover:underline" href="https://map.asu.edu/" target="_blank" rel="noreferrer">ASU campus map</a>
          </div>
          <div className="mt-4 flex flex-col gap-1 border-t border-stone-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p>Schedule data checked {formatVerifiedDate(ASU_CALENDAR_VERIFIED_ON)}. Always confirm official hours before traveling.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
