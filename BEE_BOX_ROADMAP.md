# Bee Box Roadmap — MathQuest → Bee Box alignment

## Phase 3 — Visual rebrand + Home "Today" restructure ✅ DONE (2026-08-01)

- [x] Full color palette rebrand ("Full Bee": black background + amber/gold accents) in `style.css` and `teacher-web/style.css`, including ~40+ hardcoded rgba/hex spots and Chart.js/canvas colors in `game.js`
- [x] Brand text/logo swap MathQuest → Bee Box, 🧠 → 🐝, across `index.html` and `teacher-web/index.html`
- [x] Android native project renamed `com.mathquest.app` → `com.beebox.app` (capacitor.config.json, build.gradle, strings.xml, MainActivity.java + package folder move)
- [x] Backend: `GET /profile/me` now exposes `lastPlayedDate`/`playedToday` and real achievement-unlock timestamps (previously silently dropped — a prerequisite for the new Home screen)
- [x] Student Home screen restructured to the blueprint's "Today" pattern: **Perlu Dikerjakan** (real computed action cards - continue next sub-level / daily challenge), **Akan Datang** (honest "Segera Hadir" placeholders for Attendance/Assignment, no fake data), **Aktivitas Terbaru** (merged real session + achievement history), **Peta Petualangan** (existing level map, repositioned as Progress)
- [x] Bonus fix: `.h-item`/`.h-badge`/`.h-info`/`.h-score`/`.empty-msg` had zero CSS anywhere in the codebase (pre-existing gap, not introduced by this phase) — now styled, fixing the Riwayat tab and Parent Home activity list too
- [x] Verified end-to-end via headless Chromium: backend fields, visual theme across student/parent/teacher-web surfaces, new Home sections, full student + parent regression flows — zero console errors
  - Not verified: real Android build/emulator (no Java/Android SDK in this environment — `cap sync android` completed clean, same limitation noted in Phase 2)

## Phase 3.1 — Home redesign: menu grid instead of "Today" pattern ✅ DONE (2026-08-01)

User explicitly chose a PLN Mobile-style menu-grid Home over the blueprint's own "Today" decision (Keputusan 2) after seeing it built — a deliberate override, not an oversight. Replaces Phase 3's Need Action/Upcoming/Recent Updates/Progress layout entirely.

- [x] Header banner: greeting + notification bell (real unread indicator) + avatar button (opens the existing quick-edit modal) + XP/Streak/Grade stat pills
- [x] Primary grid (4 tiles → real distinct screens): Belajar (new `#learnScreen`, hosts the level map moved out of Home), Ujian, Progress (Analytics), Profil
- [x] Secondary grid (4 tiles → real distinct actions): Main Cepat, Tantangan Harian, Prestasi (→ Profil, scrolls to achievements), Gabung Kelas (→ Profil, scrolls to join-class row)
- [x] "Pemberitahuan" — same real-signal computation as the old Need Action (continue-level / daily-challenge reminders) plus the most recently unlocked achievement, merged into one notification feed
- [x] "Undangan" — real feature surfaced on Home instead of buried in Profil settings: the student's own parent-link code with an invite framing
- [x] Verified end-to-end via headless Chromium: Home loads, Belajar→learnScreen→back works, tile navigation to Profil/Analytics correct, scroll-to-section on Prestasi/Gabung Kelas tiles works, invite code matches real data, avatar button still opens the edit modal — zero console errors

## Phase 3.2 — Calmer/brighter palette (cream, not black) ✅ DONE (2026-08-01)

User felt the "Full Bee" black+amber theme was too intense; asked for a brighter, calmer background. Replaced the black palette with a warm honey-cream theme, same amber/gold accent family. Applies to `style.css`, `teacher-web/style.css`, and chart/particle colors in `game.js`.

- [x] `--bg`/`--bg2` → soft cream/ivory (`#FDF6E9`/`#F3E6C8`); `--text` → dark warm brown (was white); `--neon`/`--neonB`/`--neonY`/`--neonO` deepened so they stay readable as text on a light background (bright colors that worked on black read as washed-out on cream)
- [x] Added `--onAccent` (`#2B1B00`) — a dedicated dark color for text sitting on top of bright accent buttons/badges, replacing the old `color: var(--bg)` trick that only worked when the page background was dark (~14 spots fixed in `style.css`, same pattern in `teacher-web/style.css`)
- [x] Flipped ~25 hardcoded white-on-dark overlays (progress-bar tracks, input field backgrounds, card borders, top-bar/bottom-nav translucency, particle color, Chart.js tick/legend colors) to dark-on-light equivalents — these don't auto-follow CSS variables and needed individual fixes
- [x] Found and fixed one real contrast bug introduced by the palette shift mid-way (`.tf-btn.active` paired the new, now-dark `--neonB` with dark text — swapped to `--neon`)
- [x] Verified end-to-end via headless Chromium across student Home/Learn/Analytics/Profile, Parent Home, and teacher-web login — zero console errors, body background/text colors confirmed via computed style


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
