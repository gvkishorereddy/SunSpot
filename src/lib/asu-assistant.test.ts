import { describe, expect, it } from "vitest";

import {
  answerMatchesRequestPlan,
  buildAssistantRequestPlan,
  buildKnowledgeSources,
  buildBuildingKnowledgeSources,
  buildCampusOptionSources,
  buildRetrievalAnswer,
  extractResponseText,
  filterEventsForQuestionCampus,
  filterEventsForTimeRange,
  filterKnowledgeSourcesForPlan,
  parseQuestionTimeRange,
  retrieveKnowledge,
  type KnowledgeSource,
} from "./asu-assistant";
import type { WeeklyHours } from "./operating-hours";

const weeklyHours: WeeklyHours = {
  sunday: [{ open: "10:00", close: "22:00" }],
  monday: [{ open: "07:00", close: "24:00" }],
  tuesday: [{ open: "07:00", close: "24:00" }],
  wednesday: [{ open: "07:00", close: "24:00" }],
  thursday: [{ open: "07:00", close: "24:00" }],
  friday: [{ open: "07:00", close: "22:00" }],
  saturday: [{ open: "09:00", close: "22:00" }],
};

const building = {
  name: "Hayden Library",
  campus: "Tempe",
  address: "300 E Orange Mall, Tempe, AZ 85281",
  category: "Library",
  weekly_hours: weeklyHours,
  special_hours: {},
  official_hours_url: "https://lib.asu.edu/locations/hayden",
  location_source_url: "https://lib.asu.edu/locations/hayden",
  baseline_crowd_level: 7,
  timezone: "America/Phoenix",
};

const now = new Date("2026-09-03T18:00:00.000Z");

describe("ASU assistant retrieval", () => {
  it("builds factual sources for the selected building", () => {
    const sources = buildKnowledgeSources(building, [], undefined, now);

    expect(sources.find((source) => source.id === "official-hours")?.excerpt)
      .toContain("open");
    expect(sources.find((source) => source.id === "location")?.excerpt)
      .toContain("300 E Orange Mall");
    expect(sources.find((source) => source.id === "academic-calendar")?.excerpt)
      .toContain("Fall 2026");
  });

  it("retrieves hours for an opening-hours question", () => {
    const sources = buildKnowledgeSources(building, [], undefined, now);
    const retrieved = retrieveKnowledge("Is Hayden open tonight?", sources);

    expect(retrieved[0].id).toBe("official-hours");
  });

  it("retrieves a named building even when it is not selected", () => {
    const sources = [
      ...buildBuildingKnowledgeSources(building, now),
      ...buildBuildingKnowledgeSources(
        { ...building, name: "Noble Library", slug: "noble-library" },
        now,
      ),
    ];
    const retrieved = retrieveKnowledge("Is Noble Library open tonight?", sources);

    expect(retrieved[0].title).toBe("Noble Library official hours");
  });

  it("retrieves event information for an event question", () => {
    const sources: KnowledgeSource[] = [
      {
        id: "official-hours",
        title: "Official hours",
        url: "https://asu.edu/hours",
        excerpt: "Open today.",
      },
      {
        id: "asu-event-1",
        title: "Career fair",
        url: "https://asuevents.asu.edu/event/career-fair",
        excerpt: "Career fair is happening today.",
      },
    ];

    expect(retrieveKnowledge("What events are happening?", sources)[0].id)
      .toBe("asu-event-1");
  });

  it("prioritizes concrete events over generic building locations", () => {
    const sources: KnowledgeSource[] = [
      {
        id: "hayden-location",
        title: "Hayden Library location",
        url: "https://lib.asu.edu/locations/hayden",
        excerpt: "Hayden Library is on the Tempe campus.",
      },
      {
        id: "campus-event-1",
        title: "Tempe Campus AI Day",
        url: "https://asuevents.asu.edu/event/tempe-campus-ai-day",
        excerpt: "Tempe Campus AI Day is happening now at Memorial Union on the Tempe campus.",
      },
      {
        id: "campus-event-2",
        title: "Los Angeles event",
        url: "https://asuevents.asu.edu/event/la-event",
        excerpt: "An event happening today in Los Angeles.",
      },
    ];

    expect(
      retrieveKnowledge(
        "What events are near the Fulton School building in Tempe?",
        sources,
      )[0].id,
    ).toBe("campus-event-1");
  });

  it("offers open same-campus study options ordered by forecast crowd", () => {
    const options = buildCampusOptionSources(
      [
        building,
        { ...building, name: "Quiet Library", baseline_crowd_level: 3 },
        { ...building, name: "Other Campus", campus: "Polytechnic" },
      ],
      "Tempe",
      now,
    );

    expect(options.map((option) => option.title)).toEqual([
      "Study option: Quiet Library",
      "Study option: Hayden Library",
    ]);
    expect(options[0].excerpt).toContain("estimate, not a live measurement");
  });

  it("creates a useful answer when the LLM is not configured", () => {
    const answer = buildRetrievalAnswer([
      {
        id: "location",
        title: "Location",
        url: "https://asu.edu/map",
        excerpt: "Hayden Library is on the Tempe campus.",
      },
    ]);

    expect(answer).toBe("Hayden Library is on the Tempe campus.");
  });

  it("extracts text from a Responses API payload", () => {
    expect(
      extractResponseText({
        output: [
          {
            content: [{ type: "output_text", text: "Grounded answer" }],
          },
        ],
      }),
    ).toBe("Grounded answer");
  });

  it("extracts text from an ASU Air Chat Completions payload", () => {
    expect(
      extractResponseText({
        choices: [{ message: { content: "ASU Air answer" } }],
      }),
    ).toBe("ASU Air answer");
  });

  it("parses a student's free-time range", () => {
    const range = parseQuestionTimeRange(
      "I am free from 1:30 PM to 2 PM",
      now,
    );

    expect(range?.label).toBe("1:30 PM–2 PM");
    expect(range?.startAt.toISOString()).toBe("2026-09-03T20:30:00.000Z");
    expect(range?.endAt.toISOString()).toBe("2026-09-03T21:00:00.000Z");
  });

  it("filters out events outside the student's free-time range", () => {
    const range = parseQuestionTimeRange(
      "I am free between 1:30 PM and 2 PM",
      now,
    );
    const events = [
      {
        id: "before",
        title: "Earlier event",
        url: "https://asuevents.asu.edu/event/before",
        startsAt: "2026-09-03T19:00:00.000Z",
        endsAt: "2026-09-03T20:00:00.000Z",
        location: "Tempe campus",
      },
      {
        id: "overlap",
        title: "Overlapping event",
        url: "https://asuevents.asu.edu/event/overlap",
        startsAt: "2026-09-03T19:00:00.000Z",
        endsAt: "2026-09-03T21:00:00.000Z",
        location: "Tempe campus",
      },
      {
        id: "after",
        title: "Later event",
        url: "https://asuevents.asu.edu/event/after",
        startsAt: "2026-09-03T22:00:00.000Z",
        endsAt: "2026-09-03T23:00:00.000Z",
        location: "Tempe campus",
      },
    ];

    expect(filterEventsForTimeRange(events, range).map((event) => event.id))
      .toEqual(["overlap"]);
  });

  it("filters events to a campus explicitly named in the question", () => {
    const events = [
      {
        id: "tempe",
        title: "Tempe event",
        url: "https://asuevents.asu.edu/event/tempe",
        startsAt: "2026-09-03T20:00:00.000Z",
        endsAt: "2026-09-03T21:00:00.000Z",
        location: "Hayden Library, Tempe campus",
      },
      {
        id: "downtown",
        title: "Downtown event",
        url: "https://asuevents.asu.edu/event/downtown",
        startsAt: "2026-09-03T20:00:00.000Z",
        endsAt: "2026-09-03T21:00:00.000Z",
        location: "Downtown Phoenix campus",
      },
    ];

    expect(
      filterEventsForQuestionCampus(
        events,
        "What is happening near Fulton in Tempe?",
      ).map((event) => event.id),
    ).toEqual(["tempe"]);
  });

  it("reformats a question into a structured request plan", () => {
    const availability = parseQuestionTimeRange(
      "I am free from 1:30 PM to 2 PM",
      now,
    );
    const plan = buildAssistantRequestPlan(
      "I am free from 1:30 PM to 2 PM. What events are happening near Fulton in Tempe?",
      availability,
      null,
    );

    expect(plan).toMatchObject({
      campus: "Tempe",
      availability: "1:30 PM–2 PM",
      intents: ["events", "location"],
      selectedBuildingHint: null,
    });
    expect(plan.keywords).toContain("fulton");
    expect(plan.keywords).not.toContain("pm");
  });

  it("keeps only source categories requested by the structured plan", () => {
    const sources: KnowledgeSource[] = [
      { id: "campus-event-1", title: "Event", url: "https://asu.edu", excerpt: "Event fact" },
      { id: "hayden-official-hours", title: "Hours", url: "https://asu.edu", excerpt: "Hours fact" },
      { id: "hayden-location", title: "Location", url: "https://asu.edu", excerpt: "Location fact" },
      { id: "academic-calendar", title: "Calendar", url: "https://asu.edu", excerpt: "Calendar fact" },
    ];
    const plan = buildAssistantRequestPlan(
      "When does Hayden Library close today?",
      null,
      null,
    );

    expect(plan.answerGoal).toContain("operating-hours");
    expect(filterKnowledgeSourcesForPlan(sources, plan).map((source) => source.id))
      .toEqual(["hayden-official-hours", "hayden-location"]);
  });

  it("does not mistake 'when do classes end' for an event request", () => {
    const plan = buildAssistantRequestPlan(
      "When do classes end this term?",
      null,
      null,
    );

    expect(plan.intents).toEqual(["academic-calendar"]);
  });

  it("rejects an AI answer that ignores available crowd or calendar facts", () => {
    const crowdPlan = buildAssistantRequestPlan(
      "Which Tempe library has the best crowd forecast?",
      null,
      null,
    );
    const crowdSources: KnowledgeSource[] = [
      {
        id: "campus-option-music-library",
        title: "Study option: Music Library",
        url: "https://asu.edu",
        excerpt: "The SunSpot forecast is 5/10.",
      },
    ];
    expect(
      answerMatchesRequestPlan("Try the Music Library.", crowdPlan, crowdSources),
    ).toBe(false);
    expect(
      answerMatchesRequestPlan(
        "Try the Music Library; its SunSpot forecast is 5/10.",
        crowdPlan,
        crowdSources,
      ),
    ).toBe(true);

    const calendarPlan = buildAssistantRequestPlan(
      "When do classes end this term?",
      null,
      null,
    );
    const calendarSources: KnowledgeSource[] = [
      {
        id: "academic-calendar",
        title: "ASU academic calendar",
        url: "https://asu.edu",
        excerpt: "Classes end December 4, 2026.",
      },
    ];
    expect(
      answerMatchesRequestPlan(
        "I don't have ASU academic calendar data, so I can't confirm the exact end date.",
        calendarPlan,
        calendarSources,
      ),
    ).toBe(false);
  });
});
