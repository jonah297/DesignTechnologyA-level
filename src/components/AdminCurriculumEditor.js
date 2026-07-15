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

const getChapterNumber = (value) => {
  const match = String(value || "").match(/\d+/);
  return match ? match[0] : "";
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
  const [expandedChapterIds, setExpandedChapterIds] = useState([]);
  const chapterKey = (selectedCurriculum?.chapters || [])
    .map((chapter) => chapter.id)
    .join("|");
  const firstChapterId = selectedCurriculum?.chapters?.[0]?.id || "";

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
    setExpandedChapterIds(firstChapterId ? [firstChapterId] : []);
  }, [chapterKey, firstChapterId, selectedSubjectId]);

  const selectItem = (item) => {
    setDraft(makeDraftFromItem(item, item.type));
  };

  const toggleChapter = (chapterId) =>
    setExpandedChapterIds((prev) =>
      prev.includes(chapterId)
        ? prev.filter((id) => id !== chapterId)
        : [...prev, chapterId]
    );

  const getWrittenQuestionsForChapter = (chapter) => {
    const chapterNumber = getChapterNumber(chapter.id || chapter.title);
    return writtenQuestions.filter(
      (question) => getChapterNumber(question.topic) === chapterNumber
    );
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

      <div className="editor-grid">
        <div className="glass-panel">
          <h2>Questions</h2>
          {(selectedCurriculum?.chapters || []).map((chapter) => {
            const expanded = expandedChapterIds.includes(chapter.id);
            const chapterWrittenQuestions = getWrittenQuestionsForChapter(chapter);
            const cardCount = (chapter.subsections || []).reduce(
              (total, subsection) => total + (subsection.cards || []).length,
              0
            );

            return (
              <section key={chapter.id} className="curriculum-section">
                <button
                  type="button"
                  className="chapter-toggle"
                  onClick={() => toggleChapter(chapter.id)}
                >
                  <span>
                    <b>{chapter.title}</b>
                    <span>
                      {cardCount} flashcards · {chapterWrittenQuestions.length} long answer
                    </span>
                  </span>
                  <span aria-hidden="true">{expanded ? "Hide" : "Open"}</span>
                </button>

                {expanded && (
                  <div className="chapter-details">
                    {(chapter.subsections || []).map((subsection) => (
                      <div key={subsection.id} className="subsection-block">
                        <div className="subsection-heading">
                          <b>{subsection.title}</b>
                          <span>{(subsection.cards || []).length} cards</span>
                        </div>
                        <div className="question-list">
                          {(subsection.cards || []).map((card) => (
                            <button
                              key={card.id}
                              className="question-picker"
                              type="button"
                              onClick={() =>
                                selectItem({
                                  ...card,
                                  chapterId: chapter.id,
                                  chapterTitle: chapter.title,
                                  subsectionId: subsection.id,
                                  subsectionTitle: subsection.title,
                                  type: "flashcard",
                                })
                              }
                            >
                              <b>{card.id}</b>
                              <span>{card.front}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}

                    <div className="subsection-block long-answer-block">
                      <div className="subsection-heading">
                        <b>Long Answer Questions</b>
                        <span>{chapterWrittenQuestions.length} questions</span>
                      </div>
                      {chapterWrittenQuestions.length === 0 ? (
                        <p className="muted-copy">No long answer questions for this chapter yet.</p>
                      ) : (
                        <div className="question-list">
                          {chapterWrittenQuestions.map((question) => (
                            <button
                              key={question.id}
                              className="question-picker"
                              type="button"
                              onClick={() => selectItem(question)}
                            >
                              <b>{question.id}</b>
                              <span>{question.question}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
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
