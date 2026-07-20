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
    expect(rules).toContain("lastAcceptedInviteId");
    expect(rules).toContain("resource.data.status == \"pending\"");
    expect(rules).toContain("validBaseUserCreate");
    expect(rules).toContain("request.resource.data.xpTotal == 0");
    expect(rules).toContain("request.resource.data.activeEngagements == 0");
    expect(rules).toContain("createdFromAccessCodeId");
    expect(rules).toContain("canManageLicense(resource.data)");
    expect(manageLicenseBody).not.toContain("teacherIds");
  });

  test("shared teacher invite acceptance uses a batched invite marker", () => {
    const appSource = readProjectFile("src/App.js");

    expect(appSource).toContain("lastAcceptedInviteId: invite.id");
    expect(appSource).toContain("const acceptBatch = writeBatch(db)");
    expect(appSource).toContain("This invitation belongs to a different school license.");
  });

  test("pilot guide documents the one-time invite-code setup", () => {
    const guide = readProjectFile("PILOT_LAUNCH_GUIDE.md");

    expect(guide).toContain("one-time pilot invite code");
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
    expect(appSource).toContain("Generate Code");
    expect(rules).toContain("validStudentApprovalForLicense");
    expect(rules).toContain("match /approved_students/{studentId}");
    expect(rules).toContain("validClassJoinCode");
    expect(readme).toContain("Codes expire after 60 minutes");
    expect(readme).not.toContain("Codes expire after 24 hours");
    expect(guide).toContain("their school email must already be on the Approved Student List");
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
});
