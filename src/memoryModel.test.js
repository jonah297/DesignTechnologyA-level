import {
  buildNextMemoryRecord,
  calculateCardMastery,
  getForgettingCurve,
  getMemoryState,
} from "./memoryModel";

const NOW = Date.UTC(2026, 6, 23, 12, 0, 0);
const DAY_MS = 86400000;

describe("Sharp Study memory model", () => {
  test("keeps the forgetting curve gentle shortly after review", () => {
    expect(getForgettingCurve(0, 7)).toBe(1);
    expect(getForgettingCurve(1, 7)).toBeGreaterThan(0.98);
    expect(getForgettingCurve(30, 7)).toBeLessThan(0.72);
  });

  test("creates a useful memory record after a correct quiz answer", () => {
    const next = buildNextMemoryRecord(
      {},
      { isCorrect: true, mode: "flashcard", now: NOW }
    );
    const state = getMemoryState(next, NOW);

    expect(next.memoryModelVersion).toBe("sharp-dsr-1");
    expect(next.status).toBe("correct");
    expect(next.stabilityDays).toBeGreaterThanOrEqual(2.2);
    expect(state.mastery).toBeGreaterThanOrEqual(88);
  });

  test("decays mastery over time without collapsing overnight", () => {
    const reviewed = buildNextMemoryRecord(
      {},
      { isCorrect: true, mode: "flashcard", now: NOW }
    );

    expect(calculateCardMastery(reviewed, NOW + DAY_MS)).toBeGreaterThan(86);
    expect(calculateCardMastery(reviewed, NOW + 30 * DAY_MS)).toBeLessThan(78);
  });

  test("repeated correct answers increase stability", () => {
    const first = buildNextMemoryRecord(
      {},
      { isCorrect: true, mode: "flashcard", now: NOW }
    );
    const second = buildNextMemoryRecord(first, {
      isCorrect: true,
      mode: "flashcard",
      now: NOW + 3 * DAY_MS,
    });

    expect(second.stabilityDays).toBeGreaterThan(first.stabilityDays);
    expect(second.consecutiveCorrect).toBe(2);
  });

  test("wrong answers lower mastery and record a lapse", () => {
    const strong = buildNextMemoryRecord(
      { baseMastery: 96, consecutiveCorrect: 4, lastSeen: NOW - 2 * DAY_MS, status: "correct" },
      { isCorrect: true, mode: "flashcard", now: NOW }
    );
    const lapse = buildNextMemoryRecord(strong, {
      isCorrect: false,
      mode: "flashcard",
      now: NOW + DAY_MS,
    });

    expect(lapse.status).toBe("incorrect");
    expect(lapse.lapses).toBe(1);
    expect(calculateCardMastery(lapse, NOW + DAY_MS)).toBeLessThan(35);
  });

  test("written recall is stronger evidence than a blitz answer", () => {
    const blitz = buildNextMemoryRecord({}, { isCorrect: true, mode: "blitz", now: NOW });
    const written = buildNextMemoryRecord({}, { isCorrect: true, mode: "written", now: NOW });

    expect(written.stabilityDays).toBeGreaterThan(blitz.stabilityDays);
    expect(calculateCardMastery(written, NOW)).toBeGreaterThan(
      calculateCardMastery(blitz, NOW)
    );
  });
});
