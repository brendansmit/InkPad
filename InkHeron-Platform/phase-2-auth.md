# Phase 2 — Identity & auth

The platform owns identity. Etherpad is handed students by the platform, never authenticates
them itself. Hashed passwords only; teacher-reset is the only recovery. See CLAUDE.md §3 rule 3.

---

## Step 2.1 — Classes + students tables usable
- **Goal:** create classes and students.
- **Depends on:** Phase 1.7.
- **Build:** CRUD for classes and students using the canonical schema. Passwords stored as a
  strong hash (bcrypt/argon2). `must_change_password` defaults false; set true after a reset.
- **Done when:** a class and a few students can be created; password is stored only as a hash
  (verify the DB never holds plaintext).

## Step 2.2 — Student login
- **Goal:** students sign in.
- **Depends on:** 2.1, and the existing student login mockup.
- **Build:** `POST /login` verifies username + password against the hash, creates a session
  (signed httpOnly cookie). Wire the existing login screen. On `must_change_password`, force a
  change-password step before the dashboard.
- **Done when:** a student logs in, gets a session, lands on the dashboard; wrong password fails;
  a reset-flagged student is forced to set a new password first.

## Step 2.3 — Student self-change password
- **Goal:** students can change their own password while logged in.
- **Depends on:** 2.2.
- **Build:** A change-password form (current + new), re-hash, clear `must_change_password`.
- **Done when:** a logged-in student changes their password and can log in with the new one.

## Step 2.4 — Teacher login (admin)
- **Goal:** teacher signs into the admin/teacher side.
- **Depends on:** 2.1.
- **Build:** Separate teacher auth (the teacher row from Phase 1.7). Session-based. Teacher
  routes are guarded so no student session can reach them.
- **Done when:** teacher logs in to the teacher dashboard; a student session is rejected from
  teacher routes.

## Step 2.5 — Teacher password reset for students (the only recovery path)
- **Goal:** teacher resets a locked-out student.
- **Depends on:** 2.1, 2.4. NO password reveal — reset only (CLAUDE.md rule 3).
- **Build:** In the teacher roster, a "Reset password" action sets a new temporary password
  (system-generated or teacher-entered), hashes it, sets `must_change_password = true`, and shows
  the temporary password ONCE to the teacher to read to the student. The teacher never sees the
  student's previous password (it isn't stored).
- **Done when:** teacher resets a student, reads them the temp password, student logs in and is
  forced to change it. Confirm no endpoint ever returns a stored plaintext or existing password.

## Step 2.6 — Sessions, logout, guards
- **Goal:** clean session lifecycle.
- **Depends on:** 2.2, 2.4.
- **Build:** Logout clears the session. Session expiry. Route guards: student routes require a
  student session, teacher routes a teacher session. CSRF protection on state-changing posts.
- **Done when:** logout works; expired/missing sessions redirect to login; guards hold.

---

**Exit check for Phase 2:** students and teacher can log in to their correct sides, students can
change their own password, teacher can reset (not reveal) a student password, sessions are secure.
Passwords exist only as hashes. Log in SESSION_NOTES.md, move to Phase 3.
