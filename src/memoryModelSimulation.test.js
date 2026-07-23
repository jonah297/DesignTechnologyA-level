import {
  runIntensiveMemoryCohort,
  runStandardMemorySimulationSet,
} from "./memoryModelSimulation";

const getTimelinePoint = (timeline, label) => timeline.find((point) => point.label === label);
const getDailyPoint = (daily, day) => daily.find((point) => point.day === day);

const buildReportRows = (journeys) => [
  ["Journey", "Day", "Event", "Avg", "Learned avg", "Refresh", "Severe", "Stability", "Notes"],
  ...Object.entries(journeys).flatMap(([journeyName, journey]) =>
    journey.timeline.map((point) => [
      journeyName,
      point.day,
      point.label,
      `${point.averageMastery}%`,
      `${point.learnedAverageMastery}%`,
      `${point.refreshCards}/${point.learnedCards} (${point.refreshRate}%)`,
      point.severeDecayCards,
      `${point.averageStability}d`,
      point.notes,
    ])
  ),
];

const buildIntensiveReportRows = (cohort) => [
  [
    "Profile",
    "Learned",
    "Final overall avg",
    "Final learned avg",
    "Final refresh",
    "Max refresh",
    "Final stability",
    "Study days",
    "Quiet days",
    "Answered",
    "Accuracy",
  ],
  ...Object.values(cohort).map(({ profile, summary }) => [
    profile.label,
    summary.learnedCards,
    `${summary.finalAverageMastery}%`,
    `${summary.finalLearnedAverageMastery}%`,
    `${summary.finalRefreshRate}%`,
    `${summary.maxRefreshRate}%`,
    `${summary.finalAverageStability}d`,
    summary.studyDays,
    summary.quietDays,
    summary.totalAnswered,
    `${summary.totalAccuracy}%`,
  ]),
];

const flatMemoryModel = {
  buildNextMemoryRecord(previousRecord = {}, { isCorrect, now }) {
    const previousAttempts = previousRecord.attempts || 0;
    const mastery = isCorrect
      ? Math.min(62, (previousRecord.flatMastery || 0) + 9)
      : Math.max(18, (previousRecord.flatMastery || 35) - 6);

    return {
      attempts: previousAttempts + 1,
      flatMastery: mastery,
      lastSeen: now,
      status: isCorrect ? "correct" : "incorrect",
    };
  },
  calculateCardMastery(record) {
    return record ? record.flatMastery || 0 : 0;
  },
  getMemoryState(record) {
    return {
      stabilityDays: record ? 1 : 0,
    };
  },
};

describe("memory model simulated student journeys", () => {
  test("steady student decays after absence and improves through Memory Repair", () => {
    const { steadyStudent } = runStandardMemorySimulationSet();
    const timeline = steadyStudent.timeline;

    const baseline = getTimelinePoint(timeline, "Day 0: no prior mastery");
    const day3 = getTimelinePoint(timeline, "Day 3: normal review");
    const away = getTimelinePoint(timeline, "Day 7: four days away");
    const repaired = getTimelinePoint(timeline, "Day 8: second repair pass");
    const secondAway = getTimelinePoint(timeline, "Day 14: another six days away");
    const final = getTimelinePoint(timeline, "Day 15: consolidation review");

    expect(baseline.averageMastery).toBe(0);
    expect(day3.learnedCards).toBe(24);
    expect(day3.averageMastery).toBeGreaterThan(away.averageMastery);
    expect(away.refreshRate).toBeGreaterThan(day3.refreshRate);
    expect(repaired.averageMastery).toBeGreaterThan(away.averageMastery);
    expect(repaired.refreshRate).toBeLessThanOrEqual(away.refreshRate);
    expect(secondAway.refreshRate).toBeGreaterThan(repaired.refreshRate);
    expect(final.averageMastery).toBeGreaterThan(secondAway.averageMastery);
    expect(final.refreshRate).toBeLessThan(secondAway.refreshRate);
  });

  test("slacker/recovery student improves but keeps a larger refresh load", () => {
    const { slackerRecoveryStudent, steadyStudent } = runStandardMemorySimulationSet();
    const slackerTimeline = slackerRecoveryStudent.timeline;
    const steadyTimeline = steadyStudent.timeline;

    const weakStart = getTimelinePoint(slackerTimeline, "Day 0: weak first quiz session");
    const skippedDays = getTimelinePoint(slackerTimeline, "Day 5: skipped several days");
    const firstRepair = getTimelinePoint(slackerTimeline, "Day 5: responds to nudge");
    const secondSlip = getTimelinePoint(slackerTimeline, "Day 10: slips again");
    const final = getTimelinePoint(slackerTimeline, "Day 11: follow-up repair");
    const steadyFinal = getTimelinePoint(steadyTimeline, "Day 15: consolidation review");

    expect(weakStart.averageMastery).toBeGreaterThan(0);
    expect(skippedDays.refreshRate).toBeGreaterThanOrEqual(weakStart.refreshRate);
    expect(firstRepair.averageMastery).toBeGreaterThan(skippedDays.averageMastery);
    expect(secondSlip.refreshRate).toBeGreaterThan(firstRepair.refreshRate);
    expect(final.averageMastery).toBeGreaterThan(secondSlip.averageMastery);
    expect(final.refreshRate).toBeGreaterThanOrEqual(steadyFinal.refreshRate);
  });

  test("simulation timelines are reportable for tuning reviews", () => {
    const journeys = runStandardMemorySimulationSet();
    const rows = buildReportRows(journeys);

    if (process.env.MEMORY_SIM_REPORT === "1") {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(rows, null, 2));
    }

    // Kept as a compact smoke assertion; the markdown review records the readable version.
    expect(rows.length).toBeGreaterThan(15);
    expect(rows[0]).toEqual([
      "Journey",
      "Day",
      "Event",
      "Avg",
      "Learned avg",
      "Refresh",
      "Severe",
      "Stability",
      "Notes",
    ]);
  });

  test("simulation output is generated by the injected memory model, not fixed table data", () => {
    const realJourneys = runStandardMemorySimulationSet();
    const flatJourneys = runStandardMemorySimulationSet({ memory: flatMemoryModel });

    const realFinal = getTimelinePoint(
      realJourneys.steadyStudent.timeline,
      "Day 15: consolidation review"
    );
    const flatFinal = getTimelinePoint(
      flatJourneys.steadyStudent.timeline,
      "Day 15: consolidation review"
    );
    const realAway = getTimelinePoint(realJourneys.steadyStudent.timeline, "Day 7: four days away");
    const flatAway = getTimelinePoint(flatJourneys.steadyStudent.timeline, "Day 7: four days away");

    expect(realFinal.averageMastery).not.toBe(flatFinal.averageMastery);
    expect(realFinal.averageStability).not.toBe(flatFinal.averageStability);
    expect(realAway.refreshRate).not.toBe(flatAway.refreshRate);
  });
});

describe("intensive memory model cohort stress test", () => {
  test("full-year cohort metrics stay finite and bounded", () => {
    const cohort = runIntensiveMemoryCohort({ cardCount: 96, durationDays: 365 });

    Object.values(cohort).forEach(({ cardIds, daily, summary, timeline }) => {
      expect(daily).toHaveLength(366);
      expect(timeline.length).toBeGreaterThan(8);
      expect(summary.totalAnswered).toBeGreaterThan(0);
      expect(summary.studyDays + summary.quietDays).toBe(366);

      daily.forEach((point) => {
        [
          point.averageMastery,
          point.learnedAverageMastery,
          point.refreshRate,
          point.averageStability,
        ].forEach((value) => {
          expect(Number.isFinite(value)).toBe(true);
        });

        expect(point.averageMastery).toBeGreaterThanOrEqual(0);
        expect(point.averageMastery).toBeLessThanOrEqual(100);
        expect(point.learnedAverageMastery).toBeGreaterThanOrEqual(0);
        expect(point.learnedAverageMastery).toBeLessThanOrEqual(100);
        expect(point.refreshRate).toBeGreaterThanOrEqual(0);
        expect(point.refreshRate).toBeLessThanOrEqual(100);
        expect(point.learnedCards).toBeGreaterThanOrEqual(0);
        expect(point.learnedCards).toBeLessThanOrEqual(cardIds.length);
        expect(point.refreshCards).toBeGreaterThanOrEqual(0);
        expect(point.refreshCards).toBeLessThanOrEqual(point.learnedCards);
        expect(point.severeDecayCards).toBeGreaterThanOrEqual(0);
        expect(point.severeDecayCards).toBeLessThanOrEqual(point.learnedCards);
      });
    });
  });

  test("consistent study beats deadline cramming across the year", () => {
    const cohort = runIntensiveMemoryCohort({ cardCount: 96, durationDays: 365 });
    const consistent = cohort.consistentHigh.summary;
    const crammer = cohort.deadlineCrammer.summary;

    expect(consistent.learnedCards).toBe(96);
    expect(crammer.learnedCards).toBe(96);
    expect(consistent.finalLearnedAverageMastery).toBeGreaterThan(
      crammer.finalLearnedAverageMastery
    );
    expect(consistent.finalRefreshRate).toBeLessThan(crammer.finalRefreshRate);
    expect(consistent.finalAverageStability).toBeGreaterThan(crammer.finalAverageStability);
  });

  test("absence creates refresh pressure and repair reduces it", () => {
    const cohort = runIntensiveMemoryCohort({ cardCount: 96, durationDays: 365 });
    const absence = cohort.absenceRepair.daily;

    const beforeAbsence = getDailyPoint(absence, 20);
    const endOfAbsence = getDailyPoint(absence, 50);
    const afterRepairRun = getDailyPoint(absence, 70);

    expect(endOfAbsence.refreshRate).toBeGreaterThan(beforeAbsence.refreshRate);
    expect(endOfAbsence.learnedAverageMastery).toBeLessThan(beforeAbsence.learnedAverageMastery);
    expect(afterRepairRun.refreshRate).toBeLessThan(endOfAbsence.refreshRate);
    expect(afterRepairRun.learnedAverageMastery).toBeGreaterThan(
      endOfAbsence.learnedAverageMastery
    );
  });

  test("struggling consistent students improve without being made magically perfect", () => {
    const cohort = runIntensiveMemoryCohort({ cardCount: 96, durationDays: 365 });
    const struggling = cohort.strugglingConsistent.daily;
    const consistent = cohort.consistentHigh.summary;
    const day30 = getDailyPoint(struggling, 30);
    const day365 = getDailyPoint(struggling, 365);

    expect(day365.learnedCards).toBeGreaterThan(day30.learnedCards);
    expect(day365.learnedAverageMastery).toBeGreaterThan(day30.learnedAverageMastery);
    expect(day365.learnedAverageMastery).toBeLessThan(consistent.finalLearnedAverageMastery);
    expect(day365.refreshRate).toBeGreaterThan(0);
  });

  test("partial course coverage remains visible in whole-topic mastery", () => {
    const cohort = runIntensiveMemoryCohort({ cardCount: 96, durationDays: 365 });
    const steady = cohort.steadyAverage.summary;
    const inconsistent = cohort.inconsistentSlacker.summary;

    expect(inconsistent.learnedCards).toBeLessThan(steady.learnedCards);
    expect(inconsistent.finalAverageMastery).toBeLessThan(
      inconsistent.finalLearnedAverageMastery
    );
    expect(inconsistent.finalAverageMastery).toBeLessThan(steady.finalAverageMastery);
  });

  test("inconsistent student quiet spells create pressure and catch-up windows help", () => {
    const cohort = runIntensiveMemoryCohort({ cardCount: 96, durationDays: 365 });
    const inconsistent = cohort.inconsistentSlacker.daily;

    const beforeQuietSpell = getDailyPoint(inconsistent, 79);
    const afterQuietSpell = getDailyPoint(inconsistent, 96);
    const afterCatchUpWindow = getDailyPoint(inconsistent, 106);

    expect(afterQuietSpell.refreshRate).toBeGreaterThan(beforeQuietSpell.refreshRate);
    expect(afterQuietSpell.learnedAverageMastery).toBeLessThan(
      beforeQuietSpell.learnedAverageMastery
    );
    expect(afterCatchUpWindow.refreshRate).toBeLessThan(afterQuietSpell.refreshRate);
    expect(afterCatchUpWindow.learnedAverageMastery).toBeGreaterThan(
      afterQuietSpell.learnedAverageMastery
    );
  });

  test("intensive simulation output is produced by the memory model", () => {
    const realCohort = runIntensiveMemoryCohort({ cardCount: 48, durationDays: 120 });
    const flatCohort = runIntensiveMemoryCohort({
      cardCount: 48,
      durationDays: 120,
      memory: flatMemoryModel,
    });

    expect(realCohort.consistentHigh.summary.finalLearnedAverageMastery).not.toBe(
      flatCohort.consistentHigh.summary.finalLearnedAverageMastery
    );
    expect(realCohort.absenceRepair.summary.finalAverageStability).not.toBe(
      flatCohort.absenceRepair.summary.finalAverageStability
    );
    expect(realCohort.deadlineCrammer.summary.finalRefreshRate).not.toBe(
      flatCohort.deadlineCrammer.summary.finalRefreshRate
    );
  });

  test("intensive cohort report rows are printable for review", () => {
    const cohort = runIntensiveMemoryCohort({ cardCount: 96, durationDays: 365 });
    const rows = buildIntensiveReportRows(cohort);

    if (process.env.MEMORY_INTENSIVE_REPORT === "1") {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(rows, null, 2));
    }

    expect(rows[0]).toEqual([
      "Profile",
      "Learned",
      "Final overall avg",
      "Final learned avg",
      "Final refresh",
      "Max refresh",
      "Final stability",
      "Study days",
      "Quiet days",
      "Answered",
      "Accuracy",
    ]);
    expect(rows.length).toBeGreaterThan(5);
  });
});
