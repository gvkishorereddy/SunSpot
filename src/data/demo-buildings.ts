import type { SpecialHours, WeeklyHours } from "../lib/operating-hours";

const LIBRARY_HOURS_SOURCE =
  "https://lib.asu.edu/news/asu-library-hours-fall-2026";
const VERIFIED_ON = "2026-09-02";

const universityClosures: SpecialHours = {
  "2026-09-07": [],
  "2026-11-11": [],
  "2026-11-26": [],
  "2026-11-27": [],
  "2026-12-24": [],
  "2026-12-25": [],
  "2027-01-18": [],
};

function weekly(
  mondayThursday: [string, string],
  friday: [string, string] | null,
  saturday: [string, string] | null,
  sunday: [string, string] | null,
): WeeklyHours {
  const interval = ([open, close]: [string, string]) => [{ open, close }];
  return {
    monday: interval(mondayThursday),
    tuesday: interval(mondayThursday),
    wednesday: interval(mondayThursday),
    thursday: interval(mondayThursday),
    friday: friday ? interval(friday) : [],
    saturday: saturday ? interval(saturday) : [],
    sunday: sunday ? interval(sunday) : [],
  };
}

type DemoBuilding = {
  id: string;
  slug: string;
  name: string;
  campus: string;
  address: string;
  latitude: number;
  longitude: number;
  verification_radius_m: number;
  category: "Library" | "Student union" | "Student center" | "Event venue";
  weekly_hours: WeeklyHours;
  special_hours: SpecialHours;
  official_hours_url: string;
  location_source_url: string;
  hours_verified_on: string;
  baseline_crowd_level: number;
  timezone: "America/Phoenix";
};

function demoBuilding(
  sequence: number,
  building: Omit<DemoBuilding, "id" | "hours_verified_on" | "timezone">,
): DemoBuilding {
  return {
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    hours_verified_on: VERIFIED_ON,
    timezone: "America/Phoenix",
    ...building,
  };
}

export const DEMO_BUILDINGS: DemoBuilding[] = [
  demoBuilding(1, {
    slug: "downtown-phoenix-campus-library",
    name: "Downtown Phoenix campus Library",
    campus: "Downtown Phoenix",
    address: "411 N Central Ave, University Center Lower Level, Phoenix, AZ 85004",
    latitude: 33.45296,
    longitude: -112.07416,
    verification_radius_m: 300,
    category: "Library",
    weekly_hours: weekly(["08:00", "22:00"], ["08:00", "19:00"], null, ["10:00", "18:00"]),
    special_hours: universityClosures,
    official_hours_url: LIBRARY_HOURS_SOURCE,
    location_source_url: "https://lib.asu.edu/locations/downtown",
    baseline_crowd_level: 5,
  }),
  demoBuilding(2, {
    slug: "student-center-post-office-downtown",
    name: "Student Center @ the Post Office",
    campus: "Downtown Phoenix",
    address: "522 N Central Ave, Phoenix, AZ 85004",
    latitude: 33.4544697,
    longitude: -112.0746113,
    verification_radius_m: 300,
    category: "Student center",
    weekly_hours: weekly(["08:00", "20:00"], ["08:00", "20:00"], null, null),
    special_hours: { ...universityClosures, "2026-10-10": [], "2026-10-11": [] },
    official_hours_url: "https://eoss.asu.edu/downtown-student-center",
    location_source_url: "https://eoss.asu.edu/downtown-student-center",
    baseline_crowd_level: 5,
  }),
  demoBuilding(3, {
    slug: "polytechnic-campus-library",
    name: "Polytechnic campus Library",
    campus: "Polytechnic",
    address: "5988 S Backus Mall, Academic Center Lower Level, Mesa, AZ 85212",
    latitude: 33.30714,
    longitude: -111.67843,
    verification_radius_m: 300,
    category: "Library",
    weekly_hours: weekly(["08:00", "22:00"], ["08:00", "19:00"], ["11:00", "19:00"], ["12:00", "22:00"]),
    special_hours: universityClosures,
    official_hours_url: LIBRARY_HOURS_SOURCE,
    location_source_url: "https://lib.asu.edu/locations/polytechnic",
    baseline_crowd_level: 4,
  }),
  demoBuilding(4, {
    slug: "polytechnic-student-union",
    name: "Polytechnic Student Union",
    campus: "Polytechnic",
    address: "5999 S Backus Mall, Mesa, AZ 85212",
    latitude: 33.30716,
    longitude: -111.6770328,
    verification_radius_m: 350,
    category: "Student union",
    weekly_hours: weekly(["07:00", "20:00"], ["07:00", "20:00"], ["08:00", "20:00"], ["08:00", "20:00"]),
    special_hours: universityClosures,
    official_hours_url: "https://eoss.asu.edu/polyunion",
    location_source_url: "https://eoss.asu.edu/polyunion",
    baseline_crowd_level: 6,
  }),
  demoBuilding(5, {
    slug: "design-arts-library-tempe",
    name: "Design and the Arts Library",
    campus: "Tempe",
    address: "810 S Forest Mall, Design North 153, Tempe, AZ 85281",
    latitude: 33.4216,
    longitude: -111.93875,
    verification_radius_m: 300,
    category: "Library",
    weekly_hours: weekly(["08:00", "20:00"], ["08:00", "17:00"], null, ["13:00", "20:00"]),
    special_hours: universityClosures,
    official_hours_url: LIBRARY_HOURS_SOURCE,
    location_source_url: "https://lib.asu.edu/locations/design",
    baseline_crowd_level: 4,
  }),
  demoBuilding(6, {
    slug: "hayden-library-tempe",
    name: "Hayden Library",
    campus: "Tempe",
    address: "300 E Orange Mall, Tempe, AZ 85281",
    latitude: 33.4190755,
    longitude: -111.9346142,
    verification_radius_m: 300,
    category: "Library",
    weekly_hours: weekly(["07:00", "24:00"], ["07:00", "22:00"], ["09:00", "22:00"], ["10:00", "24:00"]),
    special_hours: universityClosures,
    official_hours_url: LIBRARY_HOURS_SOURCE,
    location_source_url: "https://lib.asu.edu/locations/hayden",
    baseline_crowd_level: 7,
  }),
  demoBuilding(7, {
    slug: "memorial-union-tempe",
    name: "Memorial Union",
    campus: "Tempe",
    address: "301 E Orange Mall, Tempe, AZ 85281",
    latitude: 33.4177504,
    longitude: -111.9343817,
    verification_radius_m: 350,
    category: "Student union",
    weekly_hours: weekly(["06:30", "22:00"], ["06:30", "22:00"], ["08:00", "22:00"], ["10:00", "22:00"]),
    special_hours: universityClosures,
    official_hours_url: "https://eoss.asu.edu/mu",
    location_source_url: "https://eoss.asu.edu/mu",
    baseline_crowd_level: 8,
  }),
  demoBuilding(8, {
    slug: "music-library-tempe",
    name: "Music Library",
    campus: "Tempe",
    address: "50 E Gammage Pkwy, Music Building W302, Tempe, AZ 85281",
    latitude: 33.41542,
    longitude: -111.93938,
    verification_radius_m: 300,
    category: "Library",
    weekly_hours: weekly(["08:00", "20:00"], ["08:00", "18:00"], ["13:00", "17:00"], ["13:00", "17:00"]),
    special_hours: universityClosures,
    official_hours_url: LIBRARY_HOURS_SOURCE,
    location_source_url: "https://lib.asu.edu/locations/music",
    baseline_crowd_level: 3,
  }),
  demoBuilding(9, {
    slug: "noble-library-tempe",
    name: "Noble Library",
    campus: "Tempe",
    address: "601 E Tyler Mall, Tempe, AZ 85281",
    latitude: 33.42,
    longitude: -111.9306,
    verification_radius_m: 300,
    category: "Library",
    weekly_hours: weekly(["07:00", "24:00"], ["07:00", "21:00"], ["10:00", "21:00"], ["10:00", "24:00"]),
    special_hours: universityClosures,
    official_hours_url: LIBRARY_HOURS_SOURCE,
    location_source_url: "https://lib.asu.edu/locations/noble",
    baseline_crowd_level: 6,
  }),
  demoBuilding(10, {
    slug: "student-pavilion-tempe",
    name: "Student Pavilion",
    campus: "Tempe",
    address: "400 E Orange St, Tempe, AZ 85287",
    latitude: 33.41855,
    longitude: -111.93346,
    verification_radius_m: 350,
    category: "Event venue",
    weekly_hours: weekly(["07:00", "21:00"], ["07:00", "21:00"], ["08:00", "17:00"], null),
    special_hours: { ...universityClosures, "2026-10-09": [], "2026-10-10": [], "2026-10-11": [], "2026-10-12": [], "2026-10-13": [] },
    official_hours_url: "https://eoss.asu.edu/student-pavilion",
    location_source_url: "https://tours.asu.edu/tempe/student-pavilion",
    baseline_crowd_level: 6,
  }),
  demoBuilding(11, {
    slug: "fletcher-library-west-valley",
    name: "Fletcher Library",
    campus: "West Valley",
    address: "4701 W Thunderbird Rd, Phoenix, AZ 85306",
    latitude: 33.6079,
    longitude: -112.15975,
    verification_radius_m: 350,
    category: "Library",
    weekly_hours: weekly(["07:30", "22:00"], ["07:30", "18:00"], null, ["11:00", "19:00"]),
    special_hours: universityClosures,
    official_hours_url: LIBRARY_HOURS_SOURCE,
    location_source_url: "https://lib.asu.edu/locations/fletcher",
    baseline_crowd_level: 4,
  }),
  demoBuilding(12, {
    slug: "university-center-west-valley",
    name: "University Center at West Valley",
    campus: "West Valley",
    address: "13590 N 47th Ave, Glendale, AZ 85306",
    latitude: 33.6089528,
    longitude: -112.1608974,
    verification_radius_m: 350,
    category: "Student center",
    weekly_hours: weekly(["07:00", "22:00"], ["07:00", "22:00"], ["10:00", "16:00"], ["10:00", "16:00"]),
    special_hours: universityClosures,
    official_hours_url: "https://eoss.asu.edu/UC",
    location_source_url: "https://eoss.asu.edu/UC",
    baseline_crowd_level: 5,
  }),
];
