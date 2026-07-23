export const MEMORY_MODEL_VERSION = "sharp-dsr-1";

const DAY_MS = 86400000;
const TARGET_RETENTION = 0.9;
const FORGETTING_DECAY = 0.5;
const FORGETTING_FACTOR = Math.pow(TARGET_RETENTION, -1 / FORGETTING_DECAY) - 1;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const round = (value, places = 2) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const asNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const timestampToMillis = (value) => {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === "function") return value.toMillis();
  if (Number.isFinite(Number(value.seconds))) {
    return Number(value.seconds) * 1000;
  }
  return 0;
};

const getReviewModeProfile = (mode = "flashcard") => {
  const normalised = String(mode || "").toLowerCase();
  if (normalised === "blitz") {
    return {
      baseMastery: 74,
      failureMastery: 16,
      minStabilityDays: 1.35,
      recallAnchor: 0.88,
      stabilityBoost: 0.16,
    };
  }
  if (normalised === "essay" || normalised === "written") {
    return {
      baseMastery: 94,
      failureMastery: 20,
      minStabilityDays: 4.2,
      recallAnchor: 0.97,
      stabilityBoost: 0.55,
    };
  }
  return {
    baseMastery: 82,
    failureMastery: 18,
    minStabilityDays: 2.2,
    recallAnchor: 0.93,
    stabilityBoost: 0.3,
  };
};

const deriveBaseMastery = (record = {}) => {
  if (record.baseMastery !== undefined) {
    return clamp(asNumber(record.baseMastery, 0), 0, 100);
  }
  if (record.status === "correct") return 82;
  if (record.status === "incorrect") return 18;
  return 0;
};

const deriveStabilityDays = (record = {}) => {
  const explicit = record.stabilityDays ?? record.memory?.stabilityDays;
  if (explicit !== undefined) return clamp(asNumber(explicit, 1), 0.25, 730);

  const consecutive = clamp(asNumber(record.consecutiveCorrect, 0), 0, 20);
  const baseMastery = deriveBaseMastery(record);
  const wasCorrect = record.status === "correct" || baseMastery >= 60;

  if (!wasCorrect) return 0.45;
  if (consecutive <= 0) return 1.4;
  if (consecutive === 1) return 2.4;
  if (consecutive === 2) return 6.5;
  if (consecutive === 3) return 15;

  return clamp(15 * 1.72 ** (consecutive - 3), 15, 730);
};

const deriveDifficulty = (record = {}) => {
  const explicit = record.difficulty ?? record.memory?.difficulty;
  if (explicit !== undefined) return clamp(asNumber(explicit, 5), 1, 10);

  const baseMastery = deriveBaseMastery(record);
  const consecutive = clamp(asNumber(record.consecutiveCorrect, 0), 0, 20);
  const lapses = clamp(asNumber(record.lapses ?? record.memory?.lapses, 0), 0, 30);
  const difficulty = 7.4 - consecutive * 0.42 - baseMastery / 45 + lapses * 0.24;
  return clamp(difficulty, 1.4, 9.6);
};

const deriveRecallAnchor = (record = {}) => {
  const explicit =
    record.retrievabilityAtReview ??
    record.retrievability ??
    record.memory?.retrievabilityAtReview;
  if (explicit !== undefined) return clamp(asNumber(explicit, 0.5), 0.05, 1);

  const baseMastery = deriveBaseMastery(record);
  if (record.status === "incorrect") return clamp(baseMastery / 100, 0.12, 0.55);
  if (record.status === "correct") return clamp((baseMastery + 8) / 100, 0.58, 0.98);
  return clamp(baseMastery / 100, 0, 0.95);
};

export const getForgettingCurve = (elapsedDays = 0, stabilityDays = 1) => {
  const safeElapsed = Math.max(0, asNumber(elapsedDays, 0));
  const safeStability = Math.max(0.25, asNumber(stabilityDays, 1));
  if (safeElapsed === 0) return 1;
  return clamp(
    Math.pow(1 + FORGETTING_FACTOR * (safeElapsed / safeStability), -FORGETTING_DECAY),
    0,
    1
  );
};

export const getMemoryState = (record = {}, now = Date.now()) => {
  if (!record) {
    return {
      baseMastery: 0,
      daysSinceReview: 0,
      difficulty: 5,
      dueAt: 0,
      lapses: 0,
      mastery: 0,
      retrievability: 0,
      reviews: 0,
      stabilityDays: 0,
    };
  }

  const lastSeen = timestampToMillis(record.lastSeen || record.lastReviewedAt || record.timestamp);
  const daysSinceReview = lastSeen ? Math.max(0, (now - lastSeen) / DAY_MS) : 0;
  const stabilityDays = deriveStabilityDays(record);
  const difficulty = deriveDifficulty(record);
  const baseMastery = deriveBaseMastery(record);
  const recallAnchor = deriveRecallAnchor(record);
  const retrievability = clamp(
    recallAnchor * getForgettingCurve(daysSinceReview, stabilityDays),
    0,
    1
  );
  const mastery = Math.round(
    clamp(retrievability * 78 + baseMastery * 0.22, 0, 100)
  );

  return {
    baseMastery,
    daysSinceReview: round(daysSinceReview, 2),
    difficulty: round(difficulty, 2),
    dueAt: lastSeen ? lastSeen + stabilityDays * DAY_MS : 0,
    lapses: asNumber(record.lapses ?? record.memory?.lapses, 0),
    mastery,
    retrievability: round(retrievability, 4),
    reviews: asNumber(record.reviews ?? record.memory?.reviews, 0),
    stabilityDays: round(stabilityDays, 2),
  };
};

export const calculateCardMastery = (record, now = Date.now()) =>
  record ? getMemoryState(record, now).mastery : 0;

export const buildNextMemoryRecord = (
  previousRecord = {},
  { isCorrect, mode = "flashcard", now = Date.now(), scorePercent } = {}
) => {
  const prior = getMemoryState(previousRecord, now);
  const profile = getReviewModeProfile(mode);
  const previousConsecutive = asNumber(previousRecord?.consecutiveCorrect, 0);
  const previousLapses = asNumber(previousRecord?.lapses ?? previousRecord?.memory?.lapses, 0);
  const previousReviews = asNumber(previousRecord?.reviews ?? previousRecord?.memory?.reviews, 0);
  const previousBaseMastery = deriveBaseMastery(previousRecord);

  if (isCorrect) {
    const qualityBoost =
      scorePercent !== undefined
        ? clamp(asNumber(scorePercent, 100) / 100, 0.58, 1.08)
        : 1;
    const surpriseBoost = 1 + (1 - prior.retrievability) * 0.95;
    const easeBoost = 1 + (10 - prior.difficulty) * 0.045 + profile.stabilityBoost;
    const repeatBoost = 1 + Math.min(0.38, previousConsecutive * 0.055);
    const stabilityDays = clamp(
      Math.max(
        profile.minStabilityDays,
        prior.stabilityDays * surpriseBoost * easeBoost * repeatBoost * qualityBoost
      ),
      0.5,
      730
    );
    const difficulty = clamp(prior.difficulty - 0.32 - profile.stabilityBoost * 0.28, 1, 10);
    const baseMastery = clamp(
      Math.max(profile.baseMastery, previousBaseMastery * 0.86 + profile.baseMastery * 0.2),
      0,
      100
    );

    return {
      baseMastery: Math.round(baseMastery),
      consecutiveCorrect: previousConsecutive + 1,
      difficulty: round(difficulty),
      dueAt: Math.round(now + stabilityDays * DAY_MS),
      lapses: previousLapses,
      lastMode: mode,
      lastSeen: now,
      memoryModelVersion: MEMORY_MODEL_VERSION,
      retrievabilityAtReview: profile.recallAnchor,
      reviews: previousReviews + 1,
      stabilityDays: round(stabilityDays),
      status: "correct",
    };
  }

  const stabilityDays = clamp(
    prior.stabilityDays * (0.34 + prior.retrievability * 0.22),
    0.28,
    Math.max(1.2, prior.stabilityDays * 0.68)
  );
  const difficulty = clamp(prior.difficulty + 0.7 + (prior.retrievability > 0.72 ? 0.25 : 0), 1, 10);
  const baseMastery = clamp(
    Math.min(profile.failureMastery + previousLapses * 2, previousBaseMastery * 0.34),
    8,
    42
  );

  return {
    baseMastery: Math.round(baseMastery),
    consecutiveCorrect: 0,
    difficulty: round(difficulty),
    dueAt: Math.round(now + stabilityDays * DAY_MS),
    lapses: previousLapses + 1,
    lastMode: mode,
    lastSeen: now,
    memoryModelVersion: MEMORY_MODEL_VERSION,
    retrievabilityAtReview: 0.18,
    reviews: previousReviews + 1,
    stabilityDays: round(stabilityDays),
    status: "incorrect",
  };
};
