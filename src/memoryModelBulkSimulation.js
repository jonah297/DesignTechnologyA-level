import {
  applySimulatedStudySession,
  createSimulationCardIds,
  getMemorySimulationSnapshot,
} from "./memoryModelSimulation";
import {
  calculateEngagementAnalytics,
  evaluateStudentSupport,
  summariseSupportActions,
} from "./studentSupportAlgorithm";

const hashToUnit = (value = "") => {
  const hash = String(value)
    .split("")
    .reduce((acc, character) => (acc * 33 + character.charCodeAt(0)) >>> 0, 5381);
  return (hash % 10000) / 10000;
};

const round = (value, places = 1) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const TWO_YEAR_OPEN_DATA_CALIBRATION = {
  cardCount: 192,
  cohortSize: 50,
  durationDays: 730,
  examReadinessDay: 616,
  sources: [
    {
      name: "Open University Learning Analytics Dataset",
      use: "Daily VLE activity, assessment timing, and final-result outcome bands.",
      url: "https://analyse.kmi.open.ac.uk/open_dataset",
    },
    {
      name: "Kuzilek, Hlosta and Zdrahal (2017), Scientific Data",
      use: "Dataset structure: 32,593 learners, 22 course presentations, daily click summaries, assessment results.",
      url: "https://doi.org/10.1038/sdata.2017.171",
    },
    {
      name: "ASSISTments public response datasets",
      use: "Student attempt/correctness style: correctness, prior successes/failures, hints/support behaviour.",
      url: "https://sites.google.com/site/assistmentsdata/assistments-pfa-data",
    },
  ],
  roundedOutcomeMixFor50: {
    distinctionLike: 5,
    passLike: 19,
    failLike: 11,
    lowEngagementLike: 15,
  },
};

export const TWO_YEAR_ASSIGNMENT_DAYS = [
  28, 56, 84, 126, 154, 182, 224, 252, 392, 420, 448, 490, 518, 546, 574, 602,
];
const BULK_TARGET_XP = 9000;

const OUTCOME_BANDS = {
  distinctionLike: {
    label: "Distinction-like",
    baseAccuracy: 0.82,
    catchUpResponsiveness: 0.9,
    consistency: 0.58,
    dailyVolume: 16,
    maxCoverage: 1,
    nudgeAfterDays: 5,
    refreshThreshold: 42,
  },
  passLike: {
    label: "Pass-like",
    baseAccuracy: 0.66,
    catchUpResponsiveness: 0.66,
    consistency: 0.38,
    dailyVolume: 13,
    maxCoverage: 1,
    nudgeAfterDays: 7,
    refreshThreshold: 55,
  },
  failLike: {
    label: "Fail-like",
    baseAccuracy: 0.5,
    catchUpResponsiveness: 0.42,
    consistency: 0.17,
    dailyVolume: 10,
    maxCoverage: 0.7,
    nudgeAfterDays: 10,
    refreshThreshold: 68,
  },
  lowEngagementLike: {
    label: "Low-engagement-like",
    baseAccuracy: 0.46,
    catchUpResponsiveness: 0.22,
    consistency: 0.08,
    dailyVolume: 7,
    maxCoverage: 0.34,
    nudgeAfterDays: 14,
    refreshThreshold: 76,
  },
};

const FIRST_NAMES = [
  "Aisha",
  "Ben",
  "Cara",
  "Daniel",
  "Elena",
  "Finn",
  "Grace",
  "Hassan",
  "Ivy",
  "Jack",
  "Keira",
  "Leo",
  "Mia",
  "Noah",
  "Olivia",
  "Priya",
  "Ruby",
  "Sam",
  "Talia",
  "Victor",
];

const LAST_NAMES = [
  "Ahmed",
  "Bennett",
  "Carter",
  "Clarke",
  "Davies",
  "Edwards",
  "Foster",
  "Green",
  "Harris",
  "Iqbal",
  "Jones",
  "Khan",
  "Lewis",
  "Moore",
  "Patel",
  "Price",
  "Roberts",
  "Singh",
  "Taylor",
  "Wilson",
];

const buildOutcomeSequence = (cohortSize) => {
  const baseSequence = Object.entries(TWO_YEAR_OPEN_DATA_CALIBRATION.roundedOutcomeMixFor50)
    .flatMap(([outcomeBand, count]) => Array.from({ length: count }, () => outcomeBand));

  if (cohortSize === baseSequence.length) return baseSequence;

  return Array.from({ length: cohortSize }, (_, index) => {
    const unit = (index + 0.5) / cohortSize;
    if (unit <= 0.093) return "distinctionLike";
    if (unit <= 0.472) return "passLike";
    if (unit <= 0.688) return "failLike";
    return "lowEngagementLike";
  });
};

const getAcademicIntensity = (day) => {
  const yearDay = day % 365;
  const weekDay = day % 7;
  const weekendMultiplier = weekDay >= 5 ? 0.48 : 1;
  const isSummer = yearDay >= 286;
  const isWinterBreak = yearDay >= 105 && yearDay <= 118;
  const isSpringBreak = yearDay >= 211 && yearDay <= 224;
  const isHalfTerm =
    (yearDay >= 49 && yearDay <= 55) ||
    (yearDay >= 161 && yearDay <= 167) ||
    (yearDay >= 252 && yearDay <= 258);

  if (day > 630) return 0.08 * weekendMultiplier;
  if (isSummer) return 0.04 * weekendMultiplier;
  if (isWinterBreak || isSpringBreak) return 0.18 * weekendMultiplier;
  if (isHalfTerm) return 0.32 * weekendMultiplier;
  return weekendMultiplier;
};

const getDeadlineBoost = (day) => {
  const nearestDistance = TWO_YEAR_ASSIGNMENT_DAYS.reduce(
    (closest, dueDay) => Math.min(closest, Math.abs(dueDay - day)),
    Infinity
  );
  if (nearestDistance <= 2) return 0.2;
  if (nearestDistance <= 5) return 0.12;
  if (nearestDistance <= 10) return 0.06;
  return 0;
};

const getExamBoost = (day) => {
  if (day < 545 || day > 630) return 0;
  return interpolate(0.06, 0.24, (day - 545) / 85);
};

const interpolate = (start, end, progress) =>
  start + (end - start) * Math.max(0, Math.min(1, progress));

const getLongestQuietRun = (daily) => {
  let current = 0;
  let longest = 0;
  daily.forEach((day) => {
    current = day.answered > 0 ? 0 : current + 1;
    longest = Math.max(longest, current);
  });
  return longest;
};

const getAverage = (values) =>
  values.length > 0 ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

const getExpectedCoverage = (day, maxCoverage) => {
  const examTargetDay = 616;
  return clamp((day / examTargetDay) * maxCoverage, 0, maxCoverage);
};

const getAssignmentCards = (cardIds, assignmentIndex) => {
  const cardsPerAssignment = Math.max(1, Math.floor(cardIds.length / TWO_YEAR_ASSIGNMENT_DAYS.length));
  const start = assignmentIndex * cardsPerAssignment;
  return cardIds.slice(start, start + cardsPerAssignment);
};

const hasMetAssignmentTarget = (snapshot) =>
  snapshot.learnedCards >= Math.max(1, Math.ceil(0.8 * 12)) &&
  snapshot.learnedAverageMastery >= 78 &&
  snapshot.refreshRate <= 45;

export const createTwoYearBulkStudents = ({ cohortSize = 50, seed = "two-year-bulk" } = {}) => {
  const sequence = buildOutcomeSequence(cohortSize);
  return sequence.map((outcomeBand, index) => {
    const profile = OUTCOME_BANDS[outcomeBand];
    const name = `${FIRST_NAMES[index % FIRST_NAMES.length]} ${
      LAST_NAMES[(index * 7) % LAST_NAMES.length]
    }`;
    const jitter = hashToUnit(`${seed}-${index}-${outcomeBand}`);
    const secondaryJitter = hashToUnit(`${seed}-${outcomeBand}-${index}-secondary`);
    return {
      baseAccuracy: clamp(profile.baseAccuracy + (jitter - 0.5) * 0.1, 0.18, 0.96),
      catchUpResponsiveness: clamp(
        profile.catchUpResponsiveness + (secondaryJitter - 0.5) * 0.16,
        0.05,
        0.96
      ),
      consistency: clamp(profile.consistency + (jitter - 0.5) * 0.12, 0.02, 0.88),
      dailyVolume: Math.max(4, Math.round(profile.dailyVolume + (secondaryJitter - 0.5) * 4)),
      displayName: name,
      id: `bulk-student-${String(index + 1).padStart(2, "0")}`,
      lowEngagementDay:
        outcomeBand === "lowEngagementLike" ? 110 + Math.floor(jitter * 240) : null,
      maxCoverage: clamp(profile.maxCoverage + (secondaryJitter - 0.5) * 0.08, 0.12, 1),
      nudgeAfterDays: profile.nudgeAfterDays,
      outcomeBand,
      outcomeLabel: profile.label,
      refreshThreshold: profile.refreshThreshold,
    };
  });
};

export const runTwoYearBulkStudent = ({
  cardCount = TWO_YEAR_OPEN_DATA_CALIBRATION.cardCount,
  durationDays = TWO_YEAR_OPEN_DATA_CALIBRATION.durationDays,
  memory,
  student,
}) => {
  const cardIds = createSimulationCardIds(cardCount);
  const assignmentStates = TWO_YEAR_ASSIGNMENT_DAYS.map((dueDay, index) => ({
    dueDay,
    index,
    status: "pending",
  }));
  let progress = {};
  let inactiveDays = 0;
  let nudgeEvents = 0;
  let nudgeStudyResponses = 0;
  let totalAnswered = 0;
  let totalCorrect = 0;
  let totalSessions = 0;
  const daily = [];

  for (let day = 0; day <= durationDays; day += 1) {
    const before = getMemorySimulationSnapshot(
      `Day ${day}: before study`,
      day,
      progress,
      cardIds,
      { memory }
    );
    const desiredCoverage = getExpectedCoverage(day, student.maxCoverage);
    const currentCoverage = cardIds.length > 0 ? before.learnedCards / cardIds.length : 0;
    const coverageLimitReached = currentCoverage >= student.maxCoverage;
    const coverageBehind = currentCoverage + 0.08 < desiredCoverage;
    const shouldNudge =
      day < 630 &&
      (inactiveDays >= student.nudgeAfterDays ||
        before.refreshRate >= student.refreshThreshold ||
        coverageBehind);
    const nudgeResponse =
      shouldNudge &&
      hashToUnit(`${student.id}-nudge-response-${day}`) < student.catchUpResponsiveness;
    const lowEngagementPenalty =
      student.lowEngagementDay !== null && day > student.lowEngagementDay ? 0.22 : 1;
    const studyProbability = clamp(
      student.consistency * getAcademicIntensity(day) * lowEngagementPenalty +
        getDeadlineBoost(day) +
        getExamBoost(day) +
        (nudgeResponse ? 0.22 * student.catchUpResponsiveness : 0),
      0,
      0.97
    );
    const shouldStudy =
      hashToUnit(`${student.id}-study-${day}`) < studyProbability || nudgeResponse;
    let dayAnswered = 0;
    let dayCorrect = 0;
    let daySessions = 0;

    if (shouldNudge) nudgeEvents += 1;

    if (shouldStudy) {
      if (nudgeResponse) nudgeStudyResponses += 1;
      const dayAccuracy = clamp(
        student.baseAccuracy +
          interpolate(0, 0.1, day / 616) -
          Math.max(0, before.refreshRate - 55) * 0.0015 +
          (hashToUnit(`${student.id}-accuracy-${day}`) - 0.5) * 0.08,
        0.12,
        0.97
      );
      const volume = Math.max(
        3,
        Math.round(student.dailyVolume * (nudgeResponse ? 1.28 : 1) * (getDeadlineBoost(day) ? 1.2 : 1))
      );
      const repairCount = before.refreshRate > 35 ? Math.ceil(volume * 0.55) : Math.ceil(volume * 0.3);
      const newCount = coverageLimitReached
        ? 0
        : coverageBehind
        ? Math.ceil(volume * 0.45)
        : Math.ceil(volume * 0.08);
      const reviewCount = Math.max(1, volume - repairCount - newCount);
      const actions = [
        { count: repairCount, mode: "flashcard", strategy: "repair" },
        { count: newCount, mode: "flashcard", strategy: "new" },
        { count: reviewCount, mode: day % 13 === 0 ? "blitz" : "flashcard", strategy: "review" },
      ];

      actions.forEach((action) => {
        if (action.count <= 0) return;
        const result = applySimulatedStudySession(progress, cardIds, {
          accuracy: action.strategy === "new" ? Math.max(0.05, dayAccuracy - 0.05) : dayAccuracy,
          count: action.count,
          day,
          memory,
          mode: action.mode,
          seed: `${student.id}-${action.strategy}-${day}`,
          strategy: action.strategy,
        });
        progress = result.progress;
        dayAnswered += result.touched;
        dayCorrect += result.correct;
        if (result.touched > 0) daySessions += 1;
      });
    }

    totalAnswered += dayAnswered;
    totalCorrect += dayCorrect;
    totalSessions += daySessions;
    inactiveDays = dayAnswered > 0 ? 0 : inactiveDays + 1;

    assignmentStates.forEach((assignment) => {
      if (assignment.status !== "pending") return;
      const assignmentCards = getAssignmentCards(cardIds, assignment.index);
      if (day !== assignment.dueDay && day !== assignment.dueDay + 7) return;
      const assignmentSnapshot = getMemorySimulationSnapshot(
        `Assignment ${assignment.index + 1}`,
        day,
        progress,
        assignmentCards,
        { memory }
      );
      if (hasMetAssignmentTarget(assignmentSnapshot)) {
        assignment.status = day <= assignment.dueDay ? "onTime" : "late";
        assignment.completedDay = day;
      } else if (day >= assignment.dueDay + 7) {
        assignment.status = "missed";
      }
      assignment.snapshot = assignmentSnapshot;
    });

    const after = getMemorySimulationSnapshot(
      `Day ${day}: end of day`,
      day,
      progress,
      cardIds,
      {
        memory,
        notes: dayAnswered > 0 ? `${dayAnswered} answered.` : "No study recorded.",
      }
    );
    daily.push({
      ...after,
      answered: dayAnswered,
      correct: dayCorrect,
      nudgeResponse,
      nudgeTriggered: shouldNudge,
      sessions: daySessions,
    });
  }

  const final = daily[daily.length - 1];
  const examReadinessDay = Math.min(
    TWO_YEAR_OPEN_DATA_CALIBRATION.examReadinessDay,
    daily.length - 1
  );
  const examReadiness = daily[examReadinessDay];
  const assignmentsOnTime = assignmentStates.filter((item) => item.status === "onTime").length;
  const assignmentsLate = assignmentStates.filter((item) => item.status === "late").length;
  const assignmentsMissed = assignmentStates.filter((item) => item.status === "missed").length;
  const totalAccuracy = totalAnswered > 0 ? round((totalCorrect / totalAnswered) * 100) : 0;

  return {
    assignments: assignmentStates,
    cardIds,
    daily,
    final,
    progress,
    student,
    summary: {
      assignmentsLate,
      assignmentsMissed,
      assignmentsOnTime,
      examAverageMastery: examReadiness.averageMastery,
      examAverageStability: examReadiness.averageStability,
      examCoverageRate: round((examReadiness.learnedCards / cardIds.length) * 100),
      examLearnedAverageMastery: examReadiness.learnedAverageMastery,
      examRefreshRate: examReadiness.refreshRate,
      coverageRate: round((final.learnedCards / cardIds.length) * 100),
      finalAverageMastery: final.averageMastery,
      finalAverageStability: final.averageStability,
      finalLearnedAverageMastery: final.learnedAverageMastery,
      finalRefreshRate: final.refreshRate,
      learnedCards: final.learnedCards,
      longestQuietRun: getLongestQuietRun(daily),
      nudgeEvents,
      nudgeStudyResponses,
      quietDays: daily.filter((day) => day.answered === 0).length,
      studyDays: daily.filter((day) => day.answered > 0).length,
      totalAccuracy,
      totalAnswered,
      totalSessions,
    },
  };
};

export const summariseTwoYearBulkCohort = (students) => {
  const bands = {};
  students.forEach((studentRun) => {
    const band = studentRun.student.outcomeBand;
    bands[band] = bands[band] || {
      count: 0,
      finalAverageMastery: 0,
      examAverageMastery: 0,
      examCoverageRate: 0,
      examRefreshRate: 0,
      coverageRate: 0,
      studyDays: 0,
      assignmentsOnTime: 0,
      assignmentsLate: 0,
      assignmentsMissed: 0,
      nudgeEvents: 0,
    };
    bands[band].count += 1;
    bands[band].finalAverageMastery += studentRun.summary.finalAverageMastery;
    bands[band].examAverageMastery += studentRun.summary.examAverageMastery;
    bands[band].examCoverageRate += studentRun.summary.examCoverageRate;
    bands[band].examRefreshRate += studentRun.summary.examRefreshRate;
    bands[band].coverageRate += studentRun.summary.coverageRate;
    bands[band].studyDays += studentRun.summary.studyDays;
    bands[band].assignmentsOnTime += studentRun.summary.assignmentsOnTime;
    bands[band].assignmentsLate += studentRun.summary.assignmentsLate;
    bands[band].assignmentsMissed += studentRun.summary.assignmentsMissed;
    bands[band].nudgeEvents += studentRun.summary.nudgeEvents;
  });

  Object.keys(bands).forEach((band) => {
    const item = bands[band];
    item.finalAverageMastery = round(item.finalAverageMastery / item.count);
    item.examAverageMastery = round(item.examAverageMastery / item.count);
    item.examCoverageRate = round(item.examCoverageRate / item.count);
    item.examRefreshRate = round(item.examRefreshRate / item.count);
    item.coverageRate = round(item.coverageRate / item.count);
    item.studyDays = round(item.studyDays / item.count);
  });

  return bands;
};

export const buildTwoYearBulkStudentRows = (cohort) =>
  cohort.students.map(({ student, summary }) => {
    const nudgeResponseRate =
      summary.nudgeEvents > 0
        ? round((summary.nudgeStudyResponses / summary.nudgeEvents) * 100)
        : 0;
    const support = evaluateStudentSupport({
      ...summary,
      nudgeResponseRate,
    });
    const estimatedXpTotal = Math.round(
      summary.totalAnswered * 7 +
        summary.assignmentsOnTime * 80 +
        summary.assignmentsLate * 45 +
        summary.nudgeStudyResponses * 5
    );
    const engagement = calculateEngagementAnalytics({
      ...summary,
      expectedStudyDays: Math.round(TWO_YEAR_OPEN_DATA_CALIBRATION.examReadinessDay / 2.35),
      expectedXp: BULK_TARGET_XP,
      nudgeResponseRate,
      readinessScore: support.readinessScore,
      studentXp: estimatedXpTotal,
      targetXp: BULK_TARGET_XP,
    });

    return {
      assignmentsLate: summary.assignmentsLate,
      assignmentsMissed: summary.assignmentsMissed,
      assignmentsOnTime: summary.assignmentsOnTime,
      coverageRate: summary.coverageRate,
      displayName: student.displayName,
      examAverageMastery: summary.examAverageMastery,
      examAverageStability: summary.examAverageStability,
      examCoverageRate: summary.examCoverageRate,
      examLearnedAverageMastery: summary.examLearnedAverageMastery,
      examRefreshRate: summary.examRefreshRate,
      finalAverageMastery: summary.finalAverageMastery,
      finalAverageStability: summary.finalAverageStability,
      finalLearnedAverageMastery: summary.finalLearnedAverageMastery,
      finalRefreshRate: summary.finalRefreshRate,
      engagementPaceLabel: engagement.engagementPaceLabel,
      engagementPacePercent: engagement.engagementPacePercent,
      estimatedXpTotal,
      learnedCards: summary.learnedCards,
      longestQuietRun: summary.longestQuietRun,
      nudgeEvents: summary.nudgeEvents,
      nudgeResponseRate,
      nudgeStudyResponses: summary.nudgeStudyResponses,
      outcomeBand: student.outcomeBand,
      outcomeLabel: student.outcomeLabel,
      quietDays: summary.quietDays,
      readinessLabel: support.readinessLabel,
      readinessScore: support.readinessScore,
      studentId: student.id,
      studyDays: summary.studyDays,
      supportAction: support.action,
      supportReason: support.reasons.join(" "),
      supportSeverity: support.severity,
      totalAccuracy: summary.totalAccuracy,
      totalAnswered: summary.totalAnswered,
      totalSessions: summary.totalSessions,
      xpEfficiencyLabel: engagement.xpEfficiencyLabel,
      xpEfficiencyScore: engagement.xpEfficiencyScore,
      xpEfficiencyTone: engagement.xpEfficiencyTone,
    };
  });

export const buildTwoYearBulkBandRows = (cohort) =>
  Object.entries(cohort.summaryByBand).map(([outcomeBand, summary]) => ({
    assignmentsLate: summary.assignmentsLate,
    assignmentsMissed: summary.assignmentsMissed,
    assignmentsOnTime: summary.assignmentsOnTime,
    count: summary.count,
    coverageRate: summary.coverageRate,
    finalAverageMastery: summary.finalAverageMastery,
    examAverageMastery: summary.examAverageMastery,
    examCoverageRate: summary.examCoverageRate,
    examRefreshRate: summary.examRefreshRate,
    outcomeBand,
    studyDays: summary.studyDays,
    totalNudgeEvents: summary.nudgeEvents,
  }));

export const buildTwoYearBulkSampledDailyRows = (cohort, sampleEveryDays = 14) =>
  cohort.students.flatMap(({ daily, student }) =>
    daily
      .filter((point) => point.day % sampleEveryDays === 0 || point.day === cohort.durationDays)
      .map((point) => ({
        answered: point.answered,
        averageMastery: point.averageMastery,
        day: point.day,
        learnedAverageMastery: point.learnedAverageMastery,
        learnedCards: point.learnedCards,
        nudgeResponse: point.nudgeResponse,
        nudgeTriggered: point.nudgeTriggered,
        outcomeBand: student.outcomeBand,
        refreshRate: point.refreshRate,
        studentId: student.id,
      }))
  );

export const buildTwoYearBulkTuningFlags = (cohort) => {
  const studentRows = buildTwoYearBulkStudentRows(cohort);
  const highLearnedLowCoverage = studentRows.filter(
    (row) => row.examLearnedAverageMastery >= 80 && row.examCoverageRate < 60
  );
  const highNudgeLowResponse = studentRows.filter(
    (row) => row.nudgeEvents >= 80 && row.nudgeResponseRate < 35
  );
  const highRefreshDespiteStudy = studentRows.filter(
    (row) => row.studyDays >= 90 && row.examRefreshRate >= 35
  );
  const assignmentConcern = studentRows.filter((row) => row.assignmentsMissed >= 8);
  const supportActionCounts = summariseSupportActions(studentRows);
  const bandRows = buildTwoYearBulkBandRows(cohort);
  const lowEngagement = bandRows.find((row) => row.outcomeBand === "lowEngagementLike");
  const distinction = bandRows.find((row) => row.outcomeBand === "distinctionLike");
  const separationLooksHealthy =
    distinction && lowEngagement
      ? distinction.examAverageMastery - lowEngagement.examAverageMastery >= 35
      : false;

  return {
    assignmentConcernCount: assignmentConcern.length,
    highLearnedLowCoverageCount: highLearnedLowCoverage.length,
    highNudgeLowResponseCount: highNudgeLowResponse.length,
    highRefreshDespiteStudyCount: highRefreshDespiteStudy.length,
    supportActionCounts,
    recommendedAlgorithmActions: [
      highLearnedLowCoverage.length > 0
        ? "Keep top-line mastery coverage-weighted. Learned-card mastery alone overstates students who only attempt part of the course."
        : "Coverage and learned-card mastery are aligned enough for this run.",
      highNudgeLowResponse.length > 0
        ? "Tune automated nudges for low-engagement students: repeated reminders alone are not enough, so escalate wording or teacher visibility after repeated non-response."
        : "Nudge response rate is acceptable in this run.",
      highRefreshDespiteStudy.length > 0
        ? "Inspect repair thresholds for students who study often but retain high refresh load."
        : "Repair thresholds look acceptable for active students.",
      assignmentConcern.length > 0
        ? "Teacher dashboards should make missed assignment count visible beside mastery."
        : "Assignment completion does not need extra algorithm tuning from this run.",
      separationLooksHealthy
        ? "Outcome-band separation is healthy: high-engagement and low-engagement learners do not collapse into the same mastery band."
        : "Outcome-band separation is weak; review activity calibration before trusting pilot analytics.",
    ],
    sampleStudentIds: {
      assignmentConcern: assignmentConcern.slice(0, 5).map((row) => row.studentId),
      highLearnedLowCoverage: highLearnedLowCoverage.slice(0, 5).map((row) => row.studentId),
      highNudgeLowResponse: highNudgeLowResponse.slice(0, 5).map((row) => row.studentId),
      highRefreshDespiteStudy: highRefreshDespiteStudy.slice(0, 5).map((row) => row.studentId),
    },
  };
};

export const buildTwoYearBulkAnalysisDataset = (cohort) => {
  const studentRows = buildTwoYearBulkStudentRows(cohort);
  const bandRows = buildTwoYearBulkBandRows(cohort);
  const sampledDailyRows = buildTwoYearBulkSampledDailyRows(cohort);

  return {
    bandRows,
    calibration: cohort.calibration,
    cohortMetrics: {
      averageAssignmentsMissed: getAverage(studentRows.map((row) => row.assignmentsMissed)),
      averageCoverageRate: getAverage(studentRows.map((row) => row.coverageRate)),
      averageExamCoverageRate: getAverage(studentRows.map((row) => row.examCoverageRate)),
      averageExamMastery: getAverage(studentRows.map((row) => row.examAverageMastery)),
      averageExamRefreshRate: getAverage(studentRows.map((row) => row.examRefreshRate)),
      averageFinalMastery: getAverage(studentRows.map((row) => row.finalAverageMastery)),
      averageNudgeResponseRate: getAverage(studentRows.map((row) => row.nudgeResponseRate)),
      averageReadinessScore: getAverage(studentRows.map((row) => row.readinessScore)),
      averageStudyDays: getAverage(studentRows.map((row) => row.studyDays)),
      cohortSize: studentRows.length,
      durationDays: cohort.durationDays,
    },
    sampledDailyRows,
    studentRows,
    tuningFlags: buildTwoYearBulkTuningFlags(cohort),
  };
};

export const rowsToCsv = (rows) => {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escapeCell = (value) => {
    const stringValue = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
  };
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(",")),
  ].join("\n");
};

export const runTwoYearBulkMemoryCohort = (options = {}) => {
  const students = options.students || createTwoYearBulkStudents(options);
  const runs = students.map((student) =>
    runTwoYearBulkStudent({
      cardCount: options.cardCount || TWO_YEAR_OPEN_DATA_CALIBRATION.cardCount,
      durationDays: options.durationDays || TWO_YEAR_OPEN_DATA_CALIBRATION.durationDays,
      memory: options.memory,
      student,
    })
  );

  return {
    calibration: TWO_YEAR_OPEN_DATA_CALIBRATION,
    durationDays: options.durationDays || TWO_YEAR_OPEN_DATA_CALIBRATION.durationDays,
    students: runs,
    summaryByBand: summariseTwoYearBulkCohort(runs),
  };
};
