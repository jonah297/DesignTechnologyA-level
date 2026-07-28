# Sharp Study Legal Implementation Checklist

**Date:** 22 July 2026  
**Status:** Companion checklist for Terms and Conditions v0.1 draft

## Documents Needed Before Real Student Pilot

1. **Terms and Conditions**
   - Draft created: `SHARP_STUDY_TERMS_AND_CONDITIONS_DRAFT_2026-07-22.md`
   - Printable Word version created: `SHARP_STUDY_TERMS_AND_CONDITIONS_DRAFT_2026-07-22.docx`
   - Needs solicitor review before publication.

2. **Privacy Notice**
   - Still needed.
   - Must explain student data, teacher visibility, lawful bases, Firebase/Vercel or other processors, retention, user rights, and contact process.

3. **Child-Friendly Privacy Summary**
   - Still needed.
   - Must explain in simple language what students can do, what teachers can see, and what students should not type into free-text fields.

4. **School Pilot / Data-Processing Agreement**
   - Still needed before a school pilot.
   - Should explain the 30 day free pilot, responsibilities of the school, who is controller/processor, support process, student data visibility, and pilot feedback.

5. **Acceptable Use Summary**
   - Covered inside the T&C.
   - Could also become a shorter teacher/student handout later.

## App Changes Needed Before Publishing Terms

1. Add links to Terms and Privacy Notice on:
   - login page;
   - sign-up page;
   - student dashboard;
   - teacher dashboard;
   - footer/help area.

2. Add acceptance checkbox during sign-up:
   - "I agree to the Sharp Study Terms and Conditions."
   - Store accepted version and timestamp on the user record.

3. Add student linked-class notice:
   - Before joining a class, show: "If you join this class, authorised teachers for the class can see your study progress, assignment status, mastery, scores, timestamps, and activity."
   - Require confirmation before joining.

4. Add teacher authority confirmation:
   - During teacher sign-up or lead-code redemption, show: "I confirm I am authorised by my school/institution to use Sharp Study with these students."
   - Store confirmation version and timestamp.

5. Add independent-student wording:
   - Make clear that independent student accounts are not visible to teacher dashboards unless the student later joins a class.

6. Add pilot-specific notice:
   - "This is a free 30 day pilot for testing and feedback. Features may change during the pilot."

7. Add legal versioning constants in the app:
   - `TERMS_VERSION = "terms-v0.1-2026-07-22"`
   - `PRIVACY_VERSION = "privacy-v0.1-[date]"`
   - Store accepted versions in `users/{email}`.

## Key Review Questions For A Solicitor

1. Is `Jonah Theo Stanwell-Smith trading as Sharp Study` the right operator wording before a company is formed?
2. Is the under-13 / under-18 wording strong enough for the intended pilot?
3. Should school-linked access rely on school authorisation rather than direct student consent?
4. Should Sharp Study act as controller, processor, or mixed controller/processor for different parts of the service?
5. Is the limitation of liability suitable for a free pilot and later paid school licences?
6. Is a separate Data Processing Agreement required before even a free pilot?
7. Does the app need a formal parental notice for any independent under-13 student accounts?
8. Should independent student accounts be restricted by age until the privacy/legal pack is finished?

## Practical Recommendation

For the first live pilot, keep it simple:

1. Use one school or a very small trusted group.
2. Use controlled teacher invite codes.
3. Use approved student school emails.
4. Avoid open public sign-up for younger students until the Privacy Notice and child-friendly summary are complete.
5. Treat the current T&C as a strong draft, not final legal advice.
