import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const originalWarn = console.warn;
console.warn = (...args) => {
  const message = String(args[0] || "");
  if (message.includes("is missing a required sheetId")) return;
  originalWarn(...args);
};

const projectRoot = "/Users/jonahss/Documents/DT App/DesignTechnologyA-level";
const outputDir = path.join(projectRoot, "outputs", "live-progress-tracker");
const outputPath = path.join(outputDir, "SharpStudy-Live-Progress-Tracker.xlsx");
const previewDir = "/private/tmp/sharpstudy-live-progress-tracker-previews";
const today = "2026-07-30";

const statuses = [
  "Complete",
  "Mostly Complete",
  "In Progress",
  "Needs Manual Review",
  "Needs Polish",
  "Planned",
  "Blocked",
  "Deferred",
];

const statusFill = {
  Complete: "#DCFCE7",
  "Mostly Complete": "#DBEAFE",
  "In Progress": "#FEF3C7",
  "Needs Manual Review": "#EDE9FE",
  "Needs Polish": "#FFEDD5",
  Planned: "#E0F2FE",
  Blocked: "#FEE2E2",
  Deferred: "#E5E7EB",
};

const priorityFill = {
  P0: "#FEE2E2",
  P1: "#FFEDD5",
  P2: "#FEF3C7",
  P3: "#E5E7EB",
};

const featureRows = [
  ["F001", "Core student dashboard", "Student", "Mostly Complete", "P1", "Student dashboard includes memory decay, active assignments, quiz, Blitz, Match, Learn, Info, leaderboard, teacher messages, and class joining.", "Needs clutter reduction and subsection progress-bar polish from latest UX notes.", "src/App.jsx; LIVE_HANDOVER.md"],
  ["F002", "Memory decay and Memory Repair", "Student", "Complete", "P1", "Memory model estimates mastery, stability, lapses, retrievability, and repair load.", "Keep validating with real pilot usage.", "src/memoryModel.js; docs/MEMORY_MODEL_*"],
  ["F003", "Four-option quiz answer engine", "Student", "Complete", "P1", "Flashcard and Blitz cards use deterministic four-option multiple choice with distractors from the same subsection first.", "Review live UX once browser control/manual testing is available.", "src/answerEngine.js; src/components/QuizCards.jsx"],
  ["F004", "Written keyword marking", "Student", "Mostly Complete", "P2", "Written questions use local keyword matching against mark-scheme points and show matched/missing evidence.", "Future AI-assisted marking is deferred until privacy/cost safeguards exist.", "src/components/QuizCards.jsx; QUESTION_ANSWERING_REDESIGN_PLAN.md"],
  ["F005", "Anonymous student content feedback", "Student/Admin", "Mostly Complete", "P1", "Students can flag flashcard/written issues anonymously; admin review queue can resolve reports.", "Needs live smoke test to confirm production Firestore records.", "src/components/QuizCards.jsx; src/App.jsx; firestore.rules"],
  ["F006", "Student leaderboard and rank badges", "Student", "Complete", "P2", "Leaderboard ranks by XP/streak; top ranks show gold/silver/bronze treatment and current user marker.", "May need UX polish after live student testing.", "src/App.jsx"],
  ["F007", "Student class joining", "Student/Teacher", "Mostly Complete", "P0", "Students need approved school email plus fresh 60-minute class join code. Joined seats bind to Firebase Auth UID.", "Needs live manual smoke: join, expiry, removal, rejoin.", "src/App.jsx; firestore.rules; PRODUCTION_SMOKE_TEST_2026-07-29.md"],
  ["F008", "Solo student accounts", "Student", "Complete", "P2", "Students can choose solo study without teacher-linked class analytics.", "Decide future billing/access model for solo users.", "src/App.jsx; LIVE_HANDOVER.md"],
  ["F009", "Teacher command dashboard", "Teacher", "Mostly Complete", "P1", "Teacher dashboard shows classes, active assignments, stats, below-target groups, and class management.", "Needs live visual review and teacher blind-test feedback.", "src/App.jsx; SCHOOL_PILOT_REVIEW.md"],
  ["F010", "Class progress overview", "Teacher", "Mostly Complete", "P1", "Class page lists students with rank, readiness, assignment state, last active, and support signals. Main roster now wraps on desktop and becomes labelled row cards below tablet width.", "Needs live visual/device review with real class data.", "src/App.jsx; src/styles.css; LIVE_HANDOVER.md"],
  ["F011", "Student detail modal", "Teacher", "Mostly Complete", "P1", "Teacher can open a student view with topic breakdown, support state, and parents' evening review. Modal now locks body/html scroll and snaps opened content to the top.", "Needs live visual smoke for edge-case overlay issues.", "src/App.jsx"],
  ["F012", "Parents' evening review", "Teacher", "Mostly Complete", "P2", "Shows streak, assignment outcomes, readiness status, and progress graph.", "Graph meaning and clutter need ongoing teacher-facing explanation.", "src/App.jsx; src/studentSupportAlgorithm.js"],
  ["F013", "Report Centre", "Teacher", "Mostly Complete", "P1", "Account-wide report filters and summaries across classes/assignments now include common-report examples and field-level helper copy.", "Needs teacher blind-test validation.", "src/App.jsx; LIVE_HANDOVER.md"],
  ["F014", "Assignments engine", "Teacher/Student", "Mostly Complete", "P0", "Teachers set assignments by chapter/subsection/long answer with deadline and target mastery; students complete only when target is hit.", "Needs live smoke on create/edit/cancel/complete paths.", "src/App.jsx; firestore.rules"],
  ["F015", "Active assignment timer and widgets", "Teacher/Student", "Mostly Complete", "P1", "Students see active assignments on dashboard and inside quiz/blitz; teachers see active assignment status.", "Needs live UX/device testing.", "src/App.jsx"],
  ["F016", "Automated nudge/reward rules", "Teacher/Student", "Mostly Complete", "P1", "Nudges/rewards are automated based on inactivity, assignment progress, streak risk, high decay, and performance.", "Remove ambiguity through more in-app explanations and pilot tuning.", "src/App.jsx; src/studentSupportAlgorithm.js"],
  ["F017", "Class settings and support policies", "Teacher", "Needs Polish", "P2", "Account Manager can configure default and per-class nudge/reward policies.", "Numeric controls and descriptions need teacher usability testing.", "src/App.jsx"],
  ["F018", "Approved Student List", "Account Manager", "Mostly Complete", "P0", "Managers approve/import/export student school emails; records consume seats and protect signup.", "Needs live smoke and safeguarding review around editable names.", "src/App.jsx; firestore.rules"],
  ["F019", "Shared teacher access", "Account Manager/Teacher", "Mostly Complete", "P0", "Account Manager can invite co-teachers; up to 5 teacher access spaces per class; invites expire.", "Needs live smoke for accept/invite and future backend move.", "src/App.jsx; firestore.rules"],
  ["F020", "Teacher student removal/rejoin", "Teacher", "Mostly Complete", "P0", "Teachers can remove student class access; approved students can rejoin with a fresh valid code.", "Needs live smoke with real test accounts.", "src/App.jsx; firestore.rules"],
  ["F021", "Super Admin Control Panel", "Super Admin", "Complete", "P0", "Admin Control includes simulator, previews, mock data, pilot smoke console, curriculum editor, flagged content, and code generator.", "Live admin writes require Firebase admin account, not local shortcut.", "src/App.jsx"],
  ["F022", "Simulation lab", "Super Admin", "Mostly Complete", "P2", "Simulates teachers/classes/students, time speed, activity, nudges, rewards, and progress.", "Needs visual review; browser tools currently unavailable.", "src/App.jsx"],
  ["F023", "Lead teacher code generator", "Super Admin", "Mostly Complete", "P0", "Generates targeted one-time Tier 1/2/3 school codes; inactive preview if not live Firebase admin.", "Needs production admin smoke test.", "src/App.jsx; firestore.rules"],
  ["F024", "Curriculum editor", "Super Admin", "Mostly Complete", "P1", "Admin GUI edits curriculum while preserving immutable question IDs and supports bulk import format.", "Needs real content migration and exam-board dataset testing.", "src/components/AdminCurriculumEditor.jsx"],
  ["F025", "Dynamic curriculum Firestore schema", "Architecture", "Mostly Complete", "P0", "Split Firestore schema supports curriculums/chapters/subsections/writtenQuestions and licensed reads.", "Bundled data.js fallback remains a paid-content protection caveat.", "README.md; firestore.rules"],
  ["F026", "GCSE/future curriculum support", "Architecture", "Planned", "P2", "Qualification tagging exists; actual GCSE dataset/content pipeline still needs expansion.", "Build bulk curriculum import workflow and test dataset.", "README.md; LIVE_HANDOVER.md"],
  ["F027", "Three-tier licensing model", "Business/Access", "Mostly Complete", "P1", "Starter Pilot, School Core, and Trust Enterprise shapes are represented in app/rules/code generation.", "Billing/payment automation is not built.", "README.md; PILOT_LAUNCH_GUIDE.md"],
  ["F028", "Tier 1 trial limits", "Business/Access", "Complete", "P1", "30-day starter trial, Chapter 1/sample access, 30 answers per rolling 24-hour window, one-school trial claim.", "Needs live pilot evidence.", "src/App.jsx; firestore.rules"],
  ["F029", "Landing page and Sharp Study branding", "Website", "Mostly Complete", "P2", "Front page explains app and tiers; app renamed Sharp Study.", "Logo/favicon/brand system still pending friend/brand work.", "src/App.jsx; public/favicon.svg"],
  ["F030", "Security rules and emulator tests", "Security", "Complete", "P0", "Firestore rules and emulator/static tests cover major pilot security paths.", "Rules must be redeployed after future rule edits.", "firestore.rules; src/firestoreRules.emulator.test.js"],
  ["F031", "Vercel security headers", "Security", "Complete", "P0", "CSP, HSTS, frame protection, nosniff, referrer policy, permissions policy configured.", "Confirm live deployment headers after each release.", "vercel.json"],
  ["F032", "Email verification readiness", "Security", "Mostly Complete", "P1", "Signup sends verification email and shows non-blocking banner; future function requires verified email.", "Manual Firebase template/inbox test remains.", "EMAIL_VERIFICATION_ONBOARDING_PLAN_2026-07-30.md"],
  ["F033", "Backup and retention plan", "Operations", "Mostly Complete", "P1", "Recovery plan and backup policy documented; Git bundles/source zips path defined.", "Firestore scheduled backups require Blaze and restore drill.", "BACKUP_RETENTION_PLAN_2026-07-29.md"],
  ["F034", "Copyright/IP file", "Legal", "Complete", "P2", "Copyright/IP Markdown and Word document prepared for printing/archiving.", "Update near final launch or major milestone.", "COPYRIGHT_IP_FILE_2026-07-21.docx"],
  ["F035", "Terms/privacy/legal docs", "Legal", "In Progress", "P0", "Terms draft and legal direction discussed; pilot legal cover still incomplete.", "Needs privacy policy, DPA, consent wording, data retention, professional review.", "legal/; LIVE_HANDOVER.md"],
  ["F036", "Manual live smoke test", "QA", "Blocked", "P0", "Production smoke checklist exists for Firebase admin, teacher, student, assignment, feedback, and devices.", "Blocked by unavailable browser control; Jonah/manual tester required.", "PRODUCTION_SMOKE_TEST_2026-07-29.md"],
  ["F037", "Blind beta with Anja", "QA", "Planned", "P0", "Beta test notes captured; runbook exists.", "Needs real tester run and observations recorded.", "PILOT_BLIND_TEST_RUNBOOK.md"],
];

const directiveRows = [
  ["D16", "Multi-class schema migration", "Section F", "Mostly Complete", "Teacher classes array, student classIds, licence/class boundaries, shared class access.", "Needs live join/remove/rejoin smoke.", "README.md; LIVE_HANDOVER.md"],
  ["D17", "Educator Command Center", "Section F", "Mostly Complete", "Teacher overview/dashboard, class cards, active assignments, stats.", "Needs teacher usability review.", "src/App.jsx"],
  ["D18", "Granular analytics drill-down", "Section F", "Mostly Complete", "Student detail modal, topic status, readiness/support breakdown.", "Needs visual/modal smoke.", "src/App.jsx"],
  ["D19", "Assignment engine and mastery targets", "Section F", "Mostly Complete", "Assignments collection, class/topic target, deadline, target mastery, attempts/completion.", "Needs production smoke.", "src/App.jsx; firestore.rules"],
  ["D20", "Anti-cheat action tracking", "Section G", "Complete", "Rewards are based on active engagements, not raw stopwatch time.", "Keep checking XP writes in future changes.", "src/App.jsx"],
  ["D21", "Dynamic XP algorithm and leaderboard", "Section G", "Mostly Complete", "XP uses base task/accuracy/streak patterns; leaderboard and rank badges exist.", "Review whether XP should be secondary to readiness for teachers.", "src/App.jsx; src/studentSupportAlgorithm.js"],
  ["D22", "Hidden Super Admin control panel", "Section B", "Complete", "Admin Control, localhost-only shortcut, Firebase admin live state, simulator, return badge.", "Manual production admin smoke needed.", "README.md; src/App.jsx"],
  ["D23", "Dynamic curriculum database", "Section H", "Mostly Complete", "Firestore split curriculum schema plus fallback seed data.", "Full data.js migration and content protection still pending.", "README.md; firestore.rules"],
  ["D24", "Immutable question IDs and live editing", "Section H", "Complete", "Admin editor protects IDs while editing text, answers, mark schemes, image URLs.", "Needs live admin edit smoke.", "src/components/AdminCurriculumEditor.jsx"],
  ["D25", "Student feedback loop", "Section H", "Mostly Complete", "Flag Error writes anonymous class/school context and admin can resolve.", "Needs live smoke.", "src/components/QuizCards.jsx; src/App.jsx"],
  ["D26", "B2B licence schema", "Section I", "Mostly Complete", "Licences collection supports tier, subjects, seats/classes, class allocation, trial caps.", "Final billing/backend enforcement pending.", "README.md; firestore.rules"],
  ["D27", "IT/teacher allocation dashboard", "Section I", "Mostly Complete", "Account Manager can spawn classes, manage seats/subjects, invite teachers, approve students.", "Needs live teacher/admin test.", "src/App.jsx"],
  ["SEC-1", "Production security posture", "Security Sprint", "Mostly Complete", "CSP, rules tests, no source admin key, crypto RNG, exact-read code documents.", "Manual live smoke and later backend move remain.", "SECURITY_REVIEW_2026-07-29.md"],
  ["OPS-1", "Disaster recovery and backups", "Operations Sprint", "Mostly Complete", "Recovery runbook and backup plan complete; app saves path defined.", "Firestore scheduled backups require Blaze.", "RECOVERY_RUNBOOK.md; BACKUP_RETENTION_PLAN_2026-07-29.md"],
  ["LEGAL-1", "Legal/IP evidence", "Legal Sprint", "In Progress", "IP file complete; terms/privacy/compliance still in draft/planning.", "Needs proper legal review before real schools.", "COPYRIGHT_IP_FILE_2026-07-21.docx; legal/"],
];

const sprintRows = [
  ["SP-001", "Multi-tenant classes and assignments", "Product", "2026-07", "Mostly Complete", "Built class schema, teacher dashboard, assignments, mastery targets.", "Live teacher/student smoke remains.", "D16-D19"],
  ["SP-002", "Gamification and XP", "Product", "2026-07", "Mostly Complete", "Active engagement tracking, XP formula, class leaderboard, rank badges.", "Review XP relevance against readiness.", "D20-D21"],
  ["SP-003", "Super Admin and simulation lab", "Admin", "2026-07", "Mostly Complete", "Admin Control, interface simulator, mock class/student simulation, floating controls.", "Visual live review still blocked.", "D22"],
  ["SP-004", "Curriculum architect", "Content", "2026-07", "Mostly Complete", "Firestore curriculum model, editor, immutable IDs, bulk import format.", "Full content migration and GCSE datasets pending.", "D23-D24"],
  ["SP-005", "Student feedback and flagged content", "QA/Admin", "2026-07", "Mostly Complete", "Flag Error and admin review queue with rules validation.", "Production smoke pending.", "D25"],
  ["SP-006", "Enterprise licensing and seats", "Business/Access", "2026-07", "Mostly Complete", "Tiered licences, seats, approved students, class/teacher allocation.", "Billing/backend automation pending.", "D26-D27"],
  ["SP-007", "Teacher join codes and access hardening", "Security", "2026-07", "Mostly Complete", "Targeted teacher codes, trial claims, 60-minute student codes, UID-bound seats.", "Live code generation smoke pending.", "Security"],
  ["SP-008", "Question answering redesign", "Learning", "2026-07", "Complete", "Multiple choice distractors and written keyword checking implemented.", "AI marking deferred.", "Question engine"],
  ["SP-009", "Memory model simulation and QA", "Learning", "2026-07", "Complete", "Focused and 50-student two-year simulations documented.", "Tune with real student evidence later.", "Memory docs"],
  ["SP-010", "UI polish and responsive tables", "UX", "2026-07", "In Progress", "Collapsed long tables, compact actions, dashboard chart work, modal fixes, responsive class roster cards, and clearer report filter guidance.", "More visual/device review needed.", "src/App.jsx; src/styles.css"],
  ["SP-011", "Pilot documentation and smoke tests", "QA", "2026-07", "Mostly Complete", "Pilot guide, blind-test runbook, production smoke checklist, smoke console.", "Real tester run pending.", "Pilot docs"],
  ["SP-012", "Vite migration", "Tooling", "2026-07-29", "Complete", "CRA/react-scripts replaced by Vite/Vitest.", "Keep Node/Vite deps current.", "Commit 5b26f36"],
  ["SP-013", "Production bundle split", "Tooling", "2026-07-30", "Complete", "React/Firebase/app split into separate chunks; main app below 500 kB.", "Monitor as app grows.", "Commit 4588111"],
  ["SP-014", "Recovery and backup planning", "Operations", "2026-07-29", "Mostly Complete", "Recovery runbook and backup retention plan complete.", "Actual Firestore scheduled backups require Blaze.", "Commits a489f53, ab0bc1d"],
  ["SP-015", "Email verification readiness", "Security", "2026-07-30", "Mostly Complete", "Non-blocking banner and verification email send/refresh added.", "Manual Firebase template/inbox test pending.", "Commit dd673e2"],
  ["SP-016", "Future backend verification guard", "Security/Backend", "2026-07-30", "Complete", "Saved future function requires verified email for school code redemption.", "Not deployed until Blaze/functions route.", "Commit 2dfd25a"],
  ["SP-017", "Live progress tracker", "Operations", "2026-07-30", "In Progress", "Workbook tracker created from handover/docs/codebase.", "Update after each completed sprint.", "This workbook"],
];

const issueRows = [
  ["I001", "Browser/Chrome automation unavailable", "QA", "Blocked", "P0", "Browser plugin skill is visible but required node browser-control execution tool is not exposed.", "Use screenshots/manual steps until tools are exposed.", "Current task"],
  ["I002", "Manual production account-flow smoke test", "QA", "Blocked", "P0", "Firebase admin, lead teacher, shared teacher, approved student, assignment, and feedback live flows need real-browser checks.", "Run PRODUCTION_SMOKE_TEST_2026-07-29.md.", "PRODUCTION_SMOKE_TEST_2026-07-29.md"],
  ["I003", "Real beta test with Anja", "QA", "Planned", "P0", "Beta test notes exist but the real blind run is not completed.", "Run and record results.", "PILOT_BLIND_TEST_RUNBOOK.md"],
  ["I004", "Report filters comprehension", "UX", "Mostly Complete", "P1", "Report Centre and class filters now include common-report examples and direct helper text for assignment windows, progress, readiness, and activity.", "Validate with teacher blind test.", "src/App.jsx; LIVE_HANDOVER.md"],
  ["I005", "Student dashboard clutter", "UX", "Needs Polish", "P1", "Dashboard should become main menu with memory bar/subsection progress and class join below.", "Plan UX sprint.", "User notes"],
  ["I006", "Class progress tables on small devices", "UX", "Mostly Complete", "P1", "Main class roster now avoids horizontal scroll, wraps desktop content, and becomes labelled row cards below tablet width.", "Manual device/browser review still required.", "src/App.jsx; src/styles.css"],
  ["I007", "Student detail modal visual issues", "UX", "Mostly Complete", "P1", "Modal opening now scrolls the selected dialog to the top and locks both body and html scroll while open.", "Manual visual smoke still required.", "src/App.jsx; LIVE_HANDOVER.md"],
  ["I008", "Written-answer streak decision", "Product", "Planned", "P1", "Streak currently extends on flashcard recall question; written answer behavior undecided.", "Decide policy before pilot explanation.", "LIVE_HANDOVER.md"],
  ["I009", "Editable student display names", "Safeguarding", "Planned", "P1", "Teacher editing student names may help but has safeguarding implications.", "Ask teachers and define audit model.", "LIVE_HANDOVER.md"],
  ["I010", "Teacher onboarding backend move", "Security/Backend", "Deferred", "P0", "Client-orchestrated onboarding is acceptable for trusted pilot, not broad rollout.", "Move to Firebase Functions on Blaze.", "future-functions/teacher-onboarding/"],
  ["I011", "Seat claiming backend move", "Security/Backend", "Deferred", "P0", "UID binding helps, but atomic seat claim/duplicate control belongs server-side.", "Implement function before public launch.", "README.md"],
  ["I012", "Scheduled Firestore backups", "Operations", "Deferred", "P1", "Backup plan exists, but scheduled backups require Blaze and restore drill.", "Enable before real school data at scale.", "BACKUP_RETENTION_PLAN_2026-07-29.md"],
  ["I013", "Privacy policy, terms, DPA", "Legal", "In Progress", "P0", "Legal cover is incomplete for real schools.", "Create formal docs and review.", "legal/"],
  ["I014", "Full content migration away from data.js", "Content/Security", "Planned", "P1", "Firestore split schema exists but bundled data fallback still contains content.", "Migrate production curriculum content and remove paid-content exposure caveat.", "README.md"],
  ["I015", "GCSE curriculum support", "Content", "Planned", "P2", "Qualification tagging exists but GCSE content is not built out.", "Create/import GCSE dataset.", "README.md"],
  ["I016", "Bulk curriculum ingestion workflow", "Content/Admin", "Planned", "P1", "SHARPSTUDY_CURRICULUM_BLOCK_V1 exists but needs real authoring pipeline and validation examples.", "Build importer docs/test fixtures.", "AdminCurriculumEditor.jsx"],
  ["I017", "AI answer marking", "Learning/AI", "Deferred", "P2", "AI marking may improve written answers but privacy/cost/risk decisions are pending.", "Design after legal/privacy plan.", "QUESTION_ANSWERING_REDESIGN_PLAN.md"],
  ["I018", "Payment/billing automation", "Business", "Deferred", "P1", "Tier model exists but checkout/payment/account provisioning is not built.", "Plan website/paywall/payment provider later.", "PILOT_LAUNCH_GUIDE.md"],
  ["I019", "Logo and brand system", "Brand", "Planned", "P3", "Sharp Study name exists; logo/favicon/brand assets need design.", "Add once brand style is ready.", "public/favicon.svg"],
];

const testRows = [
  ["T001", "Unit/security test suite", "npm test", "Passed", "63 passed, 16 skipped", "2026-07-30", "Latest after email-verification sprint."],
  ["T002", "Production build", "npm run build", "Passed", "Vite build passed; main app chunk 434.04 kB", "2026-07-30", "React/Firebase chunks split."],
  ["T003", "Firestore rules emulator", "npm run test:rules", "Passed", "16 passed", "2026-07-30", "Uses local emulator; no live Firebase writes."],
  ["T004", "Whitespace check", "git diff --check", "Passed", "No whitespace errors", "2026-07-30", "Report filter clarity sprint."],
  ["T005", "Production smoke test record", "Manual", "Pending", "Live account flows pending", "2026-07-29", "Browser control unavailable; Jonah/manual tester required."],
  ["T006", "Firebase Auth verification email", "Manual", "Pending", "Template/inbox test pending", "2026-07-30", "Check Firebase Console email template and test account inbox."],
  ["T007", "Custom domain SSL", "Manual/Web", "Mostly Complete", "Vercel valid config previously confirmed by user", "2026-07", "Reconfirm after deployments."],
  ["T008", "Device visual QA", "Manual", "Pending", "Mac/iPhone/Android/iPad/Windows checks pending", "2026-07-29", "Listed in production smoke record."],
];

const sourceRows = [
  ["README.md", "Directive and architecture ledger", "Directive statuses, security/current architecture"],
  ["LIVE_HANDOVER.md", "Active project memory", "Product state, open tasks, current limitations"],
  ["PILOT_LAUNCH_GUIDE.md", "Pilot setup", "Access model, code flow, launch checklist"],
  ["SECURITY_REVIEW_2026-07-29.md", "Security status", "Security strengths and remaining limitations"],
  ["PRODUCTION_SMOKE_TEST_2026-07-29.md", "Live QA checklist", "Manual checks still pending"],
  ["BACKUP_RETENTION_PLAN_2026-07-29.md", "Operations plan", "Backup status and Blaze requirement"],
  ["EMAIL_VERIFICATION_ONBOARDING_PLAN_2026-07-30.md", "Onboarding plan", "Verification-email status and future backend target"],
  ["src/App.jsx", "Main app implementation", "Major UI, roles, assignments, simulation, auth flows"],
  ["firestore.rules", "Security rules", "Firestore access boundaries"],
  ["src/pilotSecurity.test.js", "Static regression tests", "Security posture and documentation checks"],
  ["src/firestoreRules.emulator.test.js", "Rules tests", "Firestore emulator coverage"],
];

const workbook = Workbook.create();

const theme = {
  navy: "#0F172A",
  blue: "#1E3A8A",
  teal: "#0F766E",
  purple: "#312E81",
  slate: "#475569",
  light: "#F8FAFC",
  line: "#CBD5E1",
  white: "#FFFFFF",
};

function addSheet(name) {
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;
  return sheet;
}

function title(sheet, range, text, subtitle = "") {
  const titleRange = sheet.getRange(range);
  titleRange.merge();
  titleRange.values = [[text]];
  titleRange.format = {
    fill: theme.navy,
    font: { bold: true, color: theme.white, size: 18 },
    horizontalAlignment: "left",
    verticalAlignment: "center",
  };
  if (subtitle) {
    const row = Number(range.match(/\d+/)?.[0] || 1) + 1;
    const subRange = sheet.getRange(`A${row}:H${row}`);
    subRange.merge();
    subRange.values = [[subtitle]];
    subRange.format = {
      fill: "#E0F2FE",
      font: { color: theme.navy, size: 10 },
      wrapText: true,
    };
  }
}

function writeTable(sheet, startCell, headers, rows) {
  const [colLetters, rowNumber] = startCell.match(/([A-Z]+)(\d+)/).slice(1);
  const startRow = Number(rowNumber);
  const startCol = colToIndex(colLetters);
  const allRows = [headers, ...rows];
  const range = sheet.getRangeByIndexes(startRow - 1, startCol, allRows.length, headers.length);
  range.values = allRows;
  range.format.wrapText = true;
  sheet.getRangeByIndexes(startRow - 1, startCol, 1, headers.length).format = {
    fill: theme.blue,
    font: { bold: true, color: theme.white },
    horizontalAlignment: "center",
    verticalAlignment: "center",
  };
  sheet.getRangeByIndexes(startRow, startCol, rows.length, headers.length).format = {
    fill: theme.white,
    font: { color: theme.navy },
    verticalAlignment: "top",
  };
  range.format.borders = { preset: "all", style: "thin", color: theme.line };
  sheet.freezePanes.freezeRows(startRow);
  return { startRow, endRow: startRow + rows.length, startCol, endCol: startCol + headers.length - 1 };
}

function colToIndex(column) {
  return column.split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function styleStatusCells(sheet, columnLetter, firstRow, rows) {
  rows.forEach((row, index) => {
    const value = row[colToIndex(columnLetter)];
    const fill = statusFill[value] || theme.white;
    const cell = sheet.getRange(`${columnLetter}${firstRow + index}`);
    cell.format = {
      fill,
      font: { bold: true, color: theme.navy },
      horizontalAlignment: "center",
      verticalAlignment: "center",
    };
  });
}

function stylePriorityCells(sheet, columnLetter, firstRow, rows, valueIndex) {
  rows.forEach((row, index) => {
    const value = row[valueIndex];
    const cell = sheet.getRange(`${columnLetter}${firstRow + index}`);
    cell.format = {
      fill: priorityFill[value] || theme.white,
      font: { bold: true, color: theme.navy },
      horizontalAlignment: "center",
      verticalAlignment: "center",
    };
  });
}

function setWidths(sheet, widths) {
  widths.forEach(([col, width]) => {
    sheet.getRange(`${col}1:${col}120`).format.columnWidth = width;
  });
}

const dashboard = addSheet("Dashboard");
title(
  dashboard,
  "A1:H1",
  "Sharp Study Live Progress Tracker",
  `Live project-status workbook. Last updated ${today}. Update this whenever the live handover changes.`
);
dashboard.getRange("A4:B9").values = [
  ["Current focus", "Controlled school-pilot readiness"],
  ["Browser review", "Blocked: Browser/Chrome control tool is not exposed in this thread"],
  ["Latest sprint", "Report filter clarity pass; see Git history for exact commit hash"],
  ["Latest checks", "npm test, npm run build, npm run test:rules all passed on 2026-07-30"],
  ["Main blocker", "Manual live Firebase/admin/teacher/student smoke test"],
  ["Live tracker rule", "When a sprint finishes, update this workbook and LIVE_HANDOVER.md together"],
];
dashboard.getRange("A4:A9").format = {
  fill: "#E0F2FE",
  font: { bold: true, color: theme.navy },
};
dashboard.getRange("B4:B9").format = { fill: theme.white, wrapText: true };
dashboard.getRange("A4:B9").format.borders = { preset: "all", style: "thin", color: theme.line };

dashboard.getRange("D4:E4").values = [["Status Summary", "Count"]];
dashboard.getRange("D4:E4").format = { fill: theme.blue, font: { bold: true, color: theme.white } };
dashboard.getRange("D5:D12").values = statuses.map((status) => [status]);
dashboard.getRange("E5:E12").formulas = statuses.map((status, i) => [
  `=COUNTIF('Feature Register'!$D$2:$D$80,D${5 + i})+COUNTIF('Directive Register'!$D$2:$D$80,D${5 + i})+COUNTIF('Sprint Register'!$E$2:$E$80,D${5 + i})+COUNTIF('Open Issues'!$D$2:$D$80,D${5 + i})`,
]);
dashboard.getRange("D5:E12").format.borders = { preset: "all", style: "thin", color: theme.line };
statuses.forEach((status, index) => {
  dashboard.getRange(`D${5 + index}`).format = { fill: statusFill[status], font: { bold: true, color: theme.navy } };
});

dashboard.getRange("G4:H4").values = [["Priority", "Open Items"]];
dashboard.getRange("G4:H4").format = { fill: theme.blue, font: { bold: true, color: theme.white } };
["P0", "P1", "P2", "P3"].forEach((priority, index) => {
  const row = 5 + index;
  dashboard.getRange(`G${row}`).values = [[priority]];
  dashboard.getRange(`H${row}`).formulas = [[`=COUNTIF('Feature Register'!$E$2:$E$80,G${row})+COUNTIF('Open Issues'!$E$2:$E$80,G${row})`]];
  dashboard.getRange(`G${row}`).format = { fill: priorityFill[priority], font: { bold: true, color: theme.navy } };
});
dashboard.getRange("G5:H8").format.borders = { preset: "all", style: "thin", color: theme.line };
setWidths(dashboard, [["A", 24], ["B", 64], ["D", 22], ["E", 12], ["G", 14], ["H", 14]]);

const directiveSheet = addSheet("Directive Register");
title(directiveSheet, "A1:G1", "Directive Register", "Architecture directives and sprint-level architecture commitments.");
writeTable(
  directiveSheet,
  "A4",
  ["ID", "Directive / Goal", "Section", "Status", "What is done", "Remaining work", "Evidence"],
  directiveRows
);
styleStatusCells(directiveSheet, "D", 5, directiveRows);
setWidths(directiveSheet, [["A", 12], ["B", 34], ["C", 18], ["D", 20], ["E", 52], ["F", 42], ["G", 36]]);

const sprintSheet = addSheet("Sprint Register");
title(sprintSheet, "A1:H1", "Sprint Register", "Work packages, their outcome state, and where evidence lives.");
writeTable(
  sprintSheet,
  "A4",
  ["Sprint ID", "Sprint", "Area", "Date / Period", "Status", "Completed Output", "Remaining Work", "Linked Evidence"],
  sprintRows
);
sprintRows.forEach((row, index) => {
  const cell = sprintSheet.getRange(`E${5 + index}`);
  cell.format = {
    fill: statusFill[row[4]] || theme.white,
    font: { bold: true, color: theme.navy },
    horizontalAlignment: "center",
  };
});
setWidths(sprintSheet, [["A", 14], ["B", 34], ["C", 20], ["D", 16], ["E", 20], ["F", 48], ["G", 42], ["H", 26]]);

const featureSheet = addSheet("Feature Register");
title(featureSheet, "A1:H1", "Feature And Subfeature Register", "Detailed product feature tracker, including polish and manual-review state.");
writeTable(
  featureSheet,
  "A4",
  ["ID", "Feature / Subfeature", "Area", "Status", "Priority", "What is done", "Remaining work", "Evidence"],
  featureRows
);
styleStatusCells(featureSheet, "D", 5, featureRows);
stylePriorityCells(featureSheet, "E", 5, featureRows, 4);
setWidths(featureSheet, [["A", 12], ["B", 36], ["C", 20], ["D", 20], ["E", 10], ["F", 58], ["G", 44], ["H", 35]]);

const issueSheet = addSheet("Open Issues");
title(issueSheet, "A1:H1", "Open Issues And Polish Queue", "Manual, blocked, polish, legal, backend, and future-launch items.");
writeTable(
  issueSheet,
  "A4",
  ["ID", "Issue / Decision", "Area", "Status", "Priority", "Why it matters", "Next action", "Evidence"],
  issueRows
);
styleStatusCells(issueSheet, "D", 5, issueRows);
stylePriorityCells(issueSheet, "E", 5, issueRows, 4);
setWidths(issueSheet, [["A", 12], ["B", 38], ["C", 20], ["D", 20], ["E", 10], ["F", 56], ["G", 44], ["H", 34]]);

const testSheet = addSheet("Test Evidence");
title(testSheet, "A1:G1", "Test And Evidence Log", "Latest automated/manual verification state.");
writeTable(
  testSheet,
  "A4",
  ["ID", "Check", "Command / Method", "Status", "Evidence", "Date", "Notes"],
  testRows
);
testRows.forEach((row, index) => {
  testSheet.getRange(`D${5 + index}`).format = {
    fill: row[3] === "Passed" ? statusFill.Complete : row[3] === "Pending" ? statusFill["Needs Manual Review"] : statusFill["Mostly Complete"],
    font: { bold: true, color: theme.navy },
    horizontalAlignment: "center",
  };
});
setWidths(testSheet, [["A", 12], ["B", 34], ["C", 26], ["D", 20], ["E", 38], ["F", 14], ["G", 48]]);

const sourceSheet = addSheet("Source Notes");
title(sourceSheet, "A1:C1", "Source Notes", "Files used to build this tracker. Keep this sheet updated when adding evidence sources.");
writeTable(sourceSheet, "A4", ["Source", "Use", "Evidence captured"], sourceRows);
setWidths(sourceSheet, [["A", 46], ["B", 30], ["C", 70]]);

const protocolSheet = addSheet("Update Protocol");
title(protocolSheet, "A1:E1", "Live Tracker Update Protocol", "Use this whenever a sprint, directive, feature, or manual test changes state.");
protocolSheet.getRange("A4:E12").values = [
  ["Step", "Action", "Applies To", "Required Evidence", "Commit Rule"],
  ["1", "Update the relevant row status and remaining work.", "All registers", "Reference file, commit, test output, or manual test note.", "Do not leave status stale."],
  ["2", "Add new feature/subfeature rows rather than hiding work inside broad items.", "Feature Register", "Short evidence path.", "One row per meaningful subfeature."],
  ["3", "Update Dashboard summary formulas only if row ranges are expanded beyond row 80.", "Dashboard", "Formula scan passes.", "Keep formulas auditable."],
  ["4", "Update LIVE_HANDOVER.md with the same status change.", "Handover", "Handover change log.", "Tracker and handover must agree."],
  ["5", "Run npm test, npm run build, and npm run test:rules when code/rules changed.", "Code sprints", "Test Evidence row updated.", "Docs-only changes may use lighter checks."],
  ["6", "Run manual production smoke checks for live Firebase/browser-only items.", "Manual QA", "PRODUCTION_SMOKE_TEST_2026-07-29.md.", "Do not mark manual items complete from code inspection."],
  ["7", "Commit and push tracker updates with the related sprint.", "All", "Git commit hash.", "Keep GitHub as source of truth."],
  ["8", "Create a physical backup after major sprint groups if Jonah asks for a save.", "Operations", "app-saves bundle/zip path.", "Do not include secrets."],
];
protocolSheet.getRange("A4:E4").format = { fill: theme.blue, font: { bold: true, color: theme.white } };
protocolSheet.getRange("A5:E12").format = { fill: theme.white, wrapText: true, verticalAlignment: "top" };
protocolSheet.getRange("A4:E12").format.borders = { preset: "all", style: "thin", color: theme.line };
setWidths(protocolSheet, [["A", 10], ["B", 48], ["C", 24], ["D", 44], ["E", 38]]);

for (const sheet of workbook.worksheets.items) {
  sheet.getUsedRange()?.format.autofitRows();
}

await fs.mkdir(previewDir, { recursive: true });
const sheetsToPreview = [
  ["Dashboard", "A1:H14"],
  ["Directive Register", "A1:G18"],
  ["Sprint Register", "A1:H18"],
  ["Feature Register", "A1:H18"],
  ["Open Issues", "A1:H18"],
  ["Test Evidence", "A1:G14"],
  ["Source Notes", "A1:C16"],
  ["Update Protocol", "A1:E12"],
];

for (const [sheetName, range] of sheetsToPreview) {
  const blob = await workbook.render({ sheetName, range, scale: 1, format: "png" });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await fs.writeFile(path.join(previewDir, `${sheetName.replace(/[^A-Za-z0-9]+/g, "-")}.png`), bytes);
}

const dashboardCheck = await workbook.inspect({
  kind: "table",
  sheetId: "Dashboard",
  range: "A1:H14",
  include: "values,formulas",
  tableMaxRows: 14,
  tableMaxCols: 8,
  maxChars: 6000,
});
console.log(dashboardCheck.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
await fs.rm(`${outputPath}.inspect.ndjson`, { force: true });
console.log(`Saved ${outputPath}`);
