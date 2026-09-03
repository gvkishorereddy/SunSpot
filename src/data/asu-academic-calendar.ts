export const ASU_ACADEMIC_CALENDAR_SOURCE =
  "https://registrar.asu.edu/academic-calendar";

export const ASU_CALENDAR_VERIFIED_ON = "2026-09-02";

export type AcademicSession = {
  name: "Session A" | "Session B" | "Session C";
  startsOn: string;
  endsOn: string;
};

export type AcademicTerm = {
  name: "Fall 2026" | "Spring 2027";
  startsOn: string;
  classesEndOn: string;
  endsOn: string;
  sessions: AcademicSession[];
};

export type AcademicEvent = {
  name: string;
  kind: "break" | "study" | "finals" | "closure" | "intersemester";
  startsOn: string;
  endsOn: string;
};

// Static, reviewed data is deliberate: the app never scrapes or invents dates at
// runtime. Update this file only after checking the official Registrar calendar.
export const ASU_ACADEMIC_TERMS: AcademicTerm[] = [
  {
    name: "Fall 2026",
    startsOn: "2026-08-20",
    classesEndOn: "2026-12-04",
    endsOn: "2026-12-12",
    sessions: [
      { name: "Session A", startsOn: "2026-08-20", endsOn: "2026-10-09" },
      { name: "Session B", startsOn: "2026-10-14", endsOn: "2026-12-04" },
      { name: "Session C", startsOn: "2026-08-20", endsOn: "2026-12-04" },
    ],
  },
  {
    name: "Spring 2027",
    startsOn: "2027-01-11",
    classesEndOn: "2027-04-30",
    endsOn: "2027-05-08",
    sessions: [
      { name: "Session A", startsOn: "2027-01-11", endsOn: "2027-03-02" },
      { name: "Session B", startsOn: "2027-03-15", endsOn: "2027-04-30" },
      { name: "Session C", startsOn: "2027-01-11", endsOn: "2027-04-30" },
    ],
  },
];

export const ASU_ACADEMIC_EVENTS: AcademicEvent[] = [
  {
    name: "Labor Day",
    kind: "closure",
    startsOn: "2026-09-07",
    endsOn: "2026-09-07",
  },
  {
    name: "Fall Break",
    kind: "break",
    startsOn: "2026-10-10",
    endsOn: "2026-10-13",
  },
  {
    name: "Veterans Day",
    kind: "closure",
    startsOn: "2026-11-11",
    endsOn: "2026-11-11",
  },
  {
    name: "Thanksgiving holiday",
    kind: "closure",
    startsOn: "2026-11-26",
    endsOn: "2026-11-27",
  },
  {
    name: "Fall study days",
    kind: "study",
    startsOn: "2026-12-05",
    endsOn: "2026-12-06",
  },
  {
    name: "Fall final exams",
    kind: "finals",
    startsOn: "2026-12-07",
    endsOn: "2026-12-12",
  },
  {
    name: "Inter-semester period",
    kind: "intersemester",
    startsOn: "2026-12-13",
    endsOn: "2027-01-10",
  },
  {
    name: "University holiday",
    kind: "closure",
    startsOn: "2026-12-24",
    endsOn: "2026-12-25",
  },
  {
    name: "Martin Luther King Jr. Day",
    kind: "closure",
    startsOn: "2027-01-18",
    endsOn: "2027-01-18",
  },
  {
    name: "Spring Break",
    kind: "break",
    startsOn: "2027-03-07",
    endsOn: "2027-03-14",
  },
  {
    name: "Spring study days",
    kind: "study",
    startsOn: "2027-05-01",
    endsOn: "2027-05-02",
  },
  {
    name: "Spring final exams",
    kind: "finals",
    startsOn: "2027-05-03",
    endsOn: "2027-05-08",
  },
];

function includesDate(dateKey: string, startsOn: string, endsOn: string) {
  return dateKey >= startsOn && dateKey <= endsOn;
}

export type AcademicContext = {
  term: AcademicTerm | null;
  event: AcademicEvent | null;
  isActiveTerm: boolean;
  isBreak: boolean;
  isStudyDay: boolean;
  isFinals: boolean;
  isClosure: boolean;
  isIntersemester: boolean;
};

export function getAcademicContext(dateKey: string): AcademicContext {
  const term =
    ASU_ACADEMIC_TERMS.find((candidate) =>
      includesDate(dateKey, candidate.startsOn, candidate.endsOn),
    ) ?? null;
  const matchingEvents = ASU_ACADEMIC_EVENTS.filter((candidate) =>
    includesDate(dateKey, candidate.startsOn, candidate.endsOn),
  );
  const event = matchingEvents[0] ?? null;

  return {
    term,
    event,
    isActiveTerm: term !== null,
    isBreak: matchingEvents.some((candidate) => candidate.kind === "break"),
    isStudyDay: matchingEvents.some((candidate) => candidate.kind === "study"),
    isFinals: matchingEvents.some((candidate) => candidate.kind === "finals"),
    isClosure: matchingEvents.some((candidate) => candidate.kind === "closure"),
    isIntersemester: matchingEvents.some(
      (candidate) => candidate.kind === "intersemester",
    ),
  };
}
