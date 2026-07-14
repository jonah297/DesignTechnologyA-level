import React, { useState, useEffect, memo } from "react";

export const QuizCard = memo(({ card, onAnswer, onReveal, count }) => {
  const [rev, setRev] = useState(false);

  useEffect(() => {
    setRev(false);
  }, [card?.id]);

  if (!card) return null;

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

      {rev && (
        <div
          style={{
            marginTop: "25px",
            borderTop: "1px solid var(--glass-border)",
            paddingTop: "25px",
          }}
        >
          <div className="label">ANSWER</div>
          <div
            className="pre-line"
            style={{ color: "var(--primary)", fontWeight: "500" }}
          >
            {card.back}
          </div>
        </div>
      )}

      <div style={{ marginTop: "30px" }}>
        {!rev ? (
          <button
            className="btn-primary"
            onClick={() => {
              setRev(true);
              onReveal?.(card.id);
            }}
          >
            Show Answer
          </button>
        ) : (
          <div className="btn-group">
            <button className="btn-red" onClick={() => onAnswer(false)}>
              Wrong
            </button>
            <button className="btn-green" onClick={() => onAnswer(true)}>
              Right
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

export const WrittenQuizCard = memo(({ question, onSubmit, onReveal, count }) => {
  const [showAnswer, setShowAnswer] = useState(false);
  const [checkedBoxes, setCheckedBoxes] = useState([]);

  useEffect(() => {
    setShowAnswer(false);
    setCheckedBoxes([]);
  }, [question?.id]);

  if (!question) return null;
  const maxMarksHit = checkedBoxes.length >= question.marks;

  return (
    <div className="flashcard glass-panel">
      {count !== undefined && <div className="label">REMAINING: {count}</div>}
      <h2 style={{ color: "var(--primary)", marginBottom: "10px" }}>
        {question.marks} Marks
      </h2>

      {question.imageRequired && question.imageRequired !== "null" && (
        <div
          style={{
            marginBottom: "20px",
            padding: "10px",
            background: "rgba(0,0,0,0.3)",
            borderRadius: "10px",
          }}
        >
          <img
            src={`/images/${question.id}.png?v=2`}
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
        readOnly={showAnswer}
      />

      {!showAnswer ? (
        <button
          className="btn-primary"
          onClick={() => {
            setShowAnswer(true);
            onReveal?.(question.id);
          }}
        >
          Show Mark Scheme
        </button>
      ) : (
        <div style={{ marginTop: "25px" }}>
          <div className="filter-list">
            {question.points.map((point, index) => (
              <label key={index} className="filter-item glass-panel">
                <input
                  type="checkbox"
                  checked={checkedBoxes.includes(index)}
                  onChange={() => {
                    if (checkedBoxes.includes(index)) {
                      setCheckedBoxes((prev) =>
                        prev.filter((i) => i !== index)
                      );
                    } else if (!maxMarksHit) {
                      setCheckedBoxes((prev) => [...prev, index]);
                    }
                  }}
                />
                <span>{point}</span>
              </label>
            ))}
          </div>
          <button
            className="btn-primary"
            style={{ background: "var(--green)" }}
            onClick={() => onSubmit(checkedBoxes.length, question.marks)}
          >
            Submit ({checkedBoxes.length}/{question.marks})
          </button>
        </div>
      )}
    </div>
  );
});
