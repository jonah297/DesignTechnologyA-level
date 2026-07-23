# Sharp Study Two-Year Bulk Memory Model QA

Date: 23 July 2026

Purpose: run a final bulk stress test of the `sharp-dsr-1` memory model using 50 synthetic student accounts over a full two-year course window. The goal is to test whether the memory algorithm, assignment pressure, automated nudging assumptions, and teacher-facing mastery metrics behave sensibly at realistic class scale.

This is a local simulation only. It does not create Firebase accounts, write to Firestore, affect XP, alter assignments, or touch production leaderboards.

## Open Data Calibration

The simulation is calibrated from public/open learning analytics structures, not from private student data.

| Source | How it informed the simulation |
| --- | --- |
| Open University Learning Analytics Dataset | Student-VLE daily activity, assessment timing, and broad outcome-band style behaviour. |
| Kuzilek, Hlosta and Zdrahal (2017), Scientific Data | Confirms the OULAD structure: learner records, course presentations, assessment records, daily interaction summaries, and outcomes. |
| ASSISTments public datasets | Response-style modelling: correctness, attempts, prior successes/failures, and support behaviour. |

Source links:

- https://analyse.kmi.open.ac.uk/open_dataset
- https://doi.org/10.1038/sdata.2017.171
- https://sites.google.com/site/assistmentsdata/assistments-pfa-data

Important limitation: this run uses an open-data-inspired synthetic calibration. It does not import raw OULAD or ASSISTments rows. For a later research-grade calibration pass, we should fit activity parameters directly from raw public CSV files and document the fitted distributions.

## Generated Data Files

| File | Purpose |
| --- | --- |
| `docs/memory-model-two-year-bulk-analysis-2026-07-23.json` | Full analysis dataset, including metadata, per-student rows, sampled daily rows, band summaries, and tuning flags. |
| `docs/memory-model-two-year-bulk-students-2026-07-23.csv` | Per-student summary table suitable for spreadsheet review. |
| `docs/memory-model-two-year-bulk-bands-2026-07-23.csv` | Outcome-band summary table suitable for quick business/teacher discussion. |

## How To Rerun

Fast smoke test:

```bash
npm test -- --watchAll=false src/memoryModelBulkSimulation.test.js
```

Full 50-student two-year run, writing JSON and CSV files:

```bash
RUN_BULK_SIM=1 MEMORY_BULK_WRITE_REPORT=1 npm test -- --watchAll=false src/memoryModelBulkSimulation.test.js
```

The full run took about 102 seconds on this machine after the coverage-limit tuning.

## Simulation Design

The full run uses:

- 50 synthetic students.
- 730 simulated days.
- 192 simulated cards.
- 16 assignment windows.
- Exam-readiness day: day 616, representing the point at which the app should care most about whether students are prepared for exams.
- Final day: day 730, retained as a post-course decay stress check.

The model now reports both:

- `examAverageMastery`, `examCoverageRate`, and `examRefreshRate`;
- `finalAverageMastery`, `coverageRate`, and `finalRefreshRate`.

This matters because measuring only day 730 would unfairly treat post-exam inactivity as exam readiness decay.

## Final Cohort Metrics

| Metric | Result |
| --- | ---: |
| Cohort size | 50 |
| Duration | 730 days |
| Average exam-readiness mastery | 59.1% |
| Average exam coverage | 72.0% |
| Average exam refresh load | 34.1% |
| Average final mastery after two years | 54.8% |
| Average assignments missed | 9.8 |
| Average nudge response rate | 31.3% |
| Average study days | 219.8 |

## Band Summary

| Band | Students | Exam mastery | Exam coverage | Exam refresh | Final mastery | Assignments on time | Missed assignments | Avg study days |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Distinction-like | 5 | 92.6% | 99.0% | 0.4% | 91.7% | 77 | 2 | 356.0 |
| Pass-like | 19 | 88.9% | 99.6% | 7.7% | 85.6% | 181 | 97 | 262.9 |
| Fail-like | 11 | 48.3% | 69.8% | 58.7% | 39.2% | 12 | 154 | 219.2 |
| Low-engagement-like | 15 | 18.2% | 29.7% | 60.8% | 14.8% | 3 | 236 | 120.3 |

## Algorithm Enhancement Made During This Test

The first full run revealed an unrealistic behaviour: low-engagement students could still drift up to roughly 81.6% coverage because the simulator always introduced a small number of new cards, even when the student was no longer behind their expected coverage path.

That was corrected. The simulator now stops adding new cards once a student reaches their behaviour-based coverage ceiling. After this fix, low-engagement-like students finish around 29.7% coverage, which is far more realistic and prevents the model from flattering inactive students.

This was a simulation/activity-model tuning, not a change to the core memory decay formula.

## Tuning Flags From The Final Run

| Flag | Count | Meaning |
| --- | ---: | --- |
| Assignment concern | 31 students | A large number of students missed 8 or more assignment windows. Teacher dashboards must show missed assignments beside mastery. |
| High learned mastery but low coverage | 4 students | Some students can look good on what they touched while leaving most of the course untouched. Top-line mastery must stay coverage-weighted. |
| High nudge count with low response | 34 students | Repeated automated reminders alone are not enough for some students. The app needs escalation, different wording, or clearer teacher visibility. |
| High refresh despite study | 15 students | Some active students still carry large refresh loads. We should inspect repair thresholds and teacher guidance before pilot. |

Sample flagged student IDs are stored in the JSON file under `tuningFlags.sampleStudentIds`.

## Verdict

The core memory decay formula is good enough to keep. It shows healthy separation:

- high-engagement students stay high and stable;
- pass-like students perform strongly but with more missed assignment pressure;
- fail-like students show partial coverage and high refresh load;
- low-engagement students do not get inflated mastery.

The main next improvements should be app/reporting behaviour:

1. Use coverage-weighted exam mastery as the teacher dashboard headline metric.
2. Keep learned-card mastery as a drill-down detail, not the main score.
3. Show missed assignments and overdue work beside mastery.
4. Add nudge escalation rules for repeated non-response.
5. Review repair thresholds for students who study often but keep high refresh load.
6. Later, run a research-grade calibration pass using raw public CSV datasets.

## Current Recommendation

Do not replace `sharp-dsr-1` yet. The algorithm is behaving in the right direction. The strongest immediate improvement is to make the dashboard honest: mastery, coverage, refresh load, assignment completion, and nudge response should be shown together instead of compressed into one number.
