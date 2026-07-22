import React, { useState, useEffect, memo } from "react";
import { buildFlashcardOptions, markWrittenAnswer } from "../answerEngine";

export const QuizCard = memo(({ card, chapters = [], onAnswer, onFlag, onReveal, count }) => {
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [hasAnswered, setHasAnswered] = useState(false);

  useEffect(() => {
    setSelectedOptionId("");
    setHasAnswered(false);
  }, [card?.id]);

  if (!card) return null;
  const answerOptions = buildFlashcardOptions(card, chapters);
  const selectedOption = answerOptions.find((option) => option.id === selectedOptionId);
  const correctOption = answerOptions.find((option) => option.isCorrect);

  const chooseOption = (option) => {
    if (hasAnswered) return;
    setSelectedOptionId(option.id);
    setHasAnswered(true);
    onReveal?.(card.id);
  };

  return (
    <div className="flashcard glass-panel">
      {count !== undefined && <div className="label">REMAINING: {count}</div>}
      {card.imageUrl && (
        <img
          src={card.imageUrl}
          alt={card.front}
          style={{ width: "100%", borderRadius: "10px", marginBottom: "15px" }}
        />
      )}
      <div>
        <div className="label">QUESTION</div>
        <div className="pre-line" style={{ fontSize: "1.25rem" }}>
          <b>{card.front}</b>
        </div>
      </div>

      <div className="answer-option-grid" aria-label="Answer options">
        {answerOptions.map((option, index) => {
          const isSelected = option.id === selectedOptionId;
          const shouldShowCorrect = hasAnswered && option.isCorrect;
          const shouldShowWrong = hasAnswered && isSelected && !option.isCorrect;
          return (
            <button
              key={`${option.id}-${index}`}
              type="button"
              className={`answer-option ${shouldShowCorrect ? "is-correct" : ""} ${
                shouldShowWrong ? "is-wrong" : ""
              } ${isSelected ? "is-selected" : ""}`}
              onClick={() => chooseOption(option)}
              disabled={hasAnswered}
            >
              <span className="answer-option-letter">
                {String.fromCharCode(65 + index)}
              </span>
              <span className="pre-line">{option.text}</span>
            </button>
          );
        })}
      </div>

      {hasAnswered && (
        <div className={`answer-feedback ${selectedOption?.isCorrect ? "is-correct" : "is-wrong"}`}>
          <b>{selectedOption?.isCorrect ? "Correct" : "Not quite"}</b>
          {!selectedOption?.isCorrect && correctOption && (
            <span className="pre-line">Correct answer: {correctOption.text}</span>
          )}
        </div>
      )}

      <div style={{ marginTop: "24px" }}>
        {hasAnswered ? (
          <button
            className="btn-primary"
            onClick={() => onAnswer(Boolean(selectedOption?.isCorrect))}
          >
            Continue
          </button>
        ) : (
          <p className="muted-copy" style={{ margin: 0 }}>
            Pick the best answer. Sharp Study will mark it automatically.
          </p>
        )}
      </div>
      <button
        type="button"
        className="back-link"
        onClick={() => {
          const comment = window.prompt("What looks wrong with this question?");
          if (comment?.trim()) onFlag?.(card.id, comment.trim(), "flashcard");
        }}
        style={{ marginTop: "15px" }}
      >
        Flag Error
      </button>
    </div>
  );
});

export const WrittenQuizCard = memo(({ question, onFlag, onSubmit, onReveal, count }) => {
  const [answerText, setAnswerText] = useState("");
  const [markResult, setMarkResult] = useState(null);

  useEffect(() => {
    setAnswerText("");
    setMarkResult(null);
  }, [question?.id]);

  if (!question) return null;

  const submitForMarking = () => {
    const result = markWrittenAnswer(question, answerText);
    setMarkResult(result);
    onReveal?.(question.id);
  };

  const requestMarkingReview = () => {
    const reason = window.prompt(
      "What should the reviewer know about your answer?",
      "I think my answer includes the required point because..."
    );
    const trimmedReason = reason?.trim();
    if (!trimmedReason) return;
    onFlag?.(
      question.id,
      [
        "Automatic marking review requested.",
        `Student reason: ${trimmedReason}`,
        `Auto score: ${markResult?.score || 0}/${markResult?.maxMarks || question.marks}`,
        "Typed answer is not attached automatically for privacy; ask the student to show it in person if needed.",
      ].join("\n"),
      "written-marking"
    );
  };

  return (
    <div className="flashcard glass-panel">
      {count !== undefined && <div className="label">REMAINING: {count}</div>}
      <h2 style={{ color: "var(--primary)", marginBottom: "10px" }}>
        {question.marks} Marks
      </h2>

      {(question.imageUrl || (question.imageRequired && question.imageRequired !== "null")) && (
        <div
          style={{
            marginBottom: "20px",
            padding: "10px",
            background: "rgba(0,0,0,0.3)",
            borderRadius: "10px",
          }}
        >
          <img
            src={question.imageUrl || `/images/${question.id}.png?v=2`}
            alt="Exam Reference Material"
            style={{ width: "100%", borderRadius: "5px" }}
            onError={(e) => {
              e.target.onerror = null;
              e.target.style.display = "none";
            }}
          />
          <div
            style={{
              fontSize: "0.8rem",
              color: "var(--text-muted)",
              textAlign: "center",
              marginTop: "5px",
            }}
          >
            Figure: Reference Material
          </div>
        </div>
      )}

      <div className="pre-line" style={{ marginBottom: "25px" }}>
        <b>{question.question}</b>
      </div>
      <textarea
        className="input-field glass-panel"
        rows="5"
        placeholder="Type your answer here..."
        value={answerText}
        onChange={(event) => setAnswerText(event.target.value)}
        readOnly={Boolean(markResult)}
      />

      {!markResult ? (
        <button
          className="btn-primary"
          onClick={submitForMarking}
        >
          Check Answer
        </button>
      ) : (
        <div style={{ marginTop: "25px" }}>
          <div className={`written-mark-panel ${markResult.percent >= 70 ? "is-correct" : "is-wrong"}`}>
            <div>
              <span className="label">AUTO MARK</span>
              <h2>
                {markResult.score}/{markResult.maxMarks} marks
              </h2>
              <p>{markResult.reason}</p>
            </div>
            {markResult.confidence === "medium" && (
              <p className="table-subtext">
                This is a keyword check, so use the review button if your wording
                is correct but phrased differently.
              </p>
            )}
          </div>

          {markResult.matchedPoints.length > 0 && (
            <div className="mark-point-list">
              <div className="label">Matched points</div>
              {markResult.matchedPoints.map((point, index) => (
                <div key={`matched-${index}`} className="mark-point is-matched">
                  {point}
                </div>
              ))}
            </div>
          )}

          {markResult.missedPoints.length > 0 && (
            <div className="mark-point-list">
              <div className="label">Still to include</div>
              {markResult.missedPoints.map((point, index) => (
                <div key={`missed-${index}`} className="mark-point">
                  {point}
                </div>
              ))}
            </div>
          )}

          <div className="btn-group">
            <button
              type="button"
              className="logout-btn"
              onClick={requestMarkingReview}
            >
              Request Review
            </button>
            <button
              type="button"
              className="logout-btn"
              onClick={() => {
                setMarkResult(null);
                setAnswerText("");
              }}
            >
              Try Again
            </button>
          </div>
          <button
            className="btn-primary"
            style={{ background: "var(--green)" }}
            onClick={() =>
              onSubmit(markResult.score, markResult.maxMarks, {
                answerMethod: "keyword-auto-mark",
                percent: markResult.percent,
                confidence: markResult.confidence,
              })
            }
          >
            Save Score ({markResult.score}/{markResult.maxMarks})
          </button>
        </div>
      )}
      <button
        type="button"
        className="back-link"
        onClick={() => {
          const comment = window.prompt("What looks wrong with this written question?");
          if (comment?.trim()) onFlag?.(question.id, comment.trim(), "written");
        }}
        style={{ marginTop: "15px" }}
      >
        Flag Error
      </button>
    </div>
  );
});
