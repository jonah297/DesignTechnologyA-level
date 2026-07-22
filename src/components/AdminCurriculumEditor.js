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

const CURRICULUM_IMPORT_FORMAT = "SHARPSTUDY_CURRICULUM_BLOCK_V1";

const slugifyImportId = (value, fallback = "item") =>
  String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || fallback;

const getTopicCode = (value, fallback = "") => {
  const match = String(value || "").match(/\b\d+(?:\.\d+)*\b/);
  return match ? match[0] : String(fallback || value || "");
};

const curriculumBlockTemplate = {
  format: CURRICULUM_IMPORT_FORMAT,
  id: "aqa-design-technology-7552",
  subject: "design-technology",
  subjectName: "AQA Design Technology",
  examBoard: "AQA",
  specification: "7552",
  version: "2026-a",
  chapters: [
    {
      id: "aqa-dt-ch1",
      title: "Chapter 1: Materials",
      subsections: [
        {
          id: "aqa-dt-1-1",
          title: "1.1 Woods and Timbers",
          cards: [
            {
              id: "aqa-dt-1-1-card-001",
              front: "What is a key property of oak?",
              back: "Oak is hard, durable, resistant to wear, and has an attractive grain.",
              imageUrl: "",
            },
          ],
        },
      ],
      longAnswerQuestions: [
        {
          id: "aqa-dt-1-la-001",
          topic: "Chapter 1",
          question: "Explain why a hardwood may be selected for a premium furniture product.",
          marks: 6,
          points: [
            "Hardwoods can provide durability and wear resistance.",
            "Attractive grain can improve perceived quality.",
            "The material choice can support a premium market position.",
          ],
          imageUrl: "",
        },
      ],
    },
  ],
};

const parseCurriculumBlock = (rawText) => {
  const parsed = JSON.parse(rawText);
  const block = parsed.curriculum || parsed;

  if (block.format && block.format !== CURRICULUM_IMPORT_FORMAT) {
    throw new Error(`Use ${CURRICULUM_IMPORT_FORMAT}.`);
  }

  const subjectSeed =
    block.id ||
    [block.examBoard, block.subject || block.subjectName || block.title, block.specification]
      .filter(Boolean)
      .join("-");
  const subject = slugifyImportId(block.subject || block.subjectName || block.title, "subject");
  const id = slugifyImportId(subjectSeed || subject, subject);
  const writtenQuestions = [];

  const chapters = (block.chapters || []).map((chapter, chapterIndex) => {
    const chapterCode = getTopicCode(chapter.code || chapter.title || chapter.id, chapterIndex + 1);
    const chapterId = slugifyImportId(chapter.id || `${id}-ch-${chapterCode}`, `${id}-ch-${chapterIndex + 1}`);
    const chapterTitle = chapter.title || `Chapter ${chapterCode}`;

    (chapter.longAnswerQuestions || chapter.writtenQuestions || []).forEach((question, questionIndex) => {
      writtenQuestions.push({
        id: String(
          question.id ||
            `${chapterId}-la-${String(questionIndex + 1).padStart(3, "0")}`
        ),
        topic: question.topic || chapterTitle,
        question: question.question || question.prompt || "",
        marks: Math.max(1, Number(question.marks) || 1),
        points: Array.isArray(question.points)
          ? question.points
          : String(question.markScheme || question.answer || "")
              .split("\n")
              .map((point) => point.trim())
              .filter(Boolean),
        imageUrl: question.imageUrl || "",
        imageRequired: question.imageRequired || "",
      });
    });

    return {
      id: chapterId,
      title: chapterTitle,
      subsections: (chapter.subsections || []).map((subsection, subsectionIndex) => {
        const subsectionCode = getTopicCode(
          subsection.code || subsection.title || subsection.id,
          `${chapterCode}.${subsectionIndex + 1}`
        );
        const subsectionId = slugifyImportId(
          subsection.id || `${chapterId}-${subsectionCode}`,
          `${chapterId}-${subsectionIndex + 1}`
        );
        const cards = subsection.cards || subsection.flashcards || subsection.questions || [];

        return {
          id: subsectionId,
          title: subsection.title || `${subsectionCode}`,
          cards: cards.map((card, cardIndex) => ({
            id: String(
              card.id ||
                `${subsectionId}-card-${String(cardIndex + 1).padStart(3, "0")}`
            ),
            front: card.front || card.question || card.prompt || "",
            back: card.back || card.answer || card.markScheme || "",
            imageUrl: card.imageUrl || "",
          })),
        };
      }),
    };
  });

  (block.writtenQuestions || block.longAnswerQuestions || []).forEach((question, questionIndex) => {
    writtenQuestions.push({
      id: String(question.id || `${id}-la-${String(questionIndex + 1).padStart(3, "0")}`),
      topic: question.topic || "",
      question: question.question || question.prompt || "",
      marks: Math.max(1, Number(question.marks) || 1),
      points: Array.isArray(question.points)
        ? question.points
        : String(question.markScheme || question.answer || "")
            .split("\n")
            .map((point) => point.trim())
            .filter(Boolean),
      imageUrl: question.imageUrl || "",
      imageRequired: question.imageRequired || "",
    });
  });

  if (chapters.length === 0) {
    throw new Error("Add at least one chapter.");
  }

  return {
    id,
    subject,
    subjectName: block.subjectName || block.title || subject,
    title: block.title || block.subjectName || subject,
    examBoard: block.examBoard || "",
    specification: block.specification || "",
    version: block.version || "",
    importFormat: CURRICULUM_IMPORT_FORMAT,
    chapters,
    writtenQuestions,
    updatedAt: Date.now(),
  };
};

export const AdminCurriculumEditor = memo(function AdminCurriculumEditor({
  curriculums,
  flaggedContent,
  onImportCurriculum,
  onResolveFlag,
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
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [flagNotes, setFlagNotes] = useState({});
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

  const importCurriculum = async () => {
    setImportStatus("");
    try {
      const curriculum = parseCurriculumBlock(importText);
      await Promise.resolve(onImportCurriculum?.(curriculum));
      setImportStatus(
        `Imported ${curriculum.subjectName}: ${curriculum.chapters.length} chapters, ${curriculum.writtenQuestions.length} long answer questions.`
      );
    } catch (error) {
      setImportStatus(error.message || "Could not import that curriculum block.");
    }
  };

  const resolveFlag = (flag) => {
    onResolveFlag?.(flag, flagNotes[flag.id] || "");
    setFlagNotes((prev) => {
      const next = { ...prev };
      delete next[flag.id];
      return next;
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
        <h2>Bulk Curriculum Import</h2>
        <p style={{ color: "var(--text-muted)" }}>
          Paste a <b>{CURRICULUM_IMPORT_FORMAT}</b> JSON block to add a full subject,
          exam board, chapters, subsections, flashcards, and long answer questions.
        </p>
        <textarea
          className="input-field data-table-output"
          rows="12"
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          placeholder={`Paste ${CURRICULUM_IMPORT_FORMAT} JSON here`}
        />
        {importStatus && (
          <p style={{ color: importStatus.startsWith("Imported") ? "var(--green)" : "var(--red)" }}>
            {importStatus}
          </p>
        )}
        <div className="btn-group">
          <button className="btn-primary" onClick={importCurriculum}>
            Import Curriculum Block
          </button>
          <button
            className="logout-btn"
            onClick={() =>
              setImportText(JSON.stringify(curriculumBlockTemplate, null, 2))
            }
          >
            Insert Format Example
          </button>
        </div>
      </div>

      <div className="glass-panel" style={{ marginBottom: "20px" }}>
        <h2>Flagged Content</h2>
        {flaggedContent.length === 0 ? (
          <p style={{ color: "var(--text-muted)", margin: 0 }}>
            No student content flags are waiting for review.
          </p>
        ) : (
          <div className="filter-list flag-review-list" style={{ marginBottom: 0 }}>
            {flaggedContent.map((flag) => (
              <div
                key={flag.id}
                className="filter-item glass-panel flag-review-card"
                style={{ alignItems: "flex-start" }}
              >
                <div className="flag-review-copy">
                  <div className="flag-review-header">
                    <b>{flag.contentId}</b>
                    <span className="status-pill warning">Needs review</span>
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    {flag.subjectId} · {flag.contentType} ·{" "}
                    {flag.anonymous
                      ? "anonymous student feedback"
                      : flag.userId || "legacy feedback"}{" "}
                    · {(flag.classLabels || flag.classIds || []).join(", ") || "no class"}
                    {flag.schoolName ? ` · ${flag.schoolName}` : ""}
                  </div>
                  <div style={{ marginTop: "8px" }}>{flag.comment}</div>
                </div>
                <div className="flag-review-actions">
                  <label>
                    <span className="label">Review note</span>
                    <textarea
                      className="input-field compact-textarea"
                      rows="3"
                      value={flagNotes[flag.id] || ""}
                      onChange={(event) =>
                        setFlagNotes((prev) => ({
                          ...prev,
                          [flag.id]: event.target.value,
                        }))
                      }
                      placeholder="What changed, or why it is safe to close"
                    />
                  </label>
                  <button className="logout-btn compact-action-btn" onClick={() => resolveFlag(flag)}>
                    Mark Resolved
                  </button>
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
