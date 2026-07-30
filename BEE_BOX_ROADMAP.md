# Bee Box Roadmap — MathQuest → Bee Box alignment

Durable, cross-session checklist for evolving MathQuest toward the `Bee Box.docx` product blueprint. Check items off as they land; this file (not the ephemeral Claude Code plan file) is the source of truth for progress.

Decisions made:
1. **Foundation-first** — rebuild identity/role model before adding new feature modules.
2. **First vertical feature = Parent Action Center** — smallest lift among the blueprint's 3 recommended starting journeys (Teacher Attendance / Student Assignment / Parent Action Center).

---

## Phase 1 — Identity & Role Foundation ✅ DONE (2026-07-30)

- [x] Schema: add `School`
- [x] Schema: add `Person`
- [x] Schema: add `RoleAssignment`
- [x] Schema: extend `User` (personId, status, lastLoginAt)
- [x] Schema: add `Class.schoolId`
- [x] Schema: rename `ParentLink` → `GuardianStudentRelationship` + richer fields
- [x] Run expand migration
- [x] Write + run `backend/scripts/backfill-identity.js`
- [x] Add `backend/src/utils/school.js`, `backend/src/utils/roleAssignment.js`
- [x] Update `jwt.js` / `middleware/auth.js` for role-assignment-based payload
- [x] Update `routes/auth.js` (register/login/refresh/me)
- [x] Update `routes/classes.js` (schoolId), `routes/parentLinks.js` (rename)
- [x] Run contract migration (drop `User.role`, require personId/schoolId)
- [x] Verify Phase 1 end-to-end — register/login (STUDENT/TEACHER/PARENT), class create+join, parent claim+children, full quiz session (start→answer→finish→profile) all confirmed working against the new JWT/RoleAssignment shape.

**Deferred:** full `scopeType`/`scopeId` scoping, sensitivity levels, `AuditLog`, password reset, role-switching UI/endpoint, `Person` as FK target elsewhere, school-scoped query filtering.

---

## Phase 2 — Parent Action Center ✅ DONE (2026-07-30)

- [x] `index.html`: `parentRegisterScreen`, `parentClaimScreen`, `parentHomeScreen`, `parentProfileScreen`
- [x] `index.html`: login screen parent-register link
- [x] `game.js`: parent state (`CURRENT_ROLE`, `PARENT`)
- [x] `game.js`: `syncParentChildren`, `syncParentChildDetail`, `renderParentHome`, `renderParentProfile`, `bootParentMode`
- [x] `game.js`: role-branch `tryRestoreSession`, splash bootstrap, `loginSubmit`
- [x] `game.js`: parent register/claim submit handlers
- [x] `game.js`: nav whitelist + `setNavForRole`, child-chip switching, `logout` reset
- [x] `style.css`: child-chip / activity-list styles
- [x] Sync to `mobile-app/` (`sync-web.sh` + `cap sync android`, both completed clean)
- [x] Verify Phase 2 end-to-end — drove the full flow in headless Chromium (Playwright): parent register → claim child by link code → home screen with child stats → profile screen with linked child + logout → **regression check: logged back in as the same STUDENT account and confirmed the student flow (5-item nav, hero card, level map) is completely unaffected**. Zero console/page errors throughout. Screenshots confirmed layout matches the app's existing visual style.
  - Not verified: actual on-device/emulator Android rendering (no emulator available in this environment) — `cap sync android` completed without error, which is as far as this environment can confirm.

**Deferred:** Attendance/Calendar/Inbox nav, Portfolio/kegiatan, editing guardian-relationship metadata, unlinking a child, full role-switcher header UI.

---

## Backlog (future phases, not yet planned in detail)

- Teacher Attendance (AttendanceSession/AttendanceRecord — zero scaffolding today)
- Student Assignment lifecycle (Not Started/Submitted/Late/Graded status model, replacing today's simpler quiz-only flow)
- Announcements (school/class broadcast, read receipts)
- Gamification ledger (Bee Points as a real `PointLedger` vs. today's inline XP fields on `StudentProfile`)
- Full role-switcher UI (one account, multiple active `RoleAssignment`s, context switcher in the header)
- Multi-school scoping actually enforced in queries (today only one `School` row exists)
