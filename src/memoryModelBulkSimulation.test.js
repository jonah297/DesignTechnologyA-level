import fs from "fs";
import path from "path";

import {
  buildTwoYearBulkAnalysisDataset,
  rowsToCsv,
  runTwoYearBulkMemoryCohort,
  TWO_YEAR_OPEN_DATA_CALIBRATION,
} from "./memoryModelBulkSimulation";

jest.setTimeout(120000);

const isFullBulkRun = process.env.RUN_BULK_SIM === "1";
const simulationConfig = isFullBulkRun
  ? {
      cardCount: TWO_YEAR_OPEN_DATA_CALIBRATION.cardCount,
      cohortSize: TWO_YEAR_OPEN_DATA_CALIBRATION.cohortSize,
      durationDays: TWO_YEAR_OPEN_DATA_CALIBRATION.durationDays,
    }
  : {
      cardCount: 64,
      cohortSize: 12,
      durationDays: 180,
    };

const writeAnalysisFilesIfRequested = (dataset) => {
  if (process.env.MEMORY_BULK_WRITE_REPORT !== "1") return;

  const docsDir = path.join(process.cwd(), "docs");
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(
    path.join(docsDir, "memory-model-two-year-bulk-analysis-2026-07-23.json"),
    JSON.stringify(dataset, null, 2)
  );
  fs.writeFileSync(
    path.join(docsDir, "memory-model-two-year-bulk-students-2026-07-23.csv"),
    rowsToCsv(dataset.studentRows)
  );
  fs.writeFileSync(
    path.join(docsDir, "memory-model-two-year-bulk-bands-2026-07-23.csv"),
    rowsToCsv(dataset.bandRows)
  );
};

describe("two-year 50-student bulk memory simulation", () => {
  let cohort;
  let dataset;

  beforeAll(() => {
    cohort = runTwoYearBulkMemoryCohort(simulationConfig);
    dataset = buildTwoYearBulkAnalysisDataset(cohort);
    writeAnalysisFilesIfRequested(dataset);
  });

  test("runs the configured synthetic cohort period", () => {
    expect(cohort.students).toHaveLength(simulationConfig.cohortSize);
    expect(cohort.durationDays).toBe(simulationConfig.durationDays);
    expect(dataset.studentRows).toHaveLength(simulationConfig.cohortSize);
    expect(dataset.sampledDailyRows.length).toBeGreaterThan(simulationConfig.cohortSize * 8);
    expect(dataset.cohortMetrics.cohortSize).toBe(simulationConfig.cohortSize);
  });

  test("all exported student rows stay finite and analysis-ready", () => {
    dataset.studentRows.forEach((row) => {
      [
        row.assignmentsLate,
        row.assignmentsMissed,
        row.assignmentsOnTime,
        row.coverageRate,
        row.examAverageMastery,
        row.examAverageStability,
        row.examCoverageRate,
        row.examLearnedAverageMastery,
        row.examRefreshRate,
        row.finalAverageMastery,
        row.finalAverageStability,
        row.finalLearnedAverageMastery,
        row.finalRefreshRate,
        row.learnedCards,
        row.longestQuietRun,
        row.nudgeEvents,
        row.nudgeResponseRate,
        row.nudgeStudyResponses,
        row.quietDays,
        row.studyDays,
        row.totalAccuracy,
        row.totalAnswered,
        row.totalSessions,
      ].forEach((value) => {
        expect(Number.isFinite(value)).toBe(true);
      });

      expect(row.studyDays + row.quietDays).toBe(simulationConfig.durationDays + 1);
      expect(row.coverageRate).toBeGreaterThanOrEqual(0);
      expect(row.coverageRate).toBeLessThanOrEqual(100);
      expect(row.examAverageMastery).toBeGreaterThanOrEqual(0);
      expect(row.examAverageMastery).toBeLessThanOrEqual(100);
      expect(row.examCoverageRate).toBeGreaterThanOrEqual(0);
      expect(row.examCoverageRate).toBeLessThanOrEqual(100);
      expect(row.examRefreshRate).toBeGreaterThanOrEqual(0);
      expect(row.examRefreshRate).toBeLessThanOrEqual(100);
      expect(row.finalAverageMastery).toBeGreaterThanOrEqual(0);
      expect(row.finalAverageMastery).toBeLessThanOrEqual(100);
      expect(row.finalLearnedAverageMastery).toBeGreaterThanOrEqual(0);
      expect(row.finalLearnedAverageMastery).toBeLessThanOrEqual(100);
      expect(row.finalRefreshRate).toBeGreaterThanOrEqual(0);
      expect(row.finalRefreshRate).toBeLessThanOrEqual(100);
      expect(row.nudgeStudyResponses).toBeLessThanOrEqual(row.nudgeEvents);
    });
  });

  test("open-data-inspired outcome bands separate in the expected order", () => {
    const bands = cohort.summaryByBand;

    expect(bands.distinctionLike.count).toBeGreaterThan(0);
    expect(bands.passLike.count).toBeGreaterThan(0);
    expect(bands.failLike.count).toBeGreaterThan(0);
    expect(bands.lowEngagementLike.count).toBeGreaterThan(0);

    expect(bands.distinctionLike.examAverageMastery).toBeGreaterThan(
      bands.passLike.examAverageMastery
    );
    expect(bands.passLike.examAverageMastery).toBeGreaterThan(
      bands.failLike.examAverageMastery
    );
    expect(bands.failLike.examAverageMastery).toBeGreaterThan(
      bands.lowEngagementLike.examAverageMastery
    );
    expect(bands.distinctionLike.examCoverageRate).toBeGreaterThan(
      bands.lowEngagementLike.examCoverageRate
    );
    expect(bands.distinctionLike.studyDays).toBeGreaterThan(bands.failLike.studyDays);
  });

  test("nudges are visible but do not magically fix low-engagement behaviour", () => {
    const bands = cohort.summaryByBand;
    const lowEngagementRows = dataset.studentRows.filter(
      (row) => row.outcomeBand === "lowEngagementLike"
    );
    const distinctionRows = dataset.studentRows.filter((row) => row.outcomeBand === "distinctionLike");

    const averageLowEngagementNudges =
      lowEngagementRows.reduce((sum, row) => sum + row.nudgeEvents, 0) /
      lowEngagementRows.length;
    const averageDistinctionNudges =
      distinctionRows.reduce((sum, row) => sum + row.nudgeEvents, 0) / distinctionRows.length;

    expect(averageLowEngagementNudges).toBeGreaterThan(averageDistinctionNudges);
    expect(bands.lowEngagementLike.examAverageMastery).toBeLessThan(
      bands.passLike.examAverageMastery
    );
  });

  test("analysis dataset exposes tuning flags and CSV-compatible rows", () => {
    const studentCsv = rowsToCsv(dataset.studentRows);
    const bandCsv = rowsToCsv(dataset.bandRows);

    expect(dataset.tuningFlags.recommendedAlgorithmActions.length).toBeGreaterThan(3);
    expect(Number.isFinite(dataset.tuningFlags.highLearnedLowCoverageCount)).toBe(true);
    expect(Number.isFinite(dataset.tuningFlags.highNudgeLowResponseCount)).toBe(true);
    expect(studentCsv.startsWith("assignmentsLate,assignmentsMissed")).toBe(true);
    expect(studentCsv.split("\n")).toHaveLength(simulationConfig.cohortSize + 1);
    expect(bandCsv.split("\n")).toHaveLength(5);
  });

  test("full bulk QA mode uses exactly 50 students for two academic years", () => {
    if (!isFullBulkRun) {
      expect(isFullBulkRun).toBe(false);
      return;
    }

    expect(cohort.students).toHaveLength(50);
    expect(cohort.durationDays).toBe(730);
    expect(dataset.studentRows).toHaveLength(50);
    expect(dataset.sampledDailyRows.length).toBeGreaterThan(2500);
  });
});
