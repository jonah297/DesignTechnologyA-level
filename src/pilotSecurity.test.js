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
    expect(appSource).toContain("Lead teacher code, or leave blank if invited");
    expect(appSource).toContain("class_invites");
  });

  test("Firestore rules require teacher access codes and protect license management", () => {
    const rules = readProjectFile("firestore.rules");
    const manageLicenseBody = rules.match(
      /function canManageLicense\(licenseData\) \{[\s\S]*?\n    \}/
    )[0];

    expect(rules).toContain("match /teacher_access_codes/{codeId}");
    expect(rules).toContain("validTeacherAccessCode");
    expect(rules).toContain("validTeacherClassInvite");
    expect(rules).toContain("validBaseUserCreate");
    expect(rules).toContain("request.resource.data.xpTotal == 0");
    expect(rules).toContain("request.resource.data.activeEngagements == 0");
    expect(rules).toContain("createdFromAccessCodeId");
    expect(rules).toContain("canManageLicense(resource.data)");
    expect(manageLicenseBody).not.toContain("teacherIds");
  });

  test("pilot guide documents the one-time invite-code setup", () => {
    const guide = readProjectFile("PILOT_LAUNCH_GUIDE.md");

    expect(guide).toContain("one-time pilot invite code");
    expect(guide).toContain("teacher_access_codes");
    expect(guide).not.toContain("pilot teacher access key");
  });
});
