import {
  buildFlashcardOptions,
  markWrittenAnswer,
  normalizeAnswerText,
} from "./answerEngine";

const chapters = [
  {
    id: "ch1",
    title: "Chapter 1",
    subsections: [
      {
        id: "ch1-a",
        title: "1.1 Materials",
        cards: [
          { id: "oak", front: "Oak", back: "Hard, tough hardwood with an attractive grain." },
          { id: "pine", front: "Pine", back: "Lightweight softwood with knots in the grain." },
          { id: "mdf", front: "MDF", back: "Manufactured board with a smooth, stable surface." },
          { id: "plywood", front: "Plywood", back: "Layered board with alternating grain directions." },
        ],
      },
    ],
  },
];

describe("answer engine", () => {
  test("normalises answer text for matching", () => {
    expect(normalizeAnswerText("Hard-wearing & Tough!")).toBe("hard wearing and tough");
  });

  test("builds four multiple-choice options with exactly one correct answer", () => {
    const card = chapters[0].subsections[0].cards[0];
    const options = buildFlashcardOptions(card, chapters);

    expect(options).toHaveLength(4);
    expect(options.filter((option) => option.isCorrect)).toHaveLength(1);
    expect(options.some((option) => option.text === card.back)).toBe(true);
  });

  test("marks blank written answers as zero with a high-confidence reason", () => {
    const result = markWrittenAnswer(
      {
        id: "q1",
        marks: 2,
        points: ["Explain that hardwoods are durable.", "Give a suitable product example."],
      },
      ""
    );

    expect(result.score).toBe(0);
    expect(result.percent).toBe(0);
    expect(result.reason).toBe("No answer entered.");
  });

  test("marks written answers by detecting mark-scheme keywords", () => {
    const result = markWrittenAnswer(
      {
        id: "q2",
        marks: 2,
        points: [
          "Acrylic is a thermoplastic.",
          "It can be line bent when heated.",
        ],
      },
      "Acrylic is a thermoplastic material and heat allows it to be line bent."
    );

    expect(result.score).toBe(2);
    expect(result.percent).toBe(100);
    expect(result.matchedPoints).toHaveLength(2);
    expect(result.missedPoints).toHaveLength(0);
  });
});
