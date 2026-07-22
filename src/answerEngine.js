const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "any",
  "are",
  "because",
  "been",
  "before",
  "being",
  "between",
  "both",
  "but",
  "can",
  "could",
  "does",
  "for",
  "from",
  "has",
  "have",
  "into",
  "its",
  "made",
  "main",
  "may",
  "more",
  "not",
  "off",
  "one",
  "only",
  "other",
  "over",
  "than",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "they",
  "this",
  "through",
  "used",
  "uses",
  "using",
  "when",
  "where",
  "which",
  "with",
  "would",
]);

const FALLBACK_DISTRACTORS = [
  "A decorative feature with little effect on function or manufacture.",
  "A temporary planning method used before final production decisions are made.",
  "A general design consideration that is not the main answer for this question.",
  "A quality-control check carried out after the product has already been completed.",
];

export const normalizeAnswerText = (value = "") =>
  String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const stemToken = (token) =>
  token
    .replace(/(ing|ers|ies|ied|ed|ly|es|s)$/i, "")
    .replace(/i$/i, "y");

export const getAnswerKeywords = (value = "") =>
  Array.from(
    new Set(
      normalizeAnswerText(value)
        .split(" ")
        .map(stemToken)
        .filter((token) => token.length > 3 && !STOP_WORDS.has(token))
    )
  );

const stableHash = (value = "") =>
  String(value)
    .split("")
    .reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 2166136261);

const stableShuffle = (items, seed = "") => {
  const seedHash = stableHash(seed);
  return [...items]
    .map((item, index) => ({
      item,
      sortKey: stableHash(`${seedHash}-${index}-${item.id || item.text || ""}`),
    }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ item }) => item);
};

const normalizeOptionText = (value = "") => normalizeAnswerText(value).slice(0, 220);

const getCardContext = (cardId, chapters = []) => {
  for (const chapter of chapters || []) {
    for (const subsection of chapter.subsections || []) {
      if ((subsection.cards || []).some((card) => card.id === cardId)) {
        return {
          chapter,
          subsection,
          subsectionCards: subsection.cards || [],
          chapterCards: (chapter.subsections || []).flatMap((item) => item.cards || []),
        };
      }
    }
  }
  return { chapter: null, subsection: null, subsectionCards: [], chapterCards: [] };
};

const pushUniqueDistractors = (target, cards, correctCard, seen) => {
  (cards || []).forEach((candidate) => {
    if (!candidate || candidate.id === correctCard?.id || !candidate.back) return;
    const key = normalizeOptionText(candidate.back);
    if (!key || seen.has(key)) return;
    seen.add(key);
    target.push({
      id: candidate.id,
      text: candidate.back,
      source: "curriculum",
      isCorrect: false,
    });
  });
};

export const buildFlashcardOptions = (card, chapters = [], optionCount = 4) => {
  if (!card?.id || !card?.back) return [];

  const allCards = (chapters || []).flatMap((chapter) =>
    (chapter.subsections || []).flatMap((subsection) => subsection.cards || [])
  );
  const context = getCardContext(card.id, chapters);
  const seen = new Set([normalizeOptionText(card.back)]);
  const distractors = [];

  pushUniqueDistractors(distractors, stableShuffle(context.subsectionCards, `${card.id}-subsection`), card, seen);
  pushUniqueDistractors(distractors, stableShuffle(context.chapterCards, `${card.id}-chapter`), card, seen);
  pushUniqueDistractors(distractors, stableShuffle(allCards, `${card.id}-subject`), card, seen);

  FALLBACK_DISTRACTORS.forEach((text, index) => {
    if (distractors.length >= optionCount - 1) return;
    const key = normalizeOptionText(text);
    if (seen.has(key)) return;
    seen.add(key);
    distractors.push({
      id: `fallback-${index + 1}`,
      text,
      source: "fallback",
      isCorrect: false,
    });
  });

  const selectedDistractors = distractors.slice(0, Math.max(0, optionCount - 1));
  return stableShuffle(
    [
      {
        id: card.id,
        text: card.back,
        source: "correct",
        isCorrect: true,
      },
      ...selectedDistractors,
    ],
    `${card.id}-answer-options`
  );
};

const pointHitThreshold = (keywords) => {
  if (keywords.length <= 2) return keywords.length;
  if (keywords.length <= 5) return 2;
  return Math.ceil(keywords.length * 0.42);
};

export const markWrittenAnswer = (question, answerText = "") => {
  const maxMarks = Math.max(1, Number(question?.marks) || 1);
  const trimmedAnswer = String(answerText || "").trim();
  const answerKeywords = new Set(getAnswerKeywords(trimmedAnswer));
  const points = Array.isArray(question?.points) ? question.points.filter(Boolean) : [];

  if (!trimmedAnswer) {
    return {
      score: 0,
      maxMarks,
      percent: 0,
      matchedPoints: [],
      missedPoints: points,
      confidence: "high",
      reason: "No answer entered.",
    };
  }

  const evaluated = points.map((point) => {
    const keywords = getAnswerKeywords(point);
    const matchedKeywords = keywords.filter((keyword) => answerKeywords.has(keyword));
    const hit =
      keywords.length === 0
        ? normalizeAnswerText(trimmedAnswer).includes(normalizeAnswerText(point))
        : matchedKeywords.length >= pointHitThreshold(keywords);
    return { point, keywords, matchedKeywords, hit };
  });

  const matchedPoints = evaluated.filter((item) => item.hit).map((item) => item.point);
  const missedPoints = evaluated.filter((item) => !item.hit).map((item) => item.point);
  const rawScore =
    points.length > 0
      ? matchedPoints.length
      : getAnswerKeywords(question?.question || "").filter((keyword) => answerKeywords.has(keyword))
          .length > 0
        ? 1
        : 0;
  const score = Math.min(maxMarks, rawScore);
  const percent = Math.round((score / maxMarks) * 100);
  const coverage = points.length > 0 ? matchedPoints.length / points.length : score / maxMarks;
  const hasReachedFullMarks = score >= maxMarks;

  return {
    score,
    maxMarks,
    percent,
    matchedPoints,
    missedPoints: hasReachedFullMarks ? [] : missedPoints,
    confidence: hasReachedFullMarks || coverage === 0 || coverage >= 0.75 ? "high" : "medium",
    reason:
      score > 0
        ? `Matched ${score} of ${maxMarks} mark point${maxMarks === 1 ? "" : "s"}.`
        : "No mark-scheme keywords were detected.",
  };
};
