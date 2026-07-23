# Sharp Study Memory Model Simulation Review

Date: 23 July 2026

Purpose: test whether the new `sharp-dsr-1` memory model behaves sensibly for a student starting with zero mastery, studying, going inactive, and then using Memory Repair to rebuild recall.

This review uses deterministic local simulation only. It does not create accounts, write to Firebase, affect XP, affect assignments, or touch production leaderboards.

The tables below are recorded output from one run of the simulation. They are not used as test fixtures. The automated test re-runs the journey against the actual memory model and includes a guard check proving that swapping in a fake flat memory model changes the results.

## How To Rerun

```bash
env MEMORY_SIM_REPORT=1 npm test -- --watchAll=false src/memoryModelSimulation.test.js --silent=false
```

The simulation code is in `src/memoryModelSimulation.js`.
The assertions are in `src/memoryModelSimulation.test.js`.

## What The Test Measures

- Average mastery across all simulated cards.
- Learned-card average mastery, excluding cards not yet attempted.
- Refresh load: learned cards below 80% mastery.
- Severe decay: learned cards below 50% mastery.
- Average stability in days, which represents how long the model believes the memory can survive before it needs review.

## Journey 1: Steady Student

This student starts at 0% mastery, studies regularly, goes away for a few days, repairs, goes away again, then consolidates.

| Day | Event | Average mastery | Learned average | Refresh load | Severe decay | Avg stability | Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 0 | No prior mastery | 0% | 0% | 0/0 (0%) | 0 | 0d | Starting point |
| 0 | First quiz session | 26.8% | 53.5% | 6/12 (50%) | 6 | 1.2d | 12 cards answered, 50% correct |
| 1 | Review weakest cards | 36.5% | 72.9% | 3/12 (25%) | 3 | 2.4d | 12 cards answered, 75% correct |
| 2 | Learn remaining cards | 74.1% | 74.1% | 5/24 (20.8%) | 5 | 2.1d | 12 cards answered, 83.3% correct |
| 3 | Normal review | 74.8% | 74.8% | 5/24 (20.8%) | 5 | 2.9d | 16 cards answered, 68.8% correct |
| 7 | Four days away | 66.8% | 66.8% | 15/24 (62.5%) | 5 | 2.9d | No answers submitted since day 3 |
| 7 | Memory Repair after absence | 83.1% | 83.1% | 6/24 (25%) | 1 | 3.6d | 10 cards answered, 90% correct |
| 8 | Second repair pass | 82% | 82% | 2/24 (8.3%) | 2 | 3.9d | 7 cards answered, 71.4% correct |
| 14 | Another six days away | 73.1% | 73.1% | 11/24 (45.8%) | 2 | 3.9d | Realistic half-term style gap |
| 14 | Repair and rebuild | 83.2% | 83.2% | 1/24 (4.2%) | 1 | 5d | 11 cards answered, 90.9% correct |
| 15 | Consolidation review | 90.7% | 90.7% | 0/24 (0%) | 0 | 7.3d | 12 cards answered, 100% correct |

## Journey 2: Slacker / Recovery Student

This student starts weak, skips several days, responds to a nudge, improves, slips again, then needs a follow-up repair.

| Day | Event | Average mastery | Learned average | Refresh load | Severe decay | Avg stability | Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 0 | No prior mastery | 0% | 0% | 0/0 (0%) | 0 | 0d | Starting point |
| 0 | Weak first quiz session | 20.5% | 41% | 8/12 (66.7%) | 8 | 0.9d | 12 cards answered, 33.3% correct |
| 1 | Patchy review | 30.1% | 60.3% | 5/12 (41.7%) | 5 | 1.8d | 12 cards answered, 58.3% correct |
| 5 | Skipped several days | 25.6% | 51.3% | 10/12 (83.3%) | 5 | 1.8d | Automated nudging should fire here |
| 5 | Responds to nudge | 35.8% | 71.6% | 3/12 (25%) | 3 | 2.6d | 10 cards answered, 70% correct |
| 6 | Second repair attempt | 44.1% | 88.2% | 0/12 (0%) | 0 | 3.1d | 3 cards answered, 100% correct |
| 10 | Slips again | 39.8% | 79.7% | 7/12 (58.3%) | 0 | 3.1d | One repair burst was not enough |
| 10 | Bigger repair session | 38% | 75.9% | 2/12 (16.7%) | 2 | 3.7d | 7 cards answered, 71.4% correct |
| 11 | Follow-up repair | 43.7% | 87.4% | 0/12 (0%) | 0 | 4.2d | 3 cards answered, 100% correct |

## Initial Findings

1. The model does not collapse overnight. A good review holds up for a short period, which avoids making students feel punished for normal life.

2. Inactivity correctly creates a visible refresh load. The steady student moved from 20.8% refresh load on day 3 to 62.5% after four days away.

3. Memory Repair works. The steady student dropped from 15 refresh cards to 6 after one repair session, then to 2 after a second pass.

4. Consistency is rewarded. The steady student finished at 90.7% average mastery and 7.3 days average stability after consolidation.

5. A weaker student can recover, but they need follow-up. The slacker/recovery student reached 0 refresh cards after repair, slipped again, then recovered after a second sequence.

6. The model can briefly lower average mastery when a repair session reveals wrong answers. This happened on day 10 for the slacker/recovery student: refresh load improved from 7 cards to 2 cards, but average mastery dipped from 39.8% to 38% because two lapses were exposed. This is mathematically defensible, but the UI should explain it gently.

## Tuning Notes For Next Sprint

- Add student-facing wording for Memory Repair: "This may uncover weak memories before it rebuilds them." That would prevent the day 10 dip from feeling unfair.

- Consider softening the penalty for incorrect repair answers after long absence. Current lapse penalty is useful, but may be slightly sharp for low-confidence students.

- Consider separating "unlearned mastery" from "learned mastery" in teacher-facing reports. Whole-topic average can look low simply because the student has not unlocked all cards yet.

- Add a simulation chart to Super Admin showing average mastery and refresh load over time, using these same deterministic journeys as presets.

- In the live app, show "cards needing Memory Repair" rather than "decay level" where possible. It is clearer for teachers and students.

## Current Verdict

The algorithm is good enough to continue testing. It has the behaviours we want:

- mastery rises through correct recall;
- repeated correct recall increases stability;
- time away creates refresh demand;
- Memory Repair reduces refresh demand;
- inconsistent students recover more slowly than consistent students.

The main update needed next is not a full replacement. It is a tuning and explanation pass so students understand why a difficult repair session can briefly expose weaker memory before improving it.
