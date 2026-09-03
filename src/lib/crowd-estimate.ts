import { getAcademicContext } from "../data/asu-academic-calendar";
import {
  evaluateBuildingHours,
  type BuildingHoursInput,
  type OperatingStatus,
} from "./operating-hours";
import { crowdLabel, summarizeReports } from "./study-scout";

export type EstimateFactor = {
  label: string;
  delta: number;
};

export type CrowdSignal = {
  score: number | null;
  label: string;
  isEstimated: boolean;
  sourceLabel: "Student reports" | "Estimated" | "Closed" | "Unavailable";
  explanation: string;
  factors: EstimateFactor[];
};

export type CrowdBuildingInput = BuildingHoursInput & {
  baseline_crowd_level: number;
};

function clampScore(score: number) {
  return Math.max(1, Math.min(10, Math.round(score)));
}

function timeFactor(localMinute: number): EstimateFactor {
  if (localMinute >= 7 * 60 && localMinute < 10 * 60) {
    return { label: "Weekday morning", delta: 1 };
  }
  if (localMinute >= 10 * 60 && localMinute < 16 * 60) {
    return { label: "Weekday midday", delta: 2 };
  }
  if (localMinute >= 16 * 60 && localMinute < 21 * 60) {
    return { label: "Weekday evening", delta: 1 };
  }
  return { label: "Late or early hours", delta: -1 };
}

export function estimateCrowdLevel(
  building: CrowdBuildingInput,
  now = new Date(),
  suppliedHours?: OperatingStatus,
): CrowdSignal {
  const hours = suppliedHours ?? evaluateBuildingHours(building, now);
  if (hours.status === "unknown") {
    return {
      score: null,
      label: "Unavailable",
      isEstimated: true,
      sourceLabel: "Unavailable",
      explanation: "An estimate needs valid operating hours.",
      factors: [],
    };
  }
  if (!hours.isOpen) {
    return {
      score: null,
      label: "Closed",
      isEstimated: true,
      sourceLabel: "Closed",
      explanation: "No crowd estimate is shown while this building is closed.",
      factors: [],
    };
  }

  const context = getAcademicContext(hours.dateKey);
  const factors: EstimateFactor[] = [
    { label: `Building baseline ${building.baseline_crowd_level}/10`, delta: 0 },
  ];

  let score = building.baseline_crowd_level;

  if (context.isClosure) {
    factors.push({ label: context.event?.name ?? "University closure", delta: -2 });
    score -= 2;
  }

  if (context.isBreak) {
    factors.push({ label: context.event?.name ?? "Academic break", delta: -2 });
    score -= 2;
  } else if (!context.isActiveTerm) {
    factors.push({ label: "Outside an active term", delta: -2 });
    score -= 2;
  } else {
    factors.push({ label: context.term?.name ?? "Active semester", delta: 0 });
  }

  if (hours.isWeekend) {
    factors.push({ label: "Weekend", delta: -1 });
    score -= 1;
  } else {
    const factor = timeFactor(hours.localMinute);
    factors.push(factor);
    score += factor.delta;
  }

  if (context.isStudyDay) {
    factors.push({ label: "Study day", delta: 2 });
    score += 2;
  }
  if (context.isFinals) {
    factors.push({ label: "Final exams", delta: 3 });
    score += 3;
  }
  if (
    hours.minutesUntilClose !== null &&
    hours.minutesUntilClose > 0 &&
    hours.minutesUntilClose <= 30
  ) {
    factors.push({ label: "Closing within 30 minutes", delta: -2 });
    score -= 2;
  }

  const estimatedScore = clampScore(score);
  const meaningfulFactors = factors
    .slice(1)
    .map((factor) => factor.label.toLowerCase())
    .slice(0, 3);

  return {
    score: estimatedScore,
    label: crowdLabel(estimatedScore),
    isEstimated: true,
    sourceLabel: "Estimated",
    explanation: `Estimated from the building baseline${
      meaningfulFactors.length ? `, ${meaningfulFactors.join(", ")}` : ""
    }.`,
    factors,
  };
}

export function resolveCrowdSignal(
  building: CrowdBuildingInput,
  reports: Array<{ crowd_level: number }>,
  now = new Date(),
  suppliedHours?: OperatingStatus,
): CrowdSignal {
  if (reports.length > 0) {
    const { averageCrowdLevel, count } = summarizeReports(reports);
    return {
      score: averageCrowdLevel,
      label: crowdLabel(averageCrowdLevel),
      isEstimated: false,
      sourceLabel: "Student reports",
      explanation: `Based on ${count} student ${count === 1 ? "report" : "reports"} from the last hour.`,
      factors: [],
    };
  }

  return estimateCrowdLevel(building, now, suppliedHours);
}
