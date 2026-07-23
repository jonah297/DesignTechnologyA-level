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
  const activityHealth = clamp((asNumber(metrics.studyDays) / expectedStudyDays) * 100, 0, 100);
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
