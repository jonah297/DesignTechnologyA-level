const fs = require("fs");
const path = require("path");

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");

describe("pilot security posture", () => {
  test("teacher signup no longer uses the legacy shared key", () => {
    const appSource = readProjectFile("src/App.js");

    expect(appSource).not.toContain("DTHUB-PRO");
    expect(appSource).not.toContain("TEACHER_LICENSE");
    expect(appSource).toContain("teacher_access_codes");
    expect(appSource).toContain("Lead teacher code (co-teachers leave blank)");
    expect(appSource).toContain("Lead Teacher Pilot Codes");
    expect(appSource).toContain("Generate Lead Teacher Code");
    expect(appSource).toContain("generateTeacherAccessCodeValue");
    expect(appSource).toContain("targetTeacherEmail");
    expect(appSource).toContain("maxStudentSeats");
    expect(appSource).toContain("class_invites");
  });

  test("future backend teacher redemption upgrade is saved but not active", () => {
    const firebaseConfig = readProjectFile("firebase.json");
    const functionSource = readProjectFile("future-functions/teacher-onboarding/index.js");

    expect(firebaseConfig).not.toContain("\"functions\"");
    expect(functionSource).toContain("exports.redeemTeacherAccessCode");
    expect(functionSource).toContain("runTransaction");
    expect(functionSource).toContain("teacher_access_codes");
    expect(functionSource).toContain("licenses");
    expect(functionSource).toContain("status: \"redeemed\"");
  });

  test("Firestore rules require teacher access codes and protect license management", () => {
    const rules = readProjectFile("firestore.rules");
    const manageLicenseBody = rules.match(
      /function canManageLicense\(licenseData\) \{[\s\S]*?\n    \}/
    )[0];

    expect(rules).toContain("match /teacher_access_codes/{codeId}");
    expect(rules).toContain("validTeacherAccessCode");
    expect(rules).toContain("validTeacherClassInvite");
    expect(rules).toContain("teacherCanCreatePilotLicense");
    expect(rules).toContain("validSharedTeacherInviteClassAccessUpdate");
    expect(rules).toContain("match /attempts/{studentId}");
    expect(rules).toContain("request.resource.data.assignmentId == assignmentId");
    expect(rules).toContain("validAssignmentCompletion(studentId)");
    expect(rules).toContain("validAssignmentAttemptCreate(studentId)");
    expect(rules).toContain("validAssignmentAttemptUpdate(studentId)");
    expect(rules).toContain("request.resource.data.attemptCount == resource.data.attemptCount + 1");
    expect(rules).toContain("request.resource.data.targetMastery == assignmentData(assignmentId).targetMastery");
    expect(rules).toContain("lastAcceptedInviteId");
    expect(rules).toContain("resource.data.status == \"pending\"");
    expect(rules).toContain("request.resource.data.teacherShareCount < 5");
    expect(rules).toContain("validBaseUserCreate");
    expect(rules).toContain("request.resource.data.xpTotal == 0");
    expect(rules).toContain("request.resource.data.activeEngagements == 0");
    expect(rules).toContain("createdFromAccessCodeId");
    expect(rules).toContain("canManageLicense(resource.data)");
    expect(manageLicenseBody).not.toContain("teacherIds");
  });

  test("shared teacher invite acceptance uses a batched invite marker", () => {
    const appSource = readProjectFile("src/App.js");

    expect(appSource).toContain("const MAX_TEACHERS_PER_CLASS = 5");
    expect(appSource).toContain("getTeacherShareUsage");
    expect(appSource).toContain("sendTeacherInvite");
    expect(appSource).toContain("adminSimulationActive || adminPreviewActive\n      ? simulatedTeacherMode === \"account-manager\"\n      : isRootAdmin");
    expect(appSource).toContain("{activeLicense && canManageActiveLicense && teacherClasses.length > 0 && (");
    expect(appSource).toContain("targetTeacherEmail");
    expect(appSource).toContain("teacherShareUsage >= MAX_TEACHERS_PER_CLASS");
    expect(appSource).toContain("teacherShareCount: teacherShareUsage");
    expect(appSource).toContain("lastAcceptedInviteId: invite.id");
    expect(appSource).toContain("const acceptBatch = writeBatch(db)");
    expect(appSource).toContain("Shared Class Invitations");
    expect(appSource).toContain("Only accept invitations sent to your signed-in teacher email.");
    expect(appSource).toContain("This invitation belongs to a different school license.");
  });

  test("pilot guide documents the one-time invite-code setup", () => {
    const guide = readProjectFile("PILOT_LAUNCH_GUIDE.md");

    expect(guide).toContain("one-time pilot invite code");
    expect(guide).toContain("Admin Control");
    expect(guide).toContain("Generate Lead Teacher Code");
    expect(guide).toContain("teacher_access_codes");
    expect(guide).toContain("free-plan route");
    expect(guide).not.toContain("pilot teacher access key");
  });

  test("student joining is gated by approved school emails and class join codes", () => {
    const appSource = readProjectFile("src/App.js");
    const rules = readProjectFile("firestore.rules");
    const guide = readProjectFile("PILOT_LAUNCH_GUIDE.md");
    const readme = readProjectFile("README.md");

    expect(appSource).toContain("Approved Student List");
    expect(appSource).toContain("approved_students");
    expect(appSource).toContain("Your school email is not on the Approved Student List");
    expect(appSource).toContain("expiresAt: new Date(now + HOUR_MS)");
    expect(appSource).toContain("Generate New Code");
    expect(rules).toContain("validStudentApprovalForLicense");
    expect(rules).toContain("match /approved_students/{studentId}");
    expect(rules).toContain("validClassJoinCode");
    expect(readme).toContain("Codes expire after 60 minutes");
    expect(readme).not.toContain("Codes expire after 24 hours");
    expect(guide).toContain("their school email must already be on the Approved Student List");
  });

  test("student removal drops class access while allowing rejoin with a fresh valid code", () => {
    const appSource = readProjectFile("src/App.js");
    const rules = readProjectFile("firestore.rules");
    const readme = readProjectFile("README.md");

    expect(appSource).toContain("removeStudentFromActiveClass");
    expect(appSource).toContain("const nextClassIds = previousClassIds.filter((item) => item !== classId)");
    expect(appSource).toContain("removedFromClassId: classId");
    expect(appSource).toContain("removedBy: currentUser");
    expect(appSource).toContain("doc(db, \"users\", student.id)");
    expect(appSource).toContain("doc(db, \"public_profiles\", student.id)");
    expect(appSource).toContain("student.status === \"joined\"");
    expect(appSource).toContain("Remove them from a class if they should lose class access.");
    expect(appSource).toContain("![\"approved\", \"joined\"].includes(approvalStatus)");
    expect(rules).toContain("validTeacherRemoveStudentFromClass");
    expect(rules).toContain("validTeacherPublicProfileClassRemoval");
    expect(rules).toContain("validStudentJoinClassUpdate");
    expect(readme).toContain("Teachers can remove a student from a class; the student loses that class access but can rejoin with a fresh valid join code.");
  });

  test("teacher dashboard keeps the account-wide overview visible", () => {
    const appSource = readProjectFile("src/App.js");
    const styles = readProjectFile("src/styles.css");

    expect(appSource).toContain("Teacher Overview");
    expect(appSource).toContain("Nearest deadline");
    expect(appSource).toContain("teacherDashboardInsightModal");
    expect(appSource).toContain("dashboard-insight-table");
    expect(styles).toContain(".dashboard-insight-table");
  });

  test("simulation lab includes varied learner archetypes", () => {
    const appSource = readProjectFile("src/App.js");

    expect(appSource).toContain("Fast Starter");
    expect(appSource).toContain("Perfectionist");
    expect(appSource).toContain("Absent Capable");
    expect(appSource).toContain("Disengaged");
    expect(appSource).toContain("deadlinePressure");
    expect(appSource).toContain("lastMinuteRush");
    expect(appSource).toContain("randomFloat");
  });

  test("lead teacher pilot flow is wired from invite code to student assignment feedback", () => {
    const appSource = readProjectFile("src/App.js");
    const rules = readProjectFile("firestore.rules");

    expect(appSource).toContain("createUserWithEmailAndPassword");
    expect(appSource).toContain("getTeacherAccessCodeError(codeData, emailAsId)");
    expect(appSource).toContain("setupBatch.set(doc(db, \"licenses\", licenseId), licensePayload)");
    expect(appSource).toContain("status: \"redeemed\"");
    expect(appSource).toContain("createdFromAccessCodeId: teacherAccessCodeId");
    expect(appSource).toContain("approveStudentSeat");
    expect(appSource).toContain("generateClassJoinCode");
    expect(appSource).toContain("joinStudentClassWithCode");
    expect(appSource).toContain("markAssignmentComplete");
    expect(appSource).toContain("flagContentError");
    expect(appSource).toContain("resolveFlaggedContent");
    expect(rules).toContain("validTeacherAccessCode");
    expect(rules).toContain("teacherCanCreatePilotLicense");
    expect(rules).toContain("validStudentApprovalForLicense");
    expect(rules).toContain("validClassJoinCode");
  });

  test("approved student list supports CSV import and export", () => {
    const appSource = readProjectFile("src/App.js");
    const guide = readProjectFile("PILOT_LAUNCH_GUIDE.md");
    const review = readProjectFile("SCHOOL_PILOT_REVIEW.md");

    expect(appSource).toContain("parseApprovedStudentCsv");
    expect(appSource).toContain("Import CSV");
    expect(appSource).toContain("Export CSV");
    expect(appSource).toContain("CSV columns: email, reference_name.");
    expect(appSource).toContain("Joined student records stay locked for audit safety");
    expect(guide).toContain("import/export CSV files");
    expect(review).toContain("Account Managers can import/export the Approved Student List as CSV");
  });

  test("anonymous content flags can be reviewed without exposing student emails", () => {
    const appSource = readProjectFile("src/App.js");
    const editorSource = readProjectFile("src/components/AdminCurriculumEditor.js");
    const rules = readProjectFile("firestore.rules");
    const readme = readProjectFile("README.md");
    const guide = readProjectFile("PILOT_LAUNCH_GUIDE.md");
    const review = readProjectFile("SCHOOL_PILOT_REVIEW.md");

    expect(appSource).toContain("anonymous: true");
    expect(appSource).toContain("resolveFlaggedContent");
    expect(appSource).toContain("updateDoc(doc(db, \"flagged_content\", flag.id)");
    expect(editorSource).toContain("Mark Resolved");
    expect(editorSource).toContain("Review note");
    expect(rules).toContain("changedKeys().hasOnly");
    expect(rules).toContain("\"reviewedBy\"");
    expect(rules).toContain("\"adminNote\"");
    expect(rules).toContain("request.resource.data.status == \"resolved\"");
    expect(rules).toContain("request.resource.data.reviewedBy == emailId()");
    expect(rules).toContain("request.resource.data.reviewedAt is int");
    expect(rules).toContain("request.resource.data.adminNote is string");
    expect(readme).toContain("mark reports as resolved without exposing student email addresses");
    expect(guide).toContain("mark a report as resolved");
    expect(review).toContain("mark reports as resolved from the admin review queue");
  });

  test("pilot dashboards show the active curriculum version", () => {
    const appSource = readProjectFile("src/App.js");
    const css = readProjectFile("src/styles.css");
    const readme = readProjectFile("README.md");
    const review = readProjectFile("SCHOOL_PILOT_REVIEW.md");

    expect(appSource).toContain("version: \"pilot-2026-07\"");
    expect(appSource).toContain("activeCurriculumVersionLabel");
    expect(appSource).toContain("Curriculum version");
    expect(css).toContain(".curriculum-version-badge");
    expect(readme).toContain("dashboards show a compact curriculum version badge");
    expect(review).toContain("show a visible curriculum version label");
  });

  test("teacher reports and student support history stay visible but scoped", () => {
    const appSource = readProjectFile("src/App.js");
    const css = readProjectFile("src/styles.css");
    const guide = readProjectFile("PILOT_LAUNCH_GUIDE.md");
    const review = readProjectFile("SCHOOL_PILOT_REVIEW.md");

    expect(appSource).toContain("DEFAULT_CLASS_REPORT_FILTERS");
    expect(appSource).toContain("Report Filters");
    expect(appSource).toContain("It only changes what you see here and what gets copied.");
    expect(appSource).toContain("reportScopedAssignments");
    expect(appSource).toContain("buildClassReportCsv");
    expect(appSource).toContain("Copy CSV");
    expect(appSource).toContain("Copy Summary");
    expect(appSource).toContain("assignment_attempts");
    expect(appSource).toContain("recordAssignmentAttempt");
    expect(appSource).toContain("getAssignmentAttemptMap");
    expect(appSource).toContain("No students match the current report filters.");
    expect(appSource).toContain("Teacher Messages");
    expect(appSource).toContain("supportMessageRows");
    expect(appSource).toContain("markNudgeRead(nudge)");
    expect(appSource).toContain("quietHoursEnabled");
    expect(appSource).toContain("Message templates");
    expect(appSource).toContain("School timing limits");
    expect(appSource).toContain("applySupportTemplate");
    expect(css).toContain(".report-filter-grid");
    expect(css).toContain(".report-filter-actions");
    expect(css).toContain(".support-message-card");
    expect(css).toContain(".support-template-input");
    expect(guide).toContain("Teacher reminders and rewards appear in the Teacher Messages panel");
    expect(guide).toContain("without putting student emails into the table export");
    expect(guide).toContain("edit support message templates");
    expect(review).toContain("The class page now has report filters");
    expect(review).toContain("without exposing student emails in the table/export");
    expect(review).toContain("persistent Teacher Messages panel");
    expect(review).toContain("quiet hours or weekdays only");
  });

  test("blind pilot test checklist is documented and visible to Super Admin", () => {
    const appSource = readProjectFile("src/App.js");
    const css = readProjectFile("src/styles.css");
    const guide = readProjectFile("PILOT_LAUNCH_GUIDE.md");
    const readme = readProjectFile("README.md");
    const runbook = readProjectFile("PILOT_BLIND_TEST_RUNBOOK.md");

    expect(appSource).toContain("PILOT_SMOKE_TEST_STEPS");
    expect(appSource).toContain("Pilot Smoke Test Console");
    expect(appSource).toContain("Copy Checklist");
    expect(appSource).toContain("formatPilotSmokeTestChecklist");
    expect(css).toContain(".pilot-test-panel");
    expect(css).toContain(".pilot-test-guardrail");
    expect(guide).toContain("PILOT_BLIND_TEST_RUNBOOK.md");
    expect(readme).toContain("Pilot Smoke Test Console");
    expect(runbook).toContain("New Teacher Blind Test Script");
    expect(runbook).toContain("Student Blind Test Script");
    expect(runbook).toContain("A student can join only with both an approved email and a fresh class code.");
  });
});
