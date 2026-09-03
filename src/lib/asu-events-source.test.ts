import { describe, expect, it } from "vitest";

import {
  buildAsuEventsUrl,
  eventMatchesBuilding,
  parseAsuEventCards,
} from "./asu-events-source";

const HAYDEN_CARD = `
  <a href="/event/mobile-fixer-studio-2?eventDate=2026-09-03&amp;id=0" title="Mobile Fixer Studio">
    <li>
      <div class="event-list-date"></div>
      <div class="views-field views-field-title">
        <span class="field-content"><h2 class="event-list-title">Mobile Fixer Studio</h2>
          <div><i class="far fa-calendar"></i>
            <strong>Thu, Sep 3, 2026</strong>, <span class="time-wrapper">
              <span class="smart-date--time">12:00 pm</span> &ndash;
              <span class="smart-date--time">2:00 pm</span> (MST)
            </span>
          </div>
          <div><i class="fas fa-map-marker-alt"></i>
            <strong>Hayden Library, Makerspace, Level 3</strong>, Tempe campus
          </div>
        </span>
      </div>
    </li>
  </a>`;

describe("parseAsuEventCards", () => {
  it("parses the official ASU event-card fields into timestamps", () => {
    expect(parseAsuEventCards(HAYDEN_CARD)).toEqual([
      {
        id: "/event/mobile-fixer-studio-2?eventDate=2026-09-03&id=0",
        title: "Mobile Fixer Studio",
        url: "https://asuevents.asu.edu/event/mobile-fixer-studio-2?eventDate=2026-09-03&id=0",
        startsAt: "2026-09-03T19:00:00.000Z",
        endsAt: "2026-09-03T21:00:00.000Z",
        location: "Hayden Library, Makerspace, Level 3 , Tempe campus",
      },
    ]);
  });
});

describe("eventMatchesBuilding", () => {
  const parsed = parseAsuEventCards(HAYDEN_CARD)[0];

  it("matches the selected building and campus", () => {
    expect(eventMatchesBuilding(parsed, "hayden-library-tempe")).toBe(true);
    expect(eventMatchesBuilding(parsed, "noble-library-tempe")).toBe(false);
  });

  it("does not treat Memorial Union Mall as an event inside Memorial Union", () => {
    expect(
      eventMatchesBuilding(
        { ...parsed, location: "Memorial Union Mall, Tempe campus" },
        "memorial-union-tempe",
      ),
    ).toBe(false);
  });
});

describe("buildAsuEventsUrl", () => {
  it("queries the official site for the selected building on Arizona's date", () => {
    const url = buildAsuEventsUrl(
      "hayden-library-tempe",
      new Date("2026-09-03T05:30:00.000Z"),
    );

    expect(url?.origin).toBe("https://asuevents.asu.edu");
    expect(url?.searchParams.get("eventDate[min]")).toBe("2026-09-02");
    expect(url?.searchParams.get("eventDate[max]")).toBe("2026-09-02");
    expect(url?.searchParams.get("searchText")).toBe("Hayden Library");
  });
});
