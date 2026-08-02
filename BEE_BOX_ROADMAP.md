# Bee Box Roadmap — MathQuest → Bee Box alignment

Durable, cross-session checklist for evolving MathQuest toward the `Bee Box.docx` product blueprint. Check items off as they land; this file (not the ephemeral Claude Code plan file) is the source of truth for progress.

Decisions made:
1. **Foundation-first** — rebuild identity/role model before adding new feature modules.
2. **First vertical feature = Parent Action Center** — smallest lift among the blueprint's 3 recommended starting journeys (Teacher Attendance / Student Assignment / Parent Action Center).
3. From Phase 4 onward: following the team's `Review.md` blueprint-gap audit, in the audit's own recommended priority order (Section 20).

---

## Phase 1 — Identity & Role Foundation ✅ DONE (2026-07-30)

- [x] Schema: `School`, `Person`, `RoleAssignment`, `User` extended (personId, status, lastLoginAt), `Class.schoolId`, `ParentLink` → `GuardianStudentRelationship`
- [x] Expand → backfill (`backend/scripts/backfill-identity.js`) → contract migration
- [x] `jwt.js`/`middleware/auth.js` role-assignment-based payload; `routes/auth.js`, `routes/classes.js`, `routes/parentLinks.js` updated
- [x] Verified end-to-end — register/login all roles, class create+join, parent claim+children, full quiz session against the new JWT/RoleAssignment shape

**Deferred:** full `scopeType`/`scopeId` scoping, sensitivity levels, `AuditLog`, password reset, role-switching UI/endpoint, `Person` as FK target elsewhere, school-scoped query filtering. *(Most of this is now Phase 4 — see below.)*

## Phase 2 — Parent Action Center ✅ DONE (2026-07-30)

- [x] Parent register/claim/home/profile screens, `game.js` parent state + render functions, role-branch session restore/login
- [x] Verified end-to-end via Playwright: register → claim → home → profile → logout, student flow regression-checked unaffected

**Deferred:** Attendance/Calendar/Inbox nav, Portfolio, editing guardian-relationship metadata, unlinking a child, full role-switcher header UI.

## Phase 3 — Visual rebrand + Home "Today" restructure ✅ DONE (2026-08-01)

- [x] Full "Full Bee" (black+amber) palette rebrand, MathQuest→Bee Box text/logo, Android package rename `com.beebox.app`
- [x] Backend: `GET /profile/me` exposes `lastPlayedDate`/`playedToday` + achievement timestamps
- [x] Home restructured to blueprint's "Today" pattern (Perlu Dikerjakan / Akan Datang / Aktivitas Terbaru / Progress)
- [x] Bonus fix: `.h-item` family had zero CSS anywhere — now styled
- [x] Verified end-to-end via headless Chromium, zero console errors

## Phase 3.1 — Home redesign: menu grid instead of "Today" pattern ✅ DONE (2026-08-01)

User explicitly overrode the blueprint's "Today" decision after seeing it, asked for a PLN Mobile-style menu grid instead.

- [x] Header banner (greeting/bell/avatar/stat pills), primary grid (Belajar/Ujian/Progress/Profil → new `#learnScreen` for the level map), secondary grid (Main Cepat/Tantangan Harian/Prestasi/Gabung Kelas), real "Pemberitahuan" feed, "Undangan" (parent link code) surfaced on Home
- [x] Verified end-to-end, zero console errors

**Note (2026-08-02):** `Review.md` (team audit) flags Home-as-menu as ❌ against the blueprint and asks for the exact Today-pattern sections Phase 3 built and Phase 3.1 removed (Need Action/Upcoming/Recent Updates/Priority card). Known tension between team review and user's explicit direction — not resolved, flagged for the user's awareness only.

## Phase 3.2 — Calmer/brighter palette (cream, not black) ✅ DONE (2026-08-01)

- [x] `--bg`/`--bg2` → honey-cream, `--text` → dark warm brown, accent colors deepened for light-bg contrast
- [x] Added `--onAccent` for text-on-bright-button (replacing the old `color: var(--bg)` trick), fixed ~14 spots
- [x] Flipped ~25 hardcoded white-on-dark overlays to dark-on-light equivalents
- [x] Found and fixed a contrast bug introduced mid-shift (`.tf-btn.active`)
- [x] Verified end-to-end, zero console errors

---

## Phase 4 — Blueprint Gap Closure, Priority 0: "Wajib sebelum pilot"

Source: `Review.md` §17 (Security and Privacy), §19 (DevOps), §20 (Suggested Priority). These are the items the team's audit marked 🔴 Critical Gap or otherwise required before any pilot. Working through in this order (fast/independent items first, architectural items that many others depend on next):

- [x] **Repository cleanup** — verified already satisfied: no `node_modules`/`.env`/`dev.db` tracked in git, `.gitignore` present, `.env.example` present. No action needed.
- [x] **Restrict CORS** — `backend/src/server.js` now validates `Origin` against `ALLOWED_ORIGINS` (env var, comma-separated); requests with no Origin header (curl, non-browser) pass through since CORS is a browser mechanism. Verified: allowed origin gets `Access-Control-Allow-Origin`, unlisted origin is rejected, real app (8090) unaffected.
- [x] **Rate limiting** — `express-rate-limit` added (`backend/src/middleware/rateLimit.js`): `authLimiter` (20/15min) on register/login/refresh, `codeLimiter` (15/15min) on class-join and parent-link-claim (the review's explicit "join-code attempt limit"/"parent-link code attempt limit" items). Verified: 21st login attempt in a window returns 429.
- [x] **Input validation (schema)** — `zod` added; `backend/src/middleware/validate.js` (`validateBody(schema)`) applied across `auth.js`, `classes.js`, `parentLinks.js`, `profile.js`, `game.js`, replacing ad hoc `if` checks (also closes a real gap: no length limits existed anywhere before, e.g. an unbounded `name` string). Verified: all 12 existing valid flows still pass, 10 invalid-input cases now return clean 400s instead of either being silently accepted or risking a raw 500.
- [x] **Automated test foundation** — `jest` + `supertest` set up (`backend/jest.config.js`, `backend/tests/`), running against an isolated `prisma/test.db` (fresh migrate + seeded `School` per run via `globalSetup`/`globalTeardown`, never touches `dev.db`). `backend/src/server.js` now exports `app` (only binds a real port when run directly) so tests can drive it in-process. Rate limiters skip when `NODE_ENV=test` with a dedicated unit test proving the limiter itself still works. 42 tests across unit (`dailyStreak`, `codes`, `roles`, `rateLimit`) and integration (`auth`, `classes`, `parentLinks`, `game`) — register/login/refresh/me, role access, class create/join/ownership/remove-student, parent claim/list, full game start→answer→finish with a real profile-XP assertion, plus 400-on-bad-input coverage. `npm test`/`npm run test:unit`/`npm run test:integration` all wired. Cross-school access isn't testable yet (only one `School` row exists) — noted inline, will get real coverage once tenant isolation lands next.
- [x] **Tenant isolation** (🔴 Critical Gap, named twice in the audit) — closed the 3 real gaps in `backend/src/routes/classes.js`: `GET /` now filters by `schoolId` too, all 5 ownership checks require `schoolId` match (same 404 either way, no leak), `POST /join` 404s the same for an unknown code and a code valid only in another school. `GuardianStudentRelationship` (parent-child links) deliberately stays unscoped by school — no `schoolId` column exists on that model, families can span schools, and claiming needs the student's own secret code (already rate-limited) rather than being a directory-enumeration surface — documented in a code comment + a pin-test (`tests/integration/parentLinks.test.js`) so it isn't "fixed" by accident. Real cross-tenant test coverage added via `tests/helpers/schools.js`'s `moveToNewSchool()` (updates a `RoleAssignment` in place + re-logs in for a fresh JWT, since `getActiveRoleAssignment()` always resolves the earliest-created row — inserting a second row would've been silently ignored). Sanity-checked by reverting one fix locally and confirming the corresponding test goes red, then re-confirming green.
- [x] **Scope-based permission** (🔴 Critical Gap) — consolidated the 5 duplicated inline ownership checks into `backend/src/middleware/ownership.js` (`requireClassOwnership()` + `requireStudentEnrollment()`), a pure refactor (same 46-test suite green before/after). Deliberately did NOT retrofit `RoleAssignment.scopeType`/`scopeId` onto `Class` — `Class.teacherId` is still a flat single-owner FK with no co-teaching model, so real scope-based permission (per-subject/per-period) is blocked on Academic Foundation (Priority 1: no `Subject`/`CourseOffering`/`TeachingAssignment` models exist yet). `scopeType`/`scopeId` stay reserved-but-unused with a comment explaining why, rather than inventing scope machinery the schema can't support yet.
- [ ] **Session revocation** — refresh tokens are stateless JWTs today, nothing in the DB to revoke; no logout-everywhere, no device list.
- [ ] **Audit log** (🔴 Critical Gap) — no `AuditLog` model, no access-attempt recording anywhere.
- [ ] **Backup and restore** — no documented/scripted backup procedure (dev has been ad hoc `cp dev.db dev.db.bak-*` so far).

## Backlog (Priority 1 and later, per `Review.md` §20 — not yet started)

- **Priority 1 — Academic Foundation**: AcademicYear, Semester, Subject, CourseOffering, TeachingAssignment, StudentEnrollment (formal), Timetable
- **Priority 2 — Attendance Journey**: Teacher schedule, AttendanceSession, attendance input/status, parent visibility, leave request, correction, admin report, parent notification
- **Priority 3 — Assignment Journey**: teacher-created assignment, submission, grading, feedback, parent status view, report
- **Priority 4 — Communication & Parent Action**: Announcement + read receipts, full Parent Action Center (consent, leave approval, controlled messaging, reminders, weekly digest)
- **Priority 5 — Gamification Expansion**: Bee Points ledger, badge rules, teacher appreciation, school mission, class challenge, portfolio
- Full role-switcher UI (one account, multiple active `RoleAssignment`s, context switcher in header)
