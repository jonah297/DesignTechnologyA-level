import React, { memo, useEffect, useMemo, useState } from "react";

const makeDraftFromItem = (item, type) => {
  if (!item) return null;
  if (type === "written") {
    return {
      id: item.id,
      type,
      topic: item.topic || "",
      question: item.question || "",
      marks: item.marks || 1,
      pointsText: (item.points || []).join("\n"),
      imageUrl: item.imageUrl || "",
      imageRequired: item.imageRequired || "",
    };
  }

  return {
    id: item.id,
    type,
    front: item.front || "",
    back: item.back || "",
    imageUrl: item.imageUrl || "",
  };
};

export const AdminCurriculumEditor = memo(function AdminCurriculumEditor({
  curriculums,
  flaggedContent,
  onSaveFlashcard,
  onSaveWrittenQuestion,
  onSeedDefaultCurriculum,
  onSelectSubject,
  selectedSubjectId,
}) {
  const selectedCurriculum =
    curriculums.find((curriculum) => curriculum.id === selectedSubjectId) || curriculums[0];
  const [draft, setDraft] = useState(null);

  const flashcards = useMemo(
    () =>
      (selectedCurriculum?.chapters || []).flatMap((chapter) =>
        (chapter.subsections || []).flatMap((subsection) =>
          (subsection.cards || []).map((card) => ({
            ...card,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            subsectionId: subsection.id,
            subsectionTitle: subsection.title,
            type: "flashcard",
          }))
        )
      ),
    [selectedCurriculum]
  );

  const writtenQuestions = useMemo(
    () =>
      (selectedCurriculum?.writtenQuestions || []).map((question) => ({
        ...question,
        type: "written",
      })),
    [selectedCurriculum]
  );

  useEffect(() => {
    setDraft(null);
  }, [selectedSubjectId]);

  const selectItem = (item) => {
    setDraft(makeDraftFromItem(item, item.type));
  };

  const saveDraft = () => {
    if (!draft || !selectedCurriculum) return;

    if (draft.type === "written") {
      onSaveWrittenQuestion(selectedCurriculum.id, draft.id, {
        topic: draft.topic,
        question: draft.question,
        marks: Math.max(1, Number(draft.marks) || 1),
        points: draft.pointsText
          .split("\n")
          .map((point) => point.trim())
          .filter(Boolean),
        imageUrl: draft.imageUrl.trim(),
        imageRequired: draft.imageRequired,
      });
      return;
    }

    onSaveFlashcard(selectedCurriculum.id, draft.id, {
      front: draft.front,
      back: draft.back,
      imageUrl: draft.imageUrl.trim(),
    });
  };

  return (
    <>
      <div className="glass-panel" style={{ marginBottom: "20px" }}>
        <h2>Curriculum Architect</h2>
        <p style={{ color: "var(--text-muted)" }}>
          Edit live curriculum content without changing immutable question IDs.
        </p>

        <label>
          <span className="label">Subject</span>
          <select
            className="input-field"
            value={selectedCurriculum?.id || ""}
            onChange={(event) => onSelectSubject(event.target.value)}
          >
            {curriculums.map((curriculum) => (
              <option key={curriculum.id} value={curriculum.id}>
                {curriculum.subjectName || curriculum.title}
              </option>
            ))}
          </select>
        </label>

        <button className="btn-primary" onClick={onSeedDefaultCurriculum}>
          Seed Design Technology Curriculum
        </button>
      </div>

      <div className="glass-panel" style={{ marginBottom: "20px" }}>
        <h2>Flagged Content</h2>
        {flaggedContent.length === 0 ? (
          <p style={{ color: "var(--text-muted)", margin: 0 }}>
            No student content flags are waiting for review.
          </p>
        ) : (
          <div className="filter-list" style={{ marginBottom: 0 }}>
            {flaggedContent.map((flag) => (
              <div
                key={flag.id}
                className="filter-item glass-panel"
                style={{ alignItems: "flex-start" }}
              >
                <div>
                  <b>{flag.contentId}</b>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    {flag.subjectId} · {flag.contentType} · {flag.userId}
                  </div>
                  <div style={{ marginTop: "8px" }}>{flag.comment}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(240px, 0.9fr) minmax(280px, 1.1fr)",
          gap: "20px",
        }}
      >
        <div className="glass-panel">
          <h2>Questions</h2>
          <div className="filter-list" style={{ marginBottom: 0 }}>
            {flashcards.map((card) => (
              <button
                key={card.id}
                className="filter-item glass-panel"
                onClick={() => selectItem(card)}
                style={{ color: "var(--text)", textAlign: "left", alignItems: "flex-start" }}
              >
                <span>
                  <b>{card.id}</b>
                  <span style={{ display: "block", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                    Flashcard · {card.chapterTitle}
                  </span>
                </span>
              </button>
            ))}

            {writtenQuestions.map((question) => (
              <button
                key={question.id}
                className="filter-item glass-panel"
                onClick={() => selectItem(question)}
                style={{ color: "var(--text)", textAlign: "left", alignItems: "flex-start" }}
              >
                <span>
                  <b>{question.id}</b>
                  <span style={{ display: "block", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                    Written · {question.topic}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="glass-panel">
          <h2>Live Editor</h2>
          {!draft ? (
            <p style={{ color: "var(--text-muted)", margin: 0 }}>
              Select a flashcard or written question to edit.
            </p>
          ) : (
            <>
              <p style={{ color: "var(--text-muted)" }}>
                Immutable ID: <b style={{ color: "var(--primary)" }}>{draft.id}</b>
              </p>

              {draft.type === "written" ? (
                <>
                  <label>
                    <span className="label">Topic</span>
                    <input
                      className="input-field"
                      value={draft.topic}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, topic: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span className="label">Question Text</span>
                    <textarea
                      className="input-field"
                      rows="5"
                      value={draft.question}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, question: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span className="label">Marks</span>
                    <input
                      className="input-field"
                      type="number"
                      min="1"
                      value={draft.marks}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, marks: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span className="label">Mark Scheme Points</span>
                    <textarea
                      className="input-field"
                      rows="8"
                      value={draft.pointsText}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, pointsText: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span className="label">Image URL</span>
                    <input
                      className="input-field"
                      value={draft.imageUrl}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, imageUrl: event.target.value }))
                      }
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    <span className="label">Question Text</span>
                    <textarea
                      className="input-field"
                      rows="5"
                      value={draft.front}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, front: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span className="label">Answer Text</span>
                    <textarea
                      className="input-field"
                      rows="8"
                      value={draft.back}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, back: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span className="label">Image URL</span>
                    <input
                      className="input-field"
                      value={draft.imageUrl}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, imageUrl: event.target.value }))
                      }
                    />
                  </label>
                </>
              )}

              <button className="btn-primary" onClick={saveDraft}>
                Save Without Changing ID
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
});
