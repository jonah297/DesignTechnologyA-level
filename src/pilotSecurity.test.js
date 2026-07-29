const fs = require("fs");
const path = require("path");

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");

describe("pilot security posture", () => {
  test("teacher signup no longer uses the legacy shared key", () => {
    const appSource = readProjectFile("src/App.js");

    expect(appSource).not.toContain(["D", "T", "HUB-PRO"].join(""));
    expect(appSource).not.toContain("TEACHER_LICENSE");
    expect(appSource).toContain("teacher_access_codes");
    expect(appSource).toContain("label=\"Lead teacher code\"");
    expect(appSource).toContain("Co-teachers leave blank");
    expect(appSource).toContain("Lead Teacher School Codes");
    expect(appSource).toContain("Generate Lead Teacher Code");
    expect(appSource).toContain("generateTeacherAccessCodeValue");
    expect(appSource).toContain("globalThis.crypto");
    expect(appSource).toContain("cryptoSource.getRandomValues(values)");
    expect(appSource).toContain("const length = 12");
    expect(appSource).toContain("Secure random code generation is unavailable in this browser.");
    expect(appSource).not.toContain("Math.random() * chars.length");
    expect(appSource).toContain("targetTeacherEmail");
    expect(appSource).toContain("maxStudentSeats");
    expect(appSource).toContain("runTransaction");
    expect(appSource).toContain("const latestCodeSnap = await transaction.get(codeRef)");
    expect(appSource).toContain("This school trial has already been used or is no longer reserved.");
    expect(appSource).toContain("TIER_ONE_TRIAL_DAYS = 30");
    expect(appSource).toContain("TIER_ONE_DAILY_ANSWER_LIMIT = 30");
    expect(appSource).toContain("getTrialWindowStartedAt");
    expect(appSource).toContain("windowStartedAt");
    expect(appSource).toContain("now - windowStartedAt < DAY_MS");
    expect(appSource).toContain("TIER_TWO_SCHOOL_TIER = \"school_core\"");
    expect(appSource).toContain("TIER_TWO_LICENSE_DAYS = 365");
    expect(appSource).toContain("TIER_THREE_ENTERPRISE_TIER = \"trust_enterprise\"");
    expect(appSource).toContain("TIER_THREE_LICENSE_DAYS = 1095");
    expect(appSource).toContain("trial_claims");
    expect(appSource).toContain("daily_answer_limit");
    expect(appSource).toContain("unlocked_chapters");
    expect(appSource).toContain("class_invites");
  });

  test("local Super Admin shortcut is not production-key based", () => {
    const appSource = readProjectFile("src/App.js");
    const readme = readProjectFile("README.md");
    const envExample = readProjectFile(".env.example");
    const productionEnv = readProjectFile(".env.production");
    const vercelConfig = readProjectFile("vercel.json");

    expect(appSource).not.toContain("REACT_APP_SUPER_ADMIN_KEY");
    expect(appSource).not.toContain("dthub.app@gmail.com");
    expect(readme).not.toContain("REACT_APP_SUPER_ADMIN_KEY");
    expect(envExample).not.toContain("REACT_APP_SUPER_ADMIN_KEY");
    expect(appSource).toContain("REACT_APP_LOCAL_SUPER_ADMIN_KEY");
    expect(appSource).toContain("process.env.NODE_ENV === \"development\"");
    expect(appSource).toContain("isLocalBrowserHost");
    expect(appSource).toContain("localhost");
    expect(appSource).toContain("Use the Firebase admin account for live admin access.");
    expect(productionEnv).toContain("GENERATE_SOURCEMAP=false");
    expect(vercelConfig).toContain("Content-Security-Policy");
    expect(vercelConfig).toContain("frame-ancestors 'none'");
    expect(vercelConfig).toContain("X-Frame-Options");
    expect(vercelConfig).toContain("DENY");
    expect(vercelConfig).toContain("X-Content-Type-Options");
    expect(vercelConfig).toContain("nosniff");
    expect(vercelConfig).toContain("Permissions-Policy");
    expect(vercelConfig).toContain("https://*.googleapis.com");
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
    const classJoinCodeRules = rules.match(
      /match \/class_join_codes\/\{codeId\} \{[\s\S]*?\n    \}/
    )[0];
    const curriculumRules = rules.slice(
      rules.indexOf("match /curriculums/{subjectId}"),
      rules.indexOf("match /flagged_content/{flagId}")
    );
    const teacherAccessCodeRules = rules.match(
      /match \/teacher_access_codes\/\{codeId\} \{[\s\S]*?\n    \}/
    )[0];
    const trialClaimRules = rules.match(
      /match \/trial_claims\/\{claimId\} \{[\s\S]*?\n    \}/
    )[0];

    expect(rules).toContain("match /teacher_access_codes/{codeId}");
    expect(rules).toContain("validTeacherAccessCode");
    expect(rules).toContain("validTeacherClassInvite");
    expect(rules).toContain("teacherCanCreateAccessCodeLicense");
    expect(rules).toContain("validPublicProfileProjection");
    expect(rules).toContain("request.resource.data.role == userDataAfter().role");
    expect(rules).toContain("request.resource.data.classIds == userClassIdsAfter()");
    expect(rules).toContain("request.resource.data.classId == request.resource.data.classIds[0]");
    expect(rules).toContain("teacherCanWorkForRequestClass");
    expect(rules).toContain("teacherHasOpenLicenseForClass");
    expect(rules).toContain("teacherCanReadPrivateClassProfile");
    expect(rules).toContain("request.resource.data.licenseId == userData().licenseId");
    expect(rules).toContain("profileData.licenseId == userData().licenseId");
    expect(rules).toContain("canReadCurriculum");
    expect(rules).toContain("canReadCurriculumMetadata");
    expect(rules).toContain("curriculumMetadataDoc");
    expect(rules).toContain("canReadCurriculumChapter");
    expect(rules).toContain("licenseAllowsChapter");
    expect(rules).toContain("validCurriculumMetadataWrite");
    expect(rules).toContain("validCurriculumSubsectionWrite");
    expect(rules).toContain("validCurriculumWrittenQuestionWrite");
    expect(rules).toContain("userHasOpenLicense");
    expect(rules).toContain("listContains(userLicenseData().unlocked_subjects, subjectId)");
    expect(rules).toContain("listContains(userLicenseData().unlocked_chapters, chapterId)");
    expect(curriculumRules).toContain("allow get:");
    expect(curriculumRules).toContain("allow list: if isAdmin()");
    expect(curriculumRules).toContain("match /chapters/{chapterId}");
    expect(curriculumRules).toContain("match /subsections/{subsectionId}");
    expect(curriculumRules).toContain("match /writtenQuestions/{questionId}");
    expect(curriculumRules).not.toContain("\"chapters\"");
    expect(curriculumRules).not.toContain("\"writtenQuestions\"");
    expect(rules).toContain("validFlagCreate");
    expect(rules).toContain("request.resource.data.reporterRole == userData().role");
    expect(rules).toContain("request.resource.data.licenseId == userData().licenseId");
    expect(rules).toContain("flagData.licenseId == userData().licenseId");
    expect(rules).toContain("validLicenseManagerClassUpdate");
    expect(rules).toContain("request.resource.data.classes.size() <= resource.data.max_classes");
    expect(rules).toContain("validApprovedStudentCreate");
    expect(rules).toContain("validApprovedStudentManagerUpdate");
    expect(rules).toContain("validApprovedStudentJoinUpdate");
    expect(rules).toContain("request.resource.data.createdBy == emailId()");
    expect(rules).toContain("request.resource.data.createdAt == resource.data.createdAt");
    expect(rules).toContain("getAfter(userPath(studentId)).data.classIds == request.resource.data.joinedClassIds");
    expect(rules).toContain("\"school_core\"");
    expect(rules).toContain("\"trust_enterprise\"");
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
    expect(rules).toContain("match /trial_claims/{claimId}");
    expect(rules).toContain("request.resource.data.tier == \"starter_trial\"");
    expect(rules).toContain("request.resource.data.tier == \"school_core\"");
    expect(rules).toContain("request.resource.data.tier == \"trust_enterprise\"");
    expect(rules).toContain("request.resource.data.daily_answer_limit is int");
    expect(rules).toContain("\"trialUsage\"");
    expect(rules).toContain("validTrialUsageUpdate");
    expect(rules).toContain("\"windowStartedAt\"");
    expect(rules).toContain("request.resource.data.trialUsage.windowStartedAt >= request.time.toMillis() - 86400000");
    expect(rules).toContain("resource.data.trialUsage.windowStartedAt == request.resource.data.trialUsage.windowStartedAt");
    expect(rules).toContain("resource.data.trialUsage.windowStartedAt <= request.time.toMillis() - 86400000");
    expect(rules).toContain("request.resource.data.trialUsage.answerCount >= resource.data.trialUsage.answerCount");
    expect(rules).toContain("request.resource.data.trialUsage.answerCount <= resource.data.trialUsage.answerCount + 1");
    expect(rules).toContain("validProgressRecord");
    expect(rules).toContain("request.resource.data.lastSeen >= resource.data.lastSeen");
    expect(rules).toContain("\"memoryModelVersion\"");
    expect(rules).toContain("\"stabilityDays\"");
    expect(rules).toContain("\"retrievabilityAtReview\"");
    expect(classJoinCodeRules).toContain("allow get:");
    expect(classJoinCodeRules).toContain("allow list:");
    expect(classJoinCodeRules).toContain("resource.data.status == \"active\"");
    expect(classJoinCodeRules).toContain("resource.data.expiresAt > request.time");
    expect(classJoinCodeRules).toContain("resource.data.createdBy == emailId()");
    expect(classJoinCodeRules).toContain("teacherCanWorkForRequestClass()");
    expect(teacherAccessCodeRules).toContain("allow get:");
    expect(teacherAccessCodeRules).toContain("allow list: if isAdmin()");
    expect(teacherAccessCodeRules).toContain("resource.data.targetTeacherEmail == emailId()");
    expect(teacherAccessCodeRules).toContain("resource.data.expiresAt > request.time");
    expect(teacherAccessCodeRules).toContain("changedKeys().hasOnly([\n            \"status\"");
    expect(teacherAccessCodeRules).not.toContain("\"licenseId\",\n            \"redeemedAt\"");
    expect(trialClaimRules).toContain("allow get:");
    expect(trialClaimRules).toContain("allow list: if isAdmin()");
    expect(trialClaimRules).toContain("resource.data.targetTeacherEmail == emailId()");
    expect(rules).toContain("listContains(get(licensePath(request.resource.data.licenseId)).data.unlocked_subjects, request.resource.data.subjectId)");
    expect(rules).toContain("request.resource.data.deadline > request.time.toMillis()");
    expect(rules).toContain("request.resource.data.targetMastery >= 1");
    expect(rules).toContain("request.resource.data.targetMastery <= 100");
    expect(rules).toContain("assignmentData.licenseId == userData().licenseId");
    expect(rules).toContain("userData().role == \"student\" && isClassMember(assignmentData.classId)");
    expect(rules).toContain("canManageLicense(resource.data)");
    expect(manageLicenseBody).not.toContain("teacherIds");
  });

  test("shared teacher invite acceptance uses a batched invite marker", () => {
    const appSource = readProjectFile("src/App.js");
    const rules = readProjectFile("firestore.rules");

    expect(appSource).toContain("const MAX_TEACHERS_PER_CLASS = 5");
    expect(appSource).toContain("getTeacherShareUsage");
    expect(appSource).toContain("sendTeacherInvite");
    expect(appSource).toContain("const SHARED_TEACHER_INVITE_EXPIRY_DAYS = 7");
    expect(appSource).toContain("isActiveTeacherInvite");
    expect(appSource).toContain("expiresAt: new Date(now + SHARED_TEACHER_INVITE_EXPIRY_DAYS * DAY_MS)");
    expect(appSource).toContain("This class invitation has expired. Ask the Account Manager to send a fresh invite.");
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
    expect(rules).toContain("\"expiresAt\"");
    expect(rules).toContain("classInviteData(inviteId).expiresAt > request.time");
    expect(rules).toContain("request.resource.data.expiresAt.toMillis() <= request.time.toMillis() + 604800000");
    expect(rules).toContain("resource.data.expiresAt > request.time");
  });

  test("pilot guide documents the one-time invite-code setup", () => {
    const guide = readProjectFile("PILOT_LAUNCH_GUIDE.md");

    expect(guide).toContain("one-time school invite code");
    expect(guide).toContain("Admin Control");
    expect(guide).toContain("Generate Lead Teacher Code");
    expect(guide).toContain("teacher_access_codes");
    expect(guide).toContain("free-plan route");
    expect(guide).toContain("Tier 2 School Core");
    expect(guide).toContain("Tier 3 Trust & Enterprise");
    expect(guide).not.toContain("pilot teacher access key");
  });

  test("student joining is gated by approved school emails and class join codes", () => {
    const appSource = readProjectFile("src/App.js");
    const rules = readProjectFile("firestore.rules");
    const guide = readProjectFile("PILOT_LAUNCH_GUIDE.md");
    const readme = readProjectFile("README.md");

    expect(appSource).toContain("Approved Student List");
    expect(appSource).toContain("approved_students");
    expect(appSource).toContain("authUid: credential.user.uid");
    expect(appSource).toContain("claimedUid: credential.user.uid");
    expect(appSource).toContain("claimedUid: currentAuthUid");
    expect(appSource).toContain("Your school email is not on the Approved Student List");
    expect(appSource).toContain("expiresAt: new Date(now + HOUR_MS)");
    expect(appSource).toContain("function StudentJoinCodeCard");
    expect(appSource).toContain("formatJoinCodeCountdown");
    expect(appSource).toContain("Expires in");
    expect(appSource).toContain("Close Code");
    expect(appSource).toContain("applyCreatedJoinCode");
    expect(appSource).toContain("for (let attempt = 0; attempt < 5 && !createdCode; attempt += 1)");
    expect(appSource).toContain("Could not create a unique student join code.");
    expect(appSource).toContain("timestampToMillis(code.expiresAt) <= Date.now()");
    expect(rules).toContain("validStudentApprovalForLicense");
    expect(rules).toContain("match /approved_students/{studentId}");
    expect(rules).toContain("request.resource.data.authUid == request.auth.uid");
    expect(rules).toContain("request.resource.data.claimedUid == request.auth.uid");
    expect(rules).toContain("resource.data.claimedUid == request.auth.uid");
    expect(rules).toContain("validClassJoinCode");
    expect(rules).toContain("request.resource.data.expiresAt.toMillis() <= request.time.toMillis() + 3600000");
    expect(readme).toContain("Codes are 12 characters");
    expect(readme).toContain("expire after 60 minutes");
    expect(readme).toContain("live countdown on the teacher class card");
    expect(readme).not.toContain("Codes expire after 24 hours");
    expect(guide).toContain("their school email must already be on the Approved Student List");
    expect(guide).toContain("The card counts down live");
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
    expect(appSource).toContain("Firestore writes enabled");
    expect(appSource).toContain("Firestore writes paused");
    expect(appSource).toContain("Nearest deadline");
    expect(appSource).toContain("ActivityBarChart");
    expect(appSource).toContain("Class Activity This Month");
    expect(appSource).toContain("Student Activity This Month");
    expect(appSource).toContain("DashboardGuideBox");
    expect(appSource).toContain("How to read this dashboard");
    expect(appSource).toContain("ReadinessScale");
    expect(appSource).toContain("Multi-Class Report Centre");
    expect(appSource).toContain("Closed assignment history");
    expect(appSource).toContain("teacherReportFilters");
    expect(appSource).toContain("quietest students first");
    expect(appSource).toContain("teacherDashboardInsightModal");
    expect(appSource).toContain("dashboard-insight-table");
    expect(styles).toContain(".activity-bar-panel");
    expect(styles).toContain(".activity-bar-grid");
    expect(styles).toContain(".activity-chart-summary");
    expect(styles).toContain(".activity-chart-scale");
    expect(styles).toContain(".activity-chart-legend");
    expect(styles).toContain(".activity-chart-surface");
    expect(styles).toContain(".activity-bar-grid.is-dense");
    expect(styles).toContain(".dashboard-guide-box");
    expect(styles).toContain(".term-hint");
    expect(styles).toContain(".report-centre-grid");
    expect(styles).toContain(".report-student-grid");
    expect(styles).toContain(".report-assignment-card");
    expect(styles).toContain(".dashboard-insight-table");
  });

  test("responsive polish avoids cramped insight modals and keeps shared controls visible", () => {
    const appSource = readProjectFile("src/App.js");
    const styles = readProjectFile("src/styles.css");

    expect(appSource).toContain("renderLandingView");
    expect(appSource).toContain("Start free pilot");
    expect(appSource).toContain("Starter Pilot");
    expect(appSource).toContain("Three-tier licence model");
    expect(appSource).toContain("Pilot access");
    expect(appSource).toContain("Super Admin issues a one-time lead teacher code");
    expect(appSource).toContain("Terms draft prepared");
    expect(appSource).toContain("No Active Assignments");
    expect(styles).toContain(".landing-page");
    expect(styles).toContain(".landing-tier-grid");
    expect(styles).toContain(".landing-access-grid");
    expect(styles).toContain(".landing-footer");
    expect(styles).toContain(".assignment-empty-state");
    expect(styles).toContain(".has-simulation-dock .activity-bar-panel");
    expect(appSource).toContain("AppLoadingScreen");
    expect(appSource).toContain("login-logo-orb");
    expect(appSource).toContain("Memory Repair");
    expect(appSource).toContain("Your Study Hub");
    expect(appSource).toContain("Subsection Progress");
    expect(appSource).toContain("setBlitzFilters([])");
    expect(appSource).toContain("hex-pro-teal");
    expect(styles).toContain(".student-dashboard-shell");
    expect(styles).toContain(".student-memory-bar");
    expect(styles).toContain(".student-subsection-row");
    expect(styles).toContain(".insight-modal .optional-cell");
    expect(styles).toContain(".insight-modal .responsive-table td::before");
    expect(styles).toContain(".app-loading-screen");
    expect(styles).toContain(".filter-item:hover");
    expect(styles).toContain(".hex-pro-teal");
  });

  test("student answer engine uses multiple choice and written auto-marking", () => {
    const quizCards = readProjectFile("src/components/QuizCards.js");
    const answerEngine = readProjectFile("src/answerEngine.js");
    const styles = readProjectFile("src/styles.css");
    const readme = readProjectFile("README.md");

    expect(quizCards).toContain("buildFlashcardOptions");
    expect(quizCards).toContain("markWrittenAnswer");
    expect(quizCards).toContain("Request Review");
    expect(quizCards).toContain("Typed answer is not attached automatically for privacy");
    expect(quizCards).not.toContain("`Typed answer: ${answerText");
    expect(readProjectFile("src/components/AdminCurriculumEditor.js")).toContain("Marking review");
    expect(answerEngine).toContain("subsectionCards");
    expect(answerEngine).toContain("FALLBACK_DISTRACTORS");
    expect(styles).toContain(".answer-option-grid");
    expect(styles).toContain(".written-mark-panel");
    expect(readme).toContain("four-option multiple-choice engine");
  });

  test("licensed curriculum loading avoids non-admin collection listing", () => {
    const appSource = readProjectFile("src/App.js");
    const rules = readProjectFile("firestore.rules");
    const readme = readProjectFile("README.md");

    expect(appSource).toContain("createEmptyCurriculum");
    expect(appSource).toContain("CURRICULUM_STORAGE_MODEL");
    expect(appSource).toContain("loadSplitCurriculum");
    expect(appSource).toContain("getCurriculumSplitWriteOperations");
    expect(appSource).toContain("commitFirestoreOperations");
    expect(appSource).toContain("hasAdminPrivileges || userRole === \"admin\"");
    expect(appSource).toContain("doc(db, \"curriculums\", subjectId)");
    expect(appSource).toContain("collection(database, \"curriculums\", subject, \"chapters\")");
    expect(appSource).toContain("\"curriculums\",\n          curriculum.id,\n          \"chapters\"");
    expect(appSource).toContain("userLicenseId && !activeLicense");
    expect(appSource).toContain("licenseSubjectIds.length > 0");
    expect(rules).toContain("allow list: if isAdmin()");
    expect(readme).toContain("Normal users load exact curriculum metadata documents for licensed subjects");
    expect(readme).toContain("enforce chapter-level access on the nested chapter/subsection/question documents");
    expect(readme).toContain("remaining transition caveat is the bundled `src/data.js` fallback");
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
    expect(appSource).toContain("await runTransaction(db, async (transaction) => {");
    expect(appSource).toContain("transaction.set(doc(db, \"licenses\", licenseId), licensePayload)");
    expect(appSource).toContain("transaction.set(\n                      codeRef");
    expect(appSource).toContain("status: \"redeemed\"");
    expect(appSource).toContain("createdFromAccessCodeId: teacherAccessCodeId");
    expect(appSource).toContain("approveStudentSeat");
    expect(appSource).toContain("generateClassJoinCode");
    expect(appSource).toContain("joinStudentClassWithCode");
    expect(appSource).toContain("markAssignmentComplete");
    expect(appSource).toContain("getAssignmentLink");
    expect(appSource).toContain("copyAssignmentLink");
    expect(appSource).toContain("url.searchParams.set(\"assignment\", assignment.id)");
    expect(appSource).toContain("assignmentLinkHandledRef");
    expect(appSource).toContain("studentClassIds.includes(assignment.classId)");
    expect(appSource).toContain("loadAssignment(linkedAssignment)");
    expect(appSource).toContain("flagContentError");
    expect(appSource).toContain("resolveFlaggedContent");
    expect(rules).toContain("validTeacherAccessCode");
    expect(rules).toContain("teacherCanCreateAccessCodeLicense");
    expect(rules).toContain("validStudentApprovalForLicense");
    expect(rules).toContain("validClassJoinCode");
  });

  test("approved student list supports CSV import and export", () => {
    const appSource = readProjectFile("src/App.js");
    const guide = readProjectFile("PILOT_LAUNCH_GUIDE.md");
    const review = readProjectFile("SCHOOL_PILOT_REVIEW.md");

    expect(appSource).toContain("parseApprovedStudentCsv");
    expect(appSource).toContain("APPROVED_STUDENT_CSV_MAX_BYTES");
    expect(appSource).toContain("APPROVED_STUDENT_CSV_MAX_ROWS");
    expect(appSource).toContain("SPREADSHEET_FORMULA_PREFIX_PATTERN");
    expect(appSource).toContain("Import up to ${APPROVED_STUDENT_CSV_MAX_ROWS} student rows at a time.");
    expect(appSource).toContain("That CSV is too large. Import up to 1,000 student rows or 256 KB at a time.");
    expect(appSource).toContain("Import CSV");
    expect(appSource).toContain("Export CSV");
    expect(appSource).toContain("CSV columns: email, reference_name. Limit 1,000 rows / 256 KB.");
    expect(appSource).toContain("Joined student records stay locked for audit safety");
    expect(guide).toContain("import/export CSV files");
    expect(guide).toContain("Imports are limited to 1,000 student rows / 256 KB");
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
    expect(appSource).toContain("Copy Run Sheet");
    expect(appSource).toContain("formatPilotSmokeTestChecklist");
    expect(appSource).toContain("PILOT_SMOKE_TEST_STORAGE_KEY");
    expect(appSource).toContain("Needs Fix");
    expect(appSource).toContain("This is a guided rehearsal, not a personal homework list.");
    expect(appSource).toContain("Teacher and student testers");
    expect(css).toContain(".pilot-test-panel");
    expect(css).toContain(".pilot-test-role-strip");
    expect(css).toContain(".pilot-test-summary");
    expect(css).toContain(".pilot-check-status");
    expect(css).toContain(".pilot-test-notes");
    expect(css).toContain(".pilot-test-guardrail");
    expect(guide).toContain("PILOT_BLIND_TEST_RUNBOOK.md");
    expect(guide).toContain("Memory Repair");
    expect(guide).toContain("The in-app **Pilot Smoke Test Console** is a rehearsal guide and run sheet.");
    expect(guide).toContain("Pending, Pass, or Needs Fix");
    expect(readme).toContain("Pilot Smoke Test Console");
    expect(readme).toContain("local pass/fix tracking");
    expect(readme).toContain("split by role");
    expect(readme).toContain("localStorage");
    expect(runbook).toContain("In-App Run Sheet");
    expect(runbook).toContain("Who Does What");
    expect(runbook).toContain("New Teacher Blind Test Script");
    expect(runbook).toContain("Student Blind Test Script");
    expect(runbook).toContain("A student can join only with both an approved email and a fresh class code.");
  });

  test("Anja beta polish keeps onboarding and support settings understandable", () => {
    const appSource = readProjectFile("src/App.js");
    const css = readProjectFile("src/styles.css");

    expect(appSource).toContain("function LoginField");
    expect(appSource).toContain("Email address");
    expect(appSource).toContain("autoCorrect=\"off\"");
    expect(appSource).toContain("Inactive code preview - not usable yet");
    expect(appSource).toContain("Not Usable Yet");
    expect(appSource).toContain("Share This Class");
    expect(appSource).toContain("Invite Teacher");
    expect(appSource).toContain("What do these numbers mean?");
    expect(appSource).toContain("Opening the app, leaving the tab open");
    expect(appSource).toContain("ASSIGNMENT_STATUS_FILTER_LABELS");
    expect(appSource).toContain("Red: below target");
    expect(appSource).toContain("A streak day is earned by answering at least one recall question");
    expect(appSource).toContain("NUDGE_TIMING_OPTIONS");
    expect(appSource).toContain("<select");
    expect(css).toContain(".login-field");
    expect(css).toContain(".student-explainer-box");
    expect(css).toContain(".warning-text");
  });

  test("reload restore and student detail modal avoid accidental page resets", () => {
    const appSource = readProjectFile("src/App.js");
    const css = readProjectFile("src/styles.css");
    const handover = readProjectFile("LIVE_HANDOVER.md");

    expect(appSource).toContain("APP_SESSION_STORAGE_KEY");
    expect(appSource).toContain("sharp_study_last_session");
    expect(appSource).toContain("onAuthStateChanged");
    expect(appSource).toContain("signOut");
    expect(appSource).toContain("writeStoredCurrentUser");
    expect(appSource).toContain("clearStoredCurrentUser");
    expect(appSource).toContain("const verifiedEmail = String(firebaseUser?.email || \"\").toLowerCase()");
    expect(appSource).toContain("previousUser === ROOT_ADMIN_ID && isSuperAdminSession");
    expect(appSource).toContain("getInitialViewForUser(currentUser)");
    expect(appSource).toContain("getRoleSafeView(view, userRole");
    expect(appSource).toContain("localStorage.setItem(\n        APP_SESSION_STORAGE_KEY");
    expect(appSource).toContain("localStorage.removeItem(APP_SESSION_STORAGE_KEY)");
    expect(appSource).toContain("signOut(auth).catch");
    expect(appSource).toContain("document.body.style.overflow = \"hidden\"");
    expect(appSource).toContain("student-detail-modal");
    expect(css).toContain(".student-detail-modal");
    expect(css).toContain("overscroll-behavior: contain");
    expect(css).toContain(".modal-action-group .mini-action-btn");
    expect(handover).toContain("Real Firebase accounts restore their last safe page on refresh");
  });
});
