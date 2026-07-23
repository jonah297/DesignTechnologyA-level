import {
  calculateEngagementAnalytics,
  calculateExamReadinessScore,
  classifyExamReadiness,
  evaluateStudentSupport,
  summariseSupportActions,
} from "./studentSupportAlgorithm";

describe("student support algorithm", () => {
  test("rewards strong exam readiness with low assignment pressure", () => {
    const support = evaluateStudentSupport({
      assignmentsLate: 0,
      assignmentsMissed: 0,
      assignmentsOnTime: 16,
      examAverageMastery: 93,
      examCoverageRate: 99,
      examRefreshRate: 1,
      longestQuietRun: 12,
      nudgeEvents: 10,
      nudgeResponseRate: 80,
      studyDays: 330,
    });

    expect(support.readinessScore).toBeGreaterThanOrEqual(88);
    expect(support.readinessLabel).toBe("Secure");
    expect(support.action).toBe("positive-reward");
    expect(support.severity).toBe("positive");
  });

  test("does not trust high learned mastery when coverage is low", () => {
    const support = evaluateStudentSupport({
      assignmentsLate: 0,
      assignmentsMissed: 4,
      assignmentsOnTime: 2,
      examAverageMastery: 35,
      examCoverageRate: 38,
      examLearnedAverageMastery: 86,
      examRefreshRate: 28,
      longestQuietRun: 60,
      nudgeEvents: 120,
      nudgeResponseRate: 44,
      studyDays: 120,
    });

    expect(support.action).toBe("coverage-rebuild");
    expect(support.reasons.join(" ")).toContain("Coverage is too low");
  });

  test("escalates repeated unanswered nudges to teacher check-in", () => {
    const support = evaluateStudentSupport({
      assignmentsLate: 1,
      assignmentsMissed: 8,
      assignmentsOnTime: 1,
      examAverageMastery: 42,
      examCoverageRate: 56,
      examRefreshRate: 62,
      longestQuietRun: 130,
      nudgeEvents: 240,
      nudgeResponseRate: 12,
      studyDays: 115,
    });

    expect(support.action).toBe("teacher-escalation");
    expect(support.severity).toBe("high");
    expect(support.teacherMessage).toContain("Automated nudges are not landing");
  });

  test("does not escalate secure students just because historic nudges were low response", () => {
    const support = evaluateStudentSupport({
      assignmentsLate: 0,
      assignmentsMissed: 1,
      assignmentsOnTime: 15,
      examAverageMastery: 91,
      examCoverageRate: 98,
      examRefreshRate: 1,
      longestQuietRun: 160,
      nudgeEvents: 200,
      nudgeResponseRate: 20,
      studyDays: 230,
    });

    expect(support.readinessLabel).toBe("Secure");
    expect(support.action).not.toBe("teacher-escalation");
  });

  test("selects repair for active students with high refresh load", () => {
    const support = evaluateStudentSupport({
      assignmentsLate: 2,
      assignmentsMissed: 3,
      assignmentsOnTime: 10,
      examAverageMastery: 67,
      examCoverageRate: 91,
      examRefreshRate: 66,
      longestQuietRun: 22,
      nudgeEvents: 75,
      nudgeResponseRate: 52,
      studyDays: 210,
    });

    expect(support.action).toBe("guided-memory-repair");
    expect(support.studentMessage).toContain("Memory Repair");
  });

  test("readiness score is bounded and classification is monotonic", () => {
    expect(calculateExamReadinessScore({ examAverageMastery: -20 })).toBeGreaterThanOrEqual(0);
    expect(calculateExamReadinessScore({ examAverageMastery: 400, examCoverageRate: 400 })).toBeLessThanOrEqual(100);
    expect(classifyExamReadiness(90).label).toBe("Secure");
    expect(classifyExamReadiness(75).label).toBe("On track");
    expect(classifyExamReadiness(60).label).toBe("Watch");
    expect(classifyExamReadiness(45).label).toBe("Intervention");
    expect(classifyExamReadiness(10).label).toBe("Urgent support");
  });

  test("summarises support actions for cohort review", () => {
    const summary = summariseSupportActions([
      { supportAction: "positive-reward" },
      { supportAction: "teacher-escalation" },
      { supportAction: "teacher-escalation" },
    ]);

    expect(summary).toEqual({
      "positive-reward": 1,
      "teacher-escalation": 2,
    });
  });

  test("labels high XP with weak readiness as busy but stuck", () => {
    const engagement = calculateEngagementAnalytics({
      assignmentsLate: 2,
      assignmentsMissed: 4,
      assignmentsOnTime: 1,
      examAverageMastery: 46,
      examCoverageRate: 55,
      examRefreshRate: 64,
      expectedXp: 3000,
      studentXp: 3900,
      targetXp: 9000,
    });

    expect(engagement.engagementPaceLabel).toBe("Well ahead");
    expect(engagement.xpEfficiencyLabel).toBe("Busy but stuck");
    expect(engagement.xpEfficiencyTone).toBe("red");
    expect(engagement.teacherAdvice).toContain("wrong answers");
  });

  test("labels strong readiness with modest XP as efficient learning", () => {
    const engagement = calculateEngagementAnalytics({
      assignmentsLate: 1,
      assignmentsMissed: 0,
      assignmentsOnTime: 8,
      examAverageMastery: 86,
      examCoverageRate: 92,
      examRefreshRate: 9,
      expectedXp: 4000,
      studentXp: 2800,
      targetXp: 9000,
    });

    expect(engagement.engagementPaceLabel).toBe("Low pace");
    expect(engagement.xpEfficiencyLabel).toBe("Efficient learning");
    expect(engagement.xpEfficiencyTone).toBe("green");
  });

  test("labels low XP and low readiness as quiet risk", () => {
    const engagement = calculateEngagementAnalytics({
      assignmentsLate: 1,
      assignmentsMissed: 6,
      assignmentsOnTime: 0,
      examAverageMastery: 35,
      examCoverageRate: 32,
      examRefreshRate: 58,
      expectedXp: 2500,
      studentXp: 900,
      targetXp: 9000,
    });

    expect(engagement.engagementPaceLabel).toBe("Low pace");
    expect(engagement.xpEfficiencyLabel).toBe("Quiet risk");
    expect(engagement.xpEfficiencyTone).toBe("red");
  });

  test("XP pace only has a light influence on exam readiness", () => {
    const sharedMetrics = {
      assignmentsLate: 1,
      assignmentsMissed: 2,
      assignmentsOnTime: 6,
      examAverageMastery: 68,
      examCoverageRate: 72,
      examRefreshRate: 28,
      expectedStudyDays: 160,
      studyDays: 80,
    };
    const noXpScore = calculateExamReadinessScore(sharedMetrics);
    const highXpScore = calculateExamReadinessScore({
      ...sharedMetrics,
      engagementPacePercent: 150,
    });

    expect(highXpScore).toBeGreaterThan(noXpScore);
    expect(highXpScore - noXpScore).toBeLessThanOrEqual(2);
  });
});
