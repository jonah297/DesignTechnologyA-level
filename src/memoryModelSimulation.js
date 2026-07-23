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
