# Sharp Study Memory Model Deep Analysis And Algorithm Review

Date: 23 July 2026

Purpose: analyse the 50-student, two-year synthetic cohort in detail, identify weaknesses in the learning algorithm stack, and develop the next algorithm layer from the evidence.

## Executive Verdict

The core `sharp-dsr-1` forgetting curve should not be replaced yet.

The two-year bulk run shows that the memory model separates learners in the right direction:

- strong, consistent students remain high and stable;
- pass-like students remain strong but show more assignment pressure;
- fail-like students have partial readiness, high refresh load, and weaker assignment completion;
- low-engagement students do not get inflated mastery.

The main weakness was not the decay curve itself. It was the support decision layer sitting around the memory model. The old support behaviour was too binary: students were either nudged/rewarded, but the system did not clearly distinguish between:

- low coverage;
- high refresh load;
- missed assignment pressure;
- repeated non-response to nudges;
- secure students who should simply be encouraged.

This review therefore develops a new exam-readiness and support-action algorithm.

## Data Used

The analysis uses:

- `docs/memory-model-two-year-bulk-analysis-2026-07-23.json`
- `docs/memory-model-two-year-bulk-students-2026-07-23.csv`
- `docs/memory-model-two-year-bulk-bands-2026-07-23.csv`

The simulation is calibrated from public/open learning analytics structures:

- Open University Learning Analytics Dataset: https://analyse.kmi.open.ac.uk/open_dataset
- Kuzilek, Hlosta and Zdrahal (2017), Scientific Data: https://doi.org/10.1038/sdata.2017.171
- ASSISTments public datasets: https://sites.google.com/site/assistmentsdata/assistments-pfa-data

Important limitation: this is still synthetic. The calibration is inspired by open data structures and common activity patterns, but it is not yet a fitted model from raw public CSV rows.

## Correlation Findings

Correlation with exam-readiness mastery across the 50 simulated students:

| Signal | Correlation With Exam Mastery | Meaning |
| --- | ---: | --- |
| Exam coverage | +0.966 | Coverage is the strongest positive signal. A student cannot be reported as ready if they have only touched part of the course. |
| Total accuracy | +0.874 | Accuracy is highly predictive, but only when shown beside coverage. |
| Study days | +0.765 | Consistency matters, but attendance alone is not enough. |
| Nudge response rate | +0.546 | Students who respond to nudges tend to perform better, but this is weaker than coverage and accuracy. |
| Exam refresh rate | -0.720 | High refresh load strongly predicts poor readiness. |
| Longest quiet run | -0.825 | Long silent periods are a major warning signal. |
| Assignments missed | -0.878 | Missed assignments are one of the clearest teacher-facing warning signals. |
| Nudge events | -0.891 | Lots of nudges usually means the student is in trouble; repeated nudging is a symptom, not a solution. |

## Before Development: Main Problems Found

1. `Learned-card mastery` can overstate students who only touched part of the course.

If a student repeatedly repairs a small number of cards, the learned-card average may look good while whole-course coverage is weak. This confirms that teacher dashboards must use coverage-weighted exam mastery as the headline metric.

2. Repeated nudges can become noise.

The model found many students with high nudge counts and low response rates. Sending the same reminder again is not a meaningful intervention.

3. Some active students still have high refresh load.

These students are not simply idle. They need guided Memory Repair, not generic encouragement.

4. Assignment completion needs to stay visible beside mastery.

Several pass-like students reached strong memory readiness while still missing too many assignments. That is useful information for teachers and should not be hidden by a single mastery score.

## Algorithm Developed

New file:

- `src/studentSupportAlgorithm.js`

New test file:

- `src/studentSupportAlgorithm.test.js`

The new algorithm calculates an `examReadinessScore` from:

| Factor | Weight / Role |
| --- | --- |
| Coverage | 32% |
| Exam mastery | 32% |
| Refresh health | 16% |
| Assignment health | 12% |
| Activity consistency | 8% |
| Nudge non-response penalty | Applied when reminders repeatedly fail |
| Missed assignment penalty | Applied when missed work dominates |
| Long quiet gap penalty | Applied for long inactivity |

The algorithm then classifies students:

| Score | Label |
| ---: | --- |
| 85-100 | Secure |
| 72-84 | On track |
| 58-71 | Watch |
| 40-57 | Intervention |
| 0-39 | Urgent support |

It also chooses a primary support action:

| Action | Meaning |
| --- | --- |
| `positive-reward` | High readiness, strong coverage, low refresh load. |
| `maintain` | No urgent issue dominates. |
| `guided-memory-repair` | Active student, but high refresh load. |
| `coverage-rebuild` | Student has not covered enough of the course. |
| `assignment-recovery-plan` | Missed assignments are the main blocker. |
| `reactivation` | Long quiet gap is the main problem. |
| `teacher-escalation` | Automated nudges are not working; teacher check-in is more useful. |

## Refinement Made During Development

The first version of the support-action layer escalated one secure distinction-like student because they had a long historical quiet gap and low nudge response.

That was wrong.

The rule was changed so secure students are not escalated unless their readiness actually falls. A regression test now prevents this coming back.

## After Development: Final Support Distribution

Final 50-student two-year run:

| Support action | Count |
| --- | ---: |
| `positive-reward` | 6 |
| `maintain` | 9 |
| `assignment-recovery-plan` | 9 |
| `teacher-escalation` | 25 |
| `coverage-rebuild` | 1 |

Band-level action split:

| Band | Average readiness | Action split |
| --- | ---: | --- |
| Distinction-like | 94.9 | 4 reward, 1 maintain |
| Pass-like | 83.7 | 8 maintain, 5 teacher escalation, 4 assignment recovery, 2 reward |
| Fail-like | 36.1 | 6 teacher escalation, 5 assignment recovery |
| Low-engagement-like | 8.6 | 14 teacher escalation, 1 coverage rebuild |

This is much more useful than a generic below-target label. It says why each student needs support.

## Final Cohort Metrics

| Metric | Result |
| --- | ---: |
| Average exam-readiness score | 51.8 |
| Average exam mastery | 59.1% |
| Average exam coverage | 72.0% |
| Average exam refresh load | 34.1% |
| Average missed assignments | 9.8 |
| Average nudge response rate | 31.3% |
| Average study days | 219.8 |

## Band Summary

| Band | Students | Exam mastery | Exam coverage | Exam refresh | Avg readiness |
| --- | ---: | ---: | ---: | ---: | ---: |
| Distinction-like | 5 | 92.6% | 99.0% | 0.4% | 94.9 |
| Pass-like | 19 | 88.9% | 99.6% | 7.7% | 83.7 |
| Fail-like | 11 | 48.3% | 69.8% | 58.7% | 36.1 |
| Low-engagement-like | 15 | 18.2% | 29.7% | 60.8% | 8.6 |

## Product Recommendations

1. Teacher dashboard headline metric should become `Exam Readiness`, not raw mastery.

2. The top-level dashboard should show the reason for support:
   - Assignment recovery
   - Guided Memory Repair
   - Coverage rebuild
   - Teacher check-in
   - Maintain
   - Positive reward

3. Repeated automated nudges should escalate.

If a student ignores repeated nudges, the app should stop acting like another identical message will solve it. The teacher should see: "Automatic reminders are not landing."

4. Students should see a gentler version of the same action.

For example:

- Teacher sees: "Guided Memory Repair"
- Student sees: "Start with your weakest remembered topics before learning new ones."

5. The pilot should collect real response data.

During the school pilot, log:

- nudge sent;
- nudge read;
- study session within 24 hours;
- assignment completion;
- refresh load before and after.

This will let us replace synthetic assumptions with real pilot calibration.

## Current Engineering Verdict

Keep `sharp-dsr-1`.

The developed algorithm layer is now:

- more explainable;
- better aligned with teacher workflow;
- safer for students, because it avoids pretending one score tells the whole story;
- ready to be wired into the teacher dashboard as the next UI sprint.

The next engineering task should be to display this support-action layer in the teacher dashboard and student detail modal.
