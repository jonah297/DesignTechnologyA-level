import { buildNextMemoryRecord, calculateCardMastery, getMemoryState } from "./memoryModel";

const DAY_MS = 86400000;
const START_AT = Date.UTC(2026, 8, 2, 9, 0, 0);
const DEFAULT_MEMORY_OPERATIONS = {
  buildNextMemoryRecord,
  calculateCardMastery,
  getMemoryState,
};

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

export const createSimulationCardIds = (count = 24) =>
  Array.from({ length: count }, (_, index) => `sim-card-${index + 1}`);

const getCardNumber = (cardId) => Number(String(cardId).match(/\d+$/)?.[0] || 0);
const getLearnedCount = (progress = {}) => Object.keys(progress).length;

const isWeekday = (day) => day % 7 < 5;
const isInRange = (day, start, end) => day >= start && day <= end;

const interpolate = (start, end, progress) =>
  start + (end - start) * Math.max(0, Math.min(1, progress));

export const getMemorySimulationSnapshot = (
  label,
  day,
  progress,
  cardIds,
  options = {}
) => {
  const memory = options.memory || DEFAULT_MEMORY_OPERATIONS;
  const now = START_AT + day * DAY_MS;
  const learnedCards = cardIds.filter((cardId) => progress[cardId]);
  const cardStates = cardIds.map((cardId) => {
    const record = progress[cardId];
    const mastery = memory.calculateCardMastery(record, now);
    return {
      cardId,
      learned: Boolean(record),
      mastery,
      state: record ? memory.getMemoryState(record, now) : null,
    };
  });
  const learnedStates = cardStates.filter((item) => item.learned);
  const refreshCards = learnedStates.filter((item) => item.mastery < 80);
  const severeDecayCards = learnedStates.filter((item) => item.mastery < 50);
  const averageMastery =
    cardStates.length > 0
      ? round(cardStates.reduce((sum, item) => sum + item.mastery, 0) / cardStates.length)
      : 0;
  const learnedAverageMastery =
    learnedStates.length > 0
      ? round(learnedStates.reduce((sum, item) => sum + item.mastery, 0) / learnedStates.length)
      : 0;
  const averageStability =
    learnedStates.length > 0
      ? round(
          learnedStates.reduce((sum, item) => sum + (item.state?.stabilityDays || 0), 0) /
            learnedStates.length
        )
      : 0;

  return {
    averageMastery,
    averageStability,
    day,
    label,
    learnedAverageMastery,
    learnedCards: learnedCards.length,
    notes: options.notes || "",
    refreshCards: refreshCards.length,
    refreshRate:
      learnedStates.length > 0 ? round((refreshCards.length / learnedStates.length) * 100) : 0,
    severeDecayCards: severeDecayCards.length,
  };
};

const selectCards = (strategy, progress, cardIds, now, count, memory) => {
  if (strategy === "new") {
    return cardIds.filter((cardId) => !progress[cardId]).slice(0, count);
  }

  if (strategy === "repair") {
    return cardIds
      .filter((cardId) => progress[cardId])
      .map((cardId) => ({
        cardId,
        mastery: memory.calculateCardMastery(progress[cardId], now),
      }))
      .filter((item) => item.mastery < 80)
      .sort((a, b) => a.mastery - b.mastery || getCardNumber(a.cardId) - getCardNumber(b.cardId))
      .slice(0, count)
      .map((item) => item.cardId);
  }

  return cardIds
    .filter((cardId) => progress[cardId])
    .map((cardId) => ({
      cardId,
      mastery: memory.calculateCardMastery(progress[cardId], now),
    }))
    .sort((a, b) => a.mastery - b.mastery || getCardNumber(a.cardId) - getCardNumber(b.cardId))
    .slice(0, count)
    .map((item) => item.cardId);
};

export const applySimulatedStudySession = (
  progress,
  cardIds,
  {
    accuracy = 0.7,
    count = 8,
    day,
    memory = DEFAULT_MEMORY_OPERATIONS,
    mode = "flashcard",
    seed = "student",
    strategy = "review",
  }
) => {
  const now = START_AT + day * DAY_MS;
  const selectedCards = selectCards(strategy, progress, cardIds, now, count, memory);
  const nextProgress = { ...progress };
  let correct = 0;

  selectedCards.forEach((cardId, index) => {
    const prior = nextProgress[cardId] || {};
    const cardEase = (getCardNumber(cardId) % 5) * 0.025;
    const deterministicRoll = hashToUnit(`${seed}-${day}-${cardId}-${index}`);
    const isCorrect = deterministicRoll < Math.max(0.05, Math.min(0.97, accuracy - cardEase));
    if (isCorrect) correct += 1;
    nextProgress[cardId] = memory.buildNextMemoryRecord(prior, {
      isCorrect,
      mode,
      now,
    });
  });

  return {
    accuracy: selectedCards.length > 0 ? round((correct / selectedCards.length) * 100) : 0,
    correct,
    progress: nextProgress,
    touched: selectedCards.length,
  };
};

export const runMemorySimulationJourney = ({
  cardCount = 24,
  memory = DEFAULT_MEMORY_OPERATIONS,
  seed,
  steps,
}) => {
  const cardIds = createSimulationCardIds(cardCount);
  let progress = {};
  const timeline = [];

  steps.forEach((step) => {
    if (step.type === "snapshot") {
      timeline.push(
        getMemorySimulationSnapshot(step.label, step.day, progress, cardIds, {
          memory,
          notes: step.notes,
        })
      );
      return;
    }

    const result = applySimulatedStudySession(progress, cardIds, {
      accuracy: step.accuracy,
      count: step.count,
      day: step.day,
      memory,
      mode: step.mode,
      seed,
      strategy: step.strategy,
    });
    progress = result.progress;
    timeline.push(
      getMemorySimulationSnapshot(step.label, step.day, progress, cardIds, {
        memory,
        notes: `${result.touched} cards answered, ${result.accuracy}% correct. ${
          step.notes || ""
        }`.trim(),
      })
    );
  });

  return { cardIds, progress, timeline };
};

export const runStandardMemorySimulationSet = (options = {}) => {
  const memory = options.memory || DEFAULT_MEMORY_OPERATIONS;
  const steadyStudent = runMemorySimulationJourney({
    memory,
    seed: "steady",
    steps: [
      { day: 0, label: "Day 0: no prior mastery", type: "snapshot" },
      { accuracy: 0.64, count: 12, day: 0, label: "Day 0: first quiz session", strategy: "new" },
      { accuracy: 0.74, count: 12, day: 1, label: "Day 1: review weakest cards", strategy: "review" },
      { accuracy: 0.7, count: 12, day: 2, label: "Day 2: learn remaining cards", strategy: "new" },
      { accuracy: 0.8, count: 16, day: 3, label: "Day 3: normal review", strategy: "review" },
      {
        day: 7,
        label: "Day 7: four days away",
        notes: "No answers submitted since day 3.",
        type: "snapshot",
      },
      {
        accuracy: 0.84,
        count: 10,
        day: 7,
        label: "Day 7: Memory Repair after absence",
        strategy: "repair",
      },
      {
        accuracy: 0.88,
        count: 8,
        day: 8,
        label: "Day 8: second repair pass",
        strategy: "repair",
      },
      {
        day: 14,
        label: "Day 14: another six days away",
        notes: "Useful check for a realistic half-term style gap.",
        type: "snapshot",
      },
      {
        accuracy: 0.86,
        count: 16,
        day: 14,
        label: "Day 14: repair and rebuild",
        strategy: "repair",
      },
      {
        accuracy: 0.9,
        count: 12,
        day: 15,
        label: "Day 15: consolidation review",
        strategy: "review",
      },
    ],
  });

  const slackerRecoveryStudent = runMemorySimulationJourney({
    memory,
    seed: "slacker-recovery",
    steps: [
      { day: 0, label: "Day 0: no prior mastery", type: "snapshot" },
      {
        accuracy: 0.46,
        count: 12,
        day: 0,
        label: "Day 0: weak first quiz session",
        strategy: "new",
      },
      {
        accuracy: 0.54,
        count: 12,
        day: 1,
        label: "Day 1: patchy review",
        strategy: "review",
      },
      {
        day: 5,
        label: "Day 5: skipped several days",
        notes: "This is where automated nudging should fire in the live app.",
        type: "snapshot",
      },
      {
        accuracy: 0.64,
        count: 12,
        day: 5,
        label: "Day 5: responds to nudge",
        strategy: "repair",
      },
      {
        accuracy: 0.7,
        count: 12,
        day: 6,
        label: "Day 6: second repair attempt",
        strategy: "repair",
      },
      {
        day: 10,
        label: "Day 10: slips again",
        notes: "Checks whether one good repair day is enough. It should not be.",
        type: "snapshot",
      },
      {
        accuracy: 0.74,
        count: 16,
        day: 10,
        label: "Day 10: bigger repair session",
        strategy: "repair",
      },
      {
        accuracy: 0.78,
        count: 12,
        day: 11,
        label: "Day 11: follow-up repair",
        strategy: "repair",
      },
    ],
  });

  return { slackerRecoveryStudent, steadyStudent };
};

export const INTENSIVE_MEMORY_PROFILES = [
  {
    id: "consistentHigh",
    label: "Consistent high performer",
    description: "Studies on most weekdays, learns early, and repairs weak cards quickly.",
    shouldStudy(day) {
      return isWeekday(day) || day % 14 === 6;
    },
    accuracy(day) {
      return interpolate(0.82, 0.92, day / 180);
    },
    newCount(day, learnedCount, cardCount) {
      if (day > 95 || learnedCount >= cardCount) return 0;
      return day < 30 ? 3 : 2;
    },
    repairCount(day) {
      return day < 14 ? 4 : 10;
    },
    reviewCount(day) {
      return day < 30 ? 4 : 8;
    },
  },
  {
    id: "steadyAverage",
    label: "Steady average student",
    description: "Studies three or four times per week with slowly improving accuracy.",
    shouldStudy(day) {
      return [0, 2, 4, 6].includes(day % 7);
    },
    accuracy(day) {
      return interpolate(0.62, 0.76, day / 220);
    },
    newCount(day, learnedCount, cardCount) {
      if (day > 170 || learnedCount >= cardCount) return 0;
      return day < 80 ? 2 : 1;
    },
    repairCount() {
      return 8;
    },
    reviewCount() {
      return 6;
    },
  },
  {
    id: "strugglingConsistent",
    label: "Struggling but consistent",
    description: "Shows up often but starts with low accuracy, so recovery should be possible but slower.",
    shouldStudy(day) {
      return isWeekday(day);
    },
    accuracy(day) {
      return interpolate(0.42, 0.68, day / 260);
    },
    newCount(day, learnedCount, cardCount) {
      if (day > 220 || learnedCount >= cardCount) return 0;
      return day % 2 === 0 ? 1 : 0;
    },
    repairCount() {
      return 12;
    },
    reviewCount(day) {
      return day < 30 ? 4 : 7;
    },
  },
  {
    id: "inconsistentSlacker",
    label: "Inconsistent student",
    description: "Has occasional bursts and long quiet patches. Nudges should matter here.",
    shouldStudy(day) {
      if (isInRange(day, 80, 96) || isInRange(day, 200, 212)) return false;
      if (isInRange(day, 97, 106) || isInRange(day, 213, 222)) return day % 2 === 0;
      return day % 11 === 2 || day % 17 === 5 || hashToUnit(`slacker-study-${day}`) > 0.78;
    },
    accuracy(day) {
      return interpolate(0.5, 0.66, day / 365);
    },
    newCount(day, learnedCount, cardCount) {
      if (day > 260 || learnedCount >= cardCount) return 0;
      if (isInRange(day, 97, 106) || isInRange(day, 213, 222)) return 0;
      return day % 3 === 0 ? 2 : 1;
    },
    repairCount(day) {
      return isInRange(day, 97, 106) || isInRange(day, 213, 222) ? 14 : 6;
    },
    reviewCount() {
      return 5;
    },
  },
  {
    id: "deadlineCrammer",
    label: "Deadline crammer",
    description: "Does very little, then works hard near deadline windows.",
    shouldStudy(day) {
      return (
        isInRange(day, 24, 30) ||
        isInRange(day, 55, 61) ||
        isInRange(day, 112, 122) ||
        isInRange(day, 178, 188) ||
        isInRange(day, 340, 365)
      );
    },
    accuracy(day) {
      return interpolate(0.55, 0.7, day / 365);
    },
    newCount(day, learnedCount, cardCount) {
      if (learnedCount >= cardCount) return 0;
      return isInRange(day, 340, 365) ? 5 : 4;
    },
    repairCount() {
      return 18;
    },
    reviewCount() {
      return 14;
    },
  },
  {
    id: "absenceRepair",
    label: "Absent then repairs",
    description: "Builds early mastery, disappears for a month, then returns with repair sessions.",
    shouldStudy(day) {
      if (isInRange(day, 21, 50)) return false;
      if (isInRange(day, 51, 70)) return true;
      return (isWeekday(day) && day < 130) || [1, 4].includes(day % 7);
    },
    accuracy(day) {
      if (isInRange(day, 51, 70)) return 0.78;
      return interpolate(0.68, 0.82, day / 220);
    },
    newCount(day, learnedCount, cardCount) {
      if (day > 165 || learnedCount >= cardCount) return 0;
      if (isInRange(day, 51, 70)) return 0;
      return day < 21 ? 3 : 1;
    },
    repairCount(day) {
      return isInRange(day, 51, 70) ? 16 : 8;
    },
    reviewCount() {
      return 7;
    },
  },
];

export const INTENSIVE_MEMORY_MILESTONES = [0, 7, 14, 30, 60, 90, 120, 180, 240, 300, 365];

export const runIntensiveMemoryProfile = ({
  cardCount = 96,
  durationDays = 365,
  memory = DEFAULT_MEMORY_OPERATIONS,
  profile,
}) => {
  const cardIds = createSimulationCardIds(cardCount);
  let progress = {};
  const daily = [];
  const timeline = [
    getMemorySimulationSnapshot("Day 0: starting point", 0, progress, cardIds, {
      memory,
      notes: profile.description,
    }),
  ];
  const milestoneDays = new Set(INTENSIVE_MEMORY_MILESTONES.filter((day) => day <= durationDays));
  let totalAnswered = 0;
  let totalCorrect = 0;
  let totalSessions = 0;

  for (let day = 0; day <= durationDays; day += 1) {
    let dayAnswered = 0;
    let dayCorrect = 0;
    let daySessions = 0;

    if (profile.shouldStudy(day, progress)) {
      const accuracy = profile.accuracy(day, progress);
      const repairCount = profile.repairCount(day, progress);
      if (repairCount > 0) {
        const repair = applySimulatedStudySession(progress, cardIds, {
          accuracy,
          count: repairCount,
          day,
          memory,
          mode: "flashcard",
          seed: `${profile.id}-repair-${day}`,
          strategy: "repair",
        });
        progress = repair.progress;
        dayAnswered += repair.touched;
        dayCorrect += repair.correct;
        if (repair.touched > 0) daySessions += 1;
      }

      const freshLearnedCount = getLearnedCount(progress);
      const newCount = profile.newCount(day, freshLearnedCount, cardCount);
      if (newCount > 0) {
        const learn = applySimulatedStudySession(progress, cardIds, {
          accuracy: Math.max(0.05, accuracy - 0.04),
          count: newCount,
          day,
          memory,
          mode: "flashcard",
          seed: `${profile.id}-new-${day}`,
          strategy: "new",
        });
        progress = learn.progress;
        dayAnswered += learn.touched;
        dayCorrect += learn.correct;
        if (learn.touched > 0) daySessions += 1;
      }

      const reviewCount = profile.reviewCount(day, progress);
      if (reviewCount > 0 && getLearnedCount(progress) > 0) {
        const review = applySimulatedStudySession(progress, cardIds, {
          accuracy,
          count: reviewCount,
          day,
          memory,
          mode: "flashcard",
          seed: `${profile.id}-review-${day}`,
          strategy: "review",
        });
        progress = review.progress;
        dayAnswered += review.touched;
        dayCorrect += review.correct;
        if (review.touched > 0) daySessions += 1;
      }
    }

    totalAnswered += dayAnswered;
    totalCorrect += dayCorrect;
    totalSessions += daySessions;

    const snapshot = getMemorySimulationSnapshot(`Day ${day}: end of day`, day, progress, cardIds, {
      memory,
      notes:
        dayAnswered > 0
          ? `${dayAnswered} cards answered, ${round((dayCorrect / dayAnswered) * 100)}% correct.`
          : "No study recorded.",
    });
    daily.push({
      ...snapshot,
      answered: dayAnswered,
      correct: dayCorrect,
      sessions: daySessions,
    });

    if (milestoneDays.has(day) && day !== 0) {
      timeline.push(snapshot);
    }
  }

  const final = daily[daily.length - 1] || timeline[timeline.length - 1];
  const afterLearningDaily = daily.filter((day) => day.learnedCards > 0);
  const maxRefreshRate =
    afterLearningDaily.length > 0
      ? round(Math.max(...afterLearningDaily.map((day) => day.refreshRate)))
      : 0;
  const maxSevereDecayCards =
    afterLearningDaily.length > 0
      ? Math.max(...afterLearningDaily.map((day) => day.severeDecayCards))
      : 0;
  const studyDays = daily.filter((day) => day.answered > 0).length;
  const quietDays = daily.filter((day) => day.answered === 0).length;
  const totalAccuracy = totalAnswered > 0 ? round((totalCorrect / totalAnswered) * 100) : 0;

  return {
    cardIds,
    daily,
    final,
    progress,
    profile,
    summary: {
      finalAverageMastery: final.averageMastery,
      finalAverageStability: final.averageStability,
      finalLearnedAverageMastery: final.learnedAverageMastery,
      finalRefreshRate: final.refreshRate,
      finalSevereDecayCards: final.severeDecayCards,
      learnedCards: final.learnedCards,
      maxRefreshRate,
      maxSevereDecayCards,
      quietDays,
      studyDays,
      totalAccuracy,
      totalAnswered,
      totalSessions,
    },
    timeline,
  };
};

export const runIntensiveMemoryCohort = (options = {}) => {
  const profiles = options.profiles || INTENSIVE_MEMORY_PROFILES;
  return profiles.reduce((cohort, profile) => {
    cohort[profile.id] = runIntensiveMemoryProfile({
      cardCount: options.cardCount,
      durationDays: options.durationDays,
      memory: options.memory || DEFAULT_MEMORY_OPERATIONS,
      profile,
    });
    return cohort;
  }, {});
};
