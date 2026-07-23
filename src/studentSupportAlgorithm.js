const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const round = (value, places = 1) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const asNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const firstNumber = (...values) => {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
};

const ACTION_COPY = {
  "assignment-recovery-plan": {
    label: "Assignment recovery plan",
    severity: "high",
    studentMessage:
      "You have missed several assignments. Start with the overdue work, then use Memory Repair on the weakest topics.",
    teacherMessage:
      "Set a short recovery plan. Missed assignments are now the strongest barrier to exam readiness.",
  },
  "coverage-rebuild": {
    label: "Coverage rebuild",
    severity: "high",
    studentMessage:
      "You have only covered part of the course. Focus on new topic coverage before chasing high scores.",
    teacherMessage:
      "This student needs structured topic coverage, not only refresh work.",
  },
  "guided-memory-repair": {
    label: "Guided Memory Repair",
    severity: "medium",
    studentMessage:
      "You are working, but too many learned cards need repair. Start with Memory Repair before new content.",
    teacherMessage:
      "They are active but carrying a high refresh load. Guide them into repair-first study.",
  },
  maintain: {
    label: "Maintain pace",
    severity: "low",
    studentMessage:
      "Keep your current rhythm. Short regular sessions are protecting your long-term memory.",
    teacherMessage:
      "No immediate support action. Keep monitoring assignment completion and refresh load.",
  },
  "positive-reward": {
    label: "Positive reward",
    severity: "positive",
    studentMessage:
      "Excellent consistency. Keep the rhythm going and protect the topics you have already mastered.",
    teacherMessage:
      "Send positive feedback. This student is on a strong readiness path.",
  },
  reactivation: {
    label: "Reactivation prompt",
    severity: "medium",
    studentMessage:
      "You have been quiet for a while. Restart with a short, low-pressure refresh set.",
    teacherMessage:
      "The main issue is a long quiet gap. Use a light restart prompt before adding new work.",
  },
  "teacher-escalation": {
    label: "Teacher check-in",
    severity: "high",
    studentMessage:
      "Automatic reminders have not been enough. Your teacher may help you choose a smaller next step.",
    teacherMessage:
      "Automated nudges are not landing. A teacher check-in is more useful than sending the same reminder again.",
  },
};

const classifyEngagementPace = (pacePercent) => {
  const safePercent = clamp(asNumber(pacePercent), 0, 180);
  if (safePercent >= 125) return { label: "Well ahead", tone: "gold" };
  if (safePercent >= 95) return { label: "On pace", tone: "green" };
  if (safePercent >= 75) return { label: "Slightly behind", tone: "orange" };
  if (safePercent > 0) return { label: "Low pace", tone: "red" };
  return { label: "No XP yet", tone: "red" };
};

export const ENGAGEMENT_INFO_COPY = {
  title: "How XP and readiness work together",
  short:
    "XP is a motivation and engagement signal. It is not a grade by itself.",
  points: [
    "Engagement Pace compares the XP a student has earned with the steady XP pace expected at this point in the course.",
    "XP Efficiency compares that pace with real learning evidence: mastery, coverage, refresh load, and assignment outcomes.",
    "High XP with weak readiness means the student is busy but stuck. Low XP with strong readiness means they are working efficiently. Low XP with weak readiness means they need support.",
  ],
};

export const calculateExamReadinessScore = (metrics = {}) => {
  const mastery = clamp(
    firstNumber(metrics.examAverageMastery, metrics.mastery, metrics.finalAverageMastery),
    0,
    100
  );
  const coverage = clamp(
    firstNumber(metrics.examCoverageRate, metrics.coverageRate),
    0,
    100
  );
  const refreshRate = clamp(
    firstNumber(metrics.examRefreshRate, metrics.refreshRate, metrics.finalRefreshRate),
    0,
    100
  );
  const refreshHealth = 100 - refreshRate;
  const assignmentsOnTime = Math.max(0, asNumber(metrics.assignmentsOnTime));
  const assignmentsLate = Math.max(0, asNumber(metrics.assignmentsLate));
  const assignmentsMissed = Math.max(0, asNumber(metrics.assignmentsMissed));
  const assignmentTotal = assignmentsOnTime + assignmentsLate + assignmentsMissed;
  const assignmentHealth =
    assignmentTotal > 0
      ? ((assignmentsOnTime + assignmentsLate * 0.45) / assignmentTotal) * 100
      : 74;
  const expectedStudyDays = Math.max(1, asNumber(metrics.expectedStudyDays, 260));
  const studyActivityHealth = clamp(
    (asNumber(metrics.studyDays) / expectedStudyDays) * 100,
    0,
    100
  );
  const engagementPacePercent = firstNumber(
    metrics.engagementPacePercent,
    metrics.xpPacePercent
  );
  const xpActivityHealth =
    engagementPacePercent > 0 ? clamp(engagementPacePercent, 0, 100) : studyActivityHealth;
  const activityHealth = studyActivityHealth * 0.65 + xpActivityHealth * 0.35;
  const nudgeEvents = asNumber(metrics.nudgeEvents);
  const nudgeResponseRate = clamp(asNumber(metrics.nudgeResponseRate), 0, 100);
  const nudgePenalty =
    nudgeEvents >= 80 && nudgeResponseRate < 35
      ? clamp((35 - nudgeResponseRate) * 0.22 + Math.min(8, nudgeEvents / 90), 0, 14)
      : 0;
  const missedPenalty =
    assignmentTotal > 0 && assignmentsMissed / assignmentTotal >= 0.5 ? 6 : 0;
  const quietPenalty = asNumber(metrics.longestQuietRun) >= 120 ? 4 : 0;

  return round(
    clamp(
      coverage * 0.32 +
        mastery * 0.32 +
        refreshHealth * 0.16 +
        assignmentHealth * 0.12 +
        activityHealth * 0.08 -
        nudgePenalty -
        missedPenalty -
        quietPenalty,
      0,
      100
    )
  );
};

export const calculateEngagementAnalytics = (metrics = {}) => {
  const studentXp = Math.max(
    0,
    Math.round(
      firstNumber(
        metrics.studentXp,
        metrics.xpTotal,
        metrics.totalXp,
        metrics.engagementPoints,
        metrics.estimatedXpTotal
      )
    )
  );
  const targetXp = Math.max(
    1,
    Math.round(firstNumber(metrics.targetXp, metrics.targetEngagementPoints, metrics.expectedXp, 1))
  );
  const elapsedRatio =
    metrics.elapsedRatio !== undefined
      ? clamp(asNumber(metrics.elapsedRatio), 0, 1)
      : clamp(asNumber(metrics.expectedXp) / targetXp, 0, 1);
  const expectedXp = Math.max(
    0,
    Math.round(firstNumber(metrics.expectedXp, metrics.expectedEngagementPoints, targetXp * elapsedRatio))
  );
  const engagementPacePercent = round(
    clamp(
      expectedXp > 0 ? (studentXp / expectedXp) * 100 : studentXp > 0 ? 120 : 0,
      0,
      180
    ),
    0
  );
  const pace = classifyEngagementPace(engagementPacePercent);
  const hasDirectReadiness =
    metrics.readinessScore !== undefined || metrics.examReadinessScore !== undefined;
  const hasFullReadinessInputs =
    metrics.examCoverageRate !== undefined ||
    metrics.coverageRate !== undefined ||
    metrics.examRefreshRate !== undefined ||
    metrics.refreshRate !== undefined ||
    metrics.assignmentsOnTime !== undefined ||
    metrics.assignmentsLate !== undefined ||
    metrics.assignmentsMissed !== undefined;
  let readinessScore = 0;
  if (hasDirectReadiness) {
    readinessScore = firstNumber(metrics.readinessScore, metrics.examReadinessScore);
  } else if (hasFullReadinessInputs) {
    readinessScore = calculateExamReadinessScore({
      ...metrics,
      engagementPacePercent,
    });
  } else {
    readinessScore = firstNumber(
      metrics.examAverageMastery,
      metrics.mastery,
      metrics.finalAverageMastery
    );
  }
  readinessScore = clamp(readinessScore, 0, 100);
  const efficiencyGap = round(readinessScore - Math.min(100, engagementPacePercent), 0);
  let xpEfficiencyLabel = "Building evidence";
  let xpEfficiencyTone = "orange";
  let teacherSummary =
    "The student has some evidence, but it is not yet clear whether effort is turning into secure learning.";
  let teacherAdvice =
    "Look at mastery, refresh load, and assignments before making a support decision.";

  if (engagementPacePercent >= 95 && readinessScore < 58) {
    xpEfficiencyLabel = "Busy but stuck";
    xpEfficiencyTone = "red";
    teacherSummary =
      "XP pace is healthy, but the learning evidence is weak. The student may be practising without repairing the right knowledge.";
    teacherAdvice =
      "Check weak topics, refresh load, and recent wrong answers rather than simply asking for more time.";
  } else if (engagementPacePercent < 75 && readinessScore < 58) {
    xpEfficiencyLabel = "Quiet risk";
    xpEfficiencyTone = "red";
    teacherSummary =
      "Both XP pace and learning evidence are low. This is a support risk, not just a low-points issue.";
    teacherAdvice =
      "Use a small restart task, then monitor whether the student responds over the next few days.";
  } else if (readinessScore >= 72 && engagementPacePercent < 90) {
    xpEfficiencyLabel = "Efficient learning";
    xpEfficiencyTone = "green";
    teacherSummary =
      "The student has strong readiness evidence without needing unusually high XP.";
    teacherAdvice =
      "Keep them consistent and avoid pushing extra busy work just to increase points.";
  } else if (readinessScore >= 85 && engagementPacePercent >= 125) {
    xpEfficiencyLabel = "High-performing";
    xpEfficiencyTone = "gold";
    teacherSummary =
      "The student is ahead on XP and strong on readiness evidence.";
    teacherAdvice =
      "Positive feedback is appropriate. Keep watching coverage so the lead is broad, not narrow.";
  } else if (readinessScore >= 72) {
    xpEfficiencyLabel = "Productive pace";
    xpEfficiencyTone = "green";
    teacherSummary =
      "XP pace and readiness evidence are moving together in a healthy way.";
    teacherAdvice =
      "Maintain the current pattern and watch for any sudden rise in refresh load.";
  } else if (engagementPacePercent >= 95) {
    xpEfficiencyLabel = "Working but fragile";
    xpEfficiencyTone = "orange";
    teacherSummary =
      "The student is active, but the learning evidence is not secure yet.";
    teacherAdvice =
      "Guide them toward weaker topics and check whether recent activity is improving mastery.";
  } else if (engagementPacePercent < 75 && readinessScore >= 72) {
    xpEfficiencyLabel = "Efficient but quiet";
    xpEfficiencyTone = "orange";
    teacherSummary =
      "The student looks ready, but their engagement pace is low.";
    teacherAdvice =
      "Check whether they are studying elsewhere or whether the app data is missing part of their learning.";
  }

  return {
    engagementPaceLabel: pace.label,
    engagementPacePercent,
    engagementPaceTone: pace.tone,
    expectedXp,
    studentXp,
    targetXp,
    teacherAdvice,
    teacherSummary,
    xpEfficiencyGap: efficiencyGap,
    xpEfficiencyLabel,
    xpEfficiencyScore: round(clamp(readinessScore - Math.max(0, engagementPacePercent - 100) * 0.25, 0, 100), 0),
    xpEfficiencyTone,
  };
};

export const classifyExamReadiness = (score) => {
  const safeScore = clamp(asNumber(score), 0, 100);
  if (safeScore >= 85) return { label: "Secure", tone: "gold" };
  if (safeScore >= 72) return { label: "On track", tone: "green" };
  if (safeScore >= 58) return { label: "Watch", tone: "orange" };
  if (safeScore >= 40) return { label: "Intervention", tone: "red" };
  return { label: "Urgent support", tone: "red" };
};

export const evaluateStudentSupport = (metrics = {}) => {
  const readinessScore = calculateExamReadinessScore(metrics);
  const readiness = classifyExamReadiness(readinessScore);
  const coverage = clamp(firstNumber(metrics.examCoverageRate, metrics.coverageRate), 0, 100);
  const learnedMastery = clamp(
    firstNumber(metrics.examLearnedAverageMastery, metrics.finalLearnedAverageMastery),
    0,
    100
  );
  const refreshRate = clamp(
    firstNumber(metrics.examRefreshRate, metrics.refreshRate, metrics.finalRefreshRate),
    0,
    100
  );
  const assignmentsOnTime = Math.max(0, asNumber(metrics.assignmentsOnTime));
  const assignmentsLate = Math.max(0, asNumber(metrics.assignmentsLate));
  const assignmentsMissed = Math.max(0, asNumber(metrics.assignmentsMissed));
  const assignmentTotal = assignmentsOnTime + assignmentsLate + assignmentsMissed;
  const missedRate = assignmentTotal > 0 ? assignmentsMissed / assignmentTotal : 0;
  const nudgeEvents = asNumber(metrics.nudgeEvents);
  const nudgeResponseRate = clamp(asNumber(metrics.nudgeResponseRate), 0, 100);
  const studyDays = asNumber(metrics.studyDays);
  const longestQuietRun = asNumber(metrics.longestQuietRun);
  const reasons = [];
  let action = "maintain";

  if (readinessScore >= 88 && missedRate <= 0.15 && refreshRate <= 15 && coverage >= 90) {
    action = "positive-reward";
    reasons.push("High readiness with strong coverage and low refresh load.");
  } else if (
    nudgeEvents >= 80 &&
    nudgeResponseRate < 25 &&
    (readinessScore < 72 || (readinessScore < 85 && longestQuietRun >= 90))
  ) {
    action = "teacher-escalation";
    reasons.push("Repeated automated nudges have a low response rate.");
  } else if (coverage < 45 || (coverage < 60 && learnedMastery >= 80)) {
    action = "coverage-rebuild";
    reasons.push("Coverage is too low for the learned-card mastery to be trusted alone.");
  } else if (assignmentTotal > 0 && missedRate >= 0.45) {
    action = "assignment-recovery-plan";
    reasons.push("Missed assignments are now a major readiness risk.");
  } else if (refreshRate >= 55 && studyDays >= 90) {
    action = "guided-memory-repair";
    reasons.push("The student is active but still has a high refresh load.");
  } else if (longestQuietRun >= 28 && readinessScore < 72) {
    action = "reactivation";
    reasons.push("A long quiet gap is weakening the study pattern.");
  } else if (refreshRate >= 35 && readinessScore < 85) {
    action = "guided-memory-repair";
    reasons.push("Refresh load is the clearest next study target.");
  } else {
    reasons.push("No urgent risk dominates the current profile.");
  }

  const copy = ACTION_COPY[action] || ACTION_COPY.maintain;

  return {
    action,
    label: copy.label,
    readinessLabel: readiness.label,
    readinessScore,
    reasons,
    severity: copy.severity,
    studentMessage: copy.studentMessage,
    teacherMessage: copy.teacherMessage,
    tone: readiness.tone,
  };
};

export const summariseSupportActions = (rows = []) =>
  rows.reduce((summary, row) => {
    const key = row.supportAction || row.action || "unknown";
    summary[key] = (summary[key] || 0) + 1;
    return summary;
  }, {});
