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
- [x] **Session revocation** — done in Phase 6 below (`Session` model, refresh-token rotation, logout/logout-all/device-list).
- [x] **Audit log** — done in Phase 6 below (broadened past the Phase 5 invite/parent-link scope to login, class CRUD, profile changes, exam start/finish).
- [ ] **Backup and restore** — no documented/scripted backup procedure (dev has been ad hoc `cp dev.db dev.db.bak-*` so far).

*(Historical note: the "42 tests" and "46-test suite" mentions above are snapshots from when each bullet was written, not out of sync with each other - the suite kept growing. The current total is stated in the newest phase below; treat earlier counts as point-in-time only.)*

## Phase 5 — Blueprint Gap Closure, Priority 0 Round 2 (`Team_Review.md`)

Source: `Team_Review.md`, a second round of team feedback distinct from `Review.md` — 6 new P0 items, none overlapping with Phase 4 above. Implemented in the review's own requested order:

- [x] **Stored XSS** — added `escapeHtml()` to both `teacher-web/app.js` and `mobile-app/www/game.js`; every `innerHTML` template that interpolates API-sourced student/parent `name`/`avatar` now escapes it. The load-bearing case: a student's `name` rendering unescaped in a *linked parent's* session (`game.js` child chip) — a real cross-account stored-XSS path, now closed.
- [x] **Registration & account provisioning** — public `/auth/register` only accepts `STUDENT`/`PARENT` (`utils/roles.js` `PUBLIC_ROLES`); added a real `ADMIN` role, `backend/src/routes/invites.js` (admin creates a teacher invite → public accept-invite endpoint → auto-login), and `backend/scripts/create-admin.js` for bootstrapping the first admin (no HTTP path, by design). `requireAuth` now re-checks `User.status` from the DB on every request, so a suspended account's existing token stops working immediately instead of at its natural 15-minute expiry. `teacher-web` registration UI replaced with an invite-only accept screen (`?invite=token`) plus a minimal admin panel to generate invite links.
- [x] **Parent-student verification** — `GuardianStudentRelationship.verificationStatus` now defaults to `PENDING`; a parent's claim only becomes `VERIFIED` once the student approves it in their own app (`POST /parent-links/:id/approve`/`reject`, new pending-requests UI in `mobile-app`). The link code itself is now single-use in practice (a successful claim regenerates it) and expires after 7 days (`StudentProfile.linkCodeExpiresAt`). Added unlink (`DELETE /parent-links/:id`, either side) and a student-triggered `regenerate-code` endpoint. Claim/approve/reject/unlink all write to the new `AuditLog`.
- [x] **Game & exam integrity** — `questionCount` is no longer client-controlled (`game.js` `/start` derives it from `shared/gradeConfig.js`'s `NORMAL_QUESTION_COUNT`/`EXAM_QUESTION_COUNT`, ignoring whatever the request body sends). Exam sessions get a real server-side deadline (`GameSession.expiresAt`, set at creation from `getExamDuration(grade)`); `/answer` rejects (410) any answer submitted after it instead of just zeroing the speed bonus, and `/finish` defensively excludes any late-landing answer from scoring.
- [x] **Transaction & idempotency** — `/answer`'s `SessionQuestion` update is now a conditional `updateMany` (`answeredAt: null` in the WHERE clause) instead of read-then-write, closing the double-answer race at the DB level. `/finish` wraps its entire reward path (session status flip, profile XP/level, grade-progress/exam-attempt, achievements) in one `prisma.$transaction`, gated by a conditional `status: 'active'` update — a losing concurrent call gets a clean 409 with nothing written, and the profile is re-read fresh inside the transaction so two different sessions finishing concurrently for the same student can't stomp on each other's XP.
- [x] **Tests** — 19 new cases across `auth`, `parentLinks`, `game`, plus a new `invites.test.js`; a real concurrency test fires two simultaneous `/finish` calls and asserts XP was credited exactly once. 65 tests total, all green.

## Phase 6 — Blueprint Gap Closure, Priority 1/2 (`Review.md` items #7-#12)

Source: `Review.md` was overwritten by the user mid-session with a fresh review; items #1-#6 re-confirmed Phase 5's work (already done), items #7-#12 plus an explicit test checklist were new. User decision going in: refresh-token cookie migration (#12) applies to `teacher-web` only — `mobile-app` is a Capacitor/Android WebView on a different origin than the API with no HTTPS in dev, where httpOnly cookies don't work cleanly; it keeps `localStorage`.

- [x] **Session storage & revocation (#7)** — new `Session` model (`backend/prisma/schema.prisma`), its id embedded as the refresh JWT's `jti`. `/auth/refresh` now **rotates**: the old session is revoked and a new one issued on every call, so a stolen-then-reused refresh token only works once. New `POST /auth/logout` (idempotent, accepts an expired token), `POST /auth/logout-all` (all devices), `GET /auth/sessions` (device list). Hit a real bug during this: `utils/sessions.js`'s `createSession()` used the top-level `prisma` client even when called from inside `/auth/refresh`'s `$transaction` callback — on SQLite that's a guaranteed deadlock (the outer transaction's write lock never releases while waiting on a second connection for the same lock). Fixed by threading the transaction client (`tx`) through; caught it because the full suite hung instead of finishing in ~5s.
- [x] **Role-assignment validity (#8)** — `getActiveRoleAssignment()` previously grabbed the earliest `RoleAssignment` regardless of `validUntil`. Now filters `validFrom <= now AND (validUntil IS NULL OR validUntil > now)` and returns `null` instead of throwing; every call site (`auth.js` login/refresh/me) treats `null` as 401. The "let a user explicitly pick their active role" half of the review's ask stays out of scope - still one assignment per user today, tracked separately under the existing "Full role-switcher UI" backlog item below.
- [x] **Cookie-based refresh token for teacher-web (#12)** — `backend/src/utils/refreshCookie.js` (httpOnly, `SameSite=Lax`, `Secure` in production only, `Path=/api/auth`). `/auth/refresh` reads the cookie first, falls back to the request body (mobile-app). `teacher-web/app.js` no longer stores a refresh token client-side at all - only the access token lives in `localStorage`; `Api.request()` sends `credentials:'include'`. `mobile-app` untouched (never sends `credentials:'include'`, so the cookie is simply invisible to it).
- [x] **Audit log broadening (#9)** — `logAction()` calls added to `auth.js` (login success/fail, registration), `classes.js` (create/update/delete, student removed, join - capturing enrollment ids that were previously discarded before this), `profile.js` (profile updates), `game.js` (exam start/finish only, not every regular play session).
- [x] **API URL configuration (#10)** — `teacher-web/config.js` and `mobile-app/www/config.js`, loaded before the main script; both apps read their API base from `window.BEE_BOX_API_BASE`/`window.BEE_BOX_API_HOSTS` instead of a hardcoded `localhost` string. Swap the `config.js` file per deployment target.
- [x] **Security headers (#11)** — `helmet` added to `backend/src/server.js` with a CSP allowlisting the actual external resources both frontends load (`fonts.googleapis.com`/`fonts.gstatic.com`, `cdnjs.cloudflare.com` for Font Awesome, `cdn.jsdelivr.net` for mobile-app's Chart.js/canvas-confetti).
- [x] **Missing tests from the review's checklist** — extracted the duplicated `escapeHtml()` into `shared/escapeHtml.js` (dual CommonJS/browser-global export) with a real unit test (`backend/tests/unit/escapeHtml.test.js`) proving `<script>`/`onerror=`/quote-breakout payloads come back neutralized; `teacher-web` loads it via a **local copy** (`teacher-web/escapeHtml.js`, not a `../shared/` reference - caught via Playwright that a `../` path 404s once teacher-web is served as its own static-site root, not from the monorepo checkout) - `mobile-app` keeps its own inline copy for the same reason (Capacitor's `webDir` only packages `mobile-app/www/`). Added: expired-`RoleAssignment` test, refresh-rotation-invalidates-old-token test, logout/logout-all tests, sequential duplicate-answer and duplicate-finish tests (the existing concurrent-`Promise.all` finish test covers the race; these cover the simpler "just call it twice" case the review listed separately).
- **Current test count: 77**, all green (`npm test`, run 3x in a row while chasing the deadlock above to confirm stability).
- Verified end-to-end via Playwright against a real Chromium: teacher-web login → cookie inspection (httpOnly, present) → page reload (session persists) → logout (cookie cleared server-side, not just forgotten client-side - confirmed a post-logout reload does *not* silently restore the session) → zero console errors. `mobile-app` smoke-tested unaffected (config.js resolves correctly, register/login through the real API still works).

## Phase 7 — Implementation-review findings (`Review.md`, round 3)

Source: after Phase 6 landed, the review team re-audited the *implementation* itself (not sync/push, which they confirmed was fine) and found 7 real bypasses still reachable through the same code paths Phase 5/6 hardened. All 7 confirmed against the actual code before fixing, not taken at face value:

- [x] **Exam mode skipped all progression gating (#1/#2)** — `isExam:true` previously skipped the grade-unlock *and* sub-level-lock checks entirely (both were inside a single `if(!isExam)` block), so a client could "unlock" any locked sub-level just by claiming exam mode. Exams now get their own eligibility rule in `game.js` `/start`: `grade` must be within the student's own grade ±1 band (the same band `GET /profile/exams` already exposes), and `subLevel` is pinned to `1` server-side for exams regardless of what the client sends (the client already only ever sends `1` for exams; this just stops a tampered value from doing anything).
- [x] **Self-service grade change (#3)** — `PATCH /profile/me` used to union `unlockedGrades` up to whatever `grade` the student sent, so setting `grade:9` instantly "unlocked" every grade with zero real progress. `grade` is no longer in `patchProfileSchema` at all (silently ignored, not a self-service field); `mobile-app`'s settings grade dropdown is now `disabled` with a tooltip explaining why.
- [x] **Finish without answering everything (#4)** — a session could be started and immediately finished with 0-1 real answers, and `gradeProgress.done` was still granted (letting 5 empty attempts unlock the next grade). `/finish` now requires every question to have `answeredAt` set before granting sub-level completion credit or the next-grade-unlock check; partial/early finishes still succeed and still score whatever was actually answered, they just don't count toward progression. Exams are deliberately exempt from this specific gate - a real exam that legitimately runs out of total time with a few questions unanswered is expected, not a bypass, and exams don't unlock anything further anyway.
- [x] **Parent-claim / invite-accept races (#5)** — two concurrent claims on the same still-valid link code, or two concurrent accepts of the same invite token, could both read "not yet used" before either committed. Both now use the same conditional-`updateMany` compare-and-swap pattern already established in `game.js` (Phase 5): the code/invite is atomically "consumed" first, and a losing concurrent request gets a clean 409/410 instead of a race.
- [x] **RoleAssignment not re-checked per-request (#6)** — `requireAuth` previously only re-checked `User.status`; the specific `RoleAssignment` embedded in the access token (`payload.raid`) was trusted for its full 15-minute lifetime even if revoked/expired in the meantime. `requireAuth` now looks that assignment up by id on every request (replacing, not adding to, the old `User` query - same cost, more correct) and checks `validFrom`/`validUntil` there too.
- [x] **No CSP on the static frontends (#7)** — `helmet`'s CSP (Phase 6) only covers responses the Express API itself serves; `teacher-web`/`mobile-app` are separate static sites it never touches. Added a `<meta http-equiv="Content-Security-Policy">` to both `index.html`s as the portable fallback, allowlisting the same external origins as the backend's CSP. Two honest limitations documented inline: `frame-ancestors` is silently ignored inside a `<meta>` tag (only a real HTTP header from whatever static host this eventually deploys to can set it), and `style-src` needed `'unsafe-inline'` because both apps have `style="..."` attributes throughout (a CSS-injection risk, not script-execution - `script-src` has no such exception since neither app has any inline `<script>` or `on*=` handler).
- [x] **Tests** — 10 new cases: exam grade-band rejection, exam-with-locked-sublevel-value now allowed (sub-level is pinned, not blocked), grade-change-ignored, finish-without-full-completion grants no credit, concurrent parent-claim race (only one of two wins), concurrent invite-accept race (only one of two wins), RoleAssignment re-validation on a non-auth route, plus a CSP-meta-tag presence smoke test for each frontend.
- **Current test count: 87**, all green, run 3x in a row to confirm the new concurrency tests aren't flaky.
- Verified end-to-end via Playwright: both frontends load with the new CSP `<meta>` tag and zero console errors (fonts/Font Awesome/Chart.js/canvas-confetti all still load correctly under the tightened policy).

## Backlog (Priority 1 and later, per `Review.md` §20 — not yet started)

- **Priority 1 — Academic Foundation**: AcademicYear, Semester, Subject, CourseOffering, TeachingAssignment, StudentEnrollment (formal), Timetable
- **Priority 2 — Attendance Journey**: Teacher schedule, AttendanceSession, attendance input/status, parent visibility, leave request, correction, admin report, parent notification
- **Priority 3 — Assignment Journey**: teacher-created assignment, submission, grading, feedback, parent status view, report
- **Priority 4 — Communication & Parent Action**: Announcement + read receipts, full Parent Action Center (consent, leave approval, controlled messaging, reminders, weekly digest)
- **Priority 5 — Gamification Expansion**: Bee Points ledger, badge rules, teacher appreciation, school mission, class challenge, portfolio
- Full role-switcher UI (one account, multiple active `RoleAssignment`s, context switcher in header)
