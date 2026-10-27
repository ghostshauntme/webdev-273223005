# Club Events - Student Clubs

## Project option
Club events.

## Goals
- Members sign in and browse upcoming club events with dates and available places.
- Members can reserve or cancel a place, and organizers can manage events and registrations.
- The same account will eventually support local password and verified Google sign-in.

## Non-goals
- No payments or ticket purchases: every event is free.
- No email, SMS or push notifications: members check the website.
- No native Android or iOS application: the web interface works on mobile.
- No public self-registration in slice 1: use an account created during setup.

## Constraints
- Node.js 22 built-in HTTP server and SQLite, with plain HTML, CSS and JavaScript.
- Passwords are saved as salted scrypt hashes and never saved as readable text.
- HTTP routes and future MCP tools must share business services; SQL stays in `src/data/`.
- Session cookies are HttpOnly and SameSite=Lax; the event list is unavailable without a session.
- No real model or OAuth credentials are committed to Git.

## The model feature
- Model: Gemini 2.5 Flash (planned for Exercise 3+), isolated in `src/services/poster.mjs` when implemented.
- Input: an organizer-uploaded event-poster image, without any member account data.
- Output: a proposed event title, date and location that an organizer reviews before saving.
- When it fails: on timeout, missing `GEMINI_API_KEY`, 429, or invalid output, show an empty manual-entry form and the message "Automatic suggestions unavailable; enter event details manually." No data is saved automatically. This feature is not built in slice 1.

## Auth
- Local: email and password, salted scrypt hash, and a secure random session in an HttpOnly cookie.
- Provider: Google OAuth 2.0 authorization-code flow with state and PKCE (planned for Exercise 3+).
- Linking: an authenticated user may link a Google account; an email is matched only when Google confirms it is verified and the account linking is explicitly confirmed. Both methods lead to one user record.

## MCP tools
| Tool | What it does | Who may call it |
| --- | --- | --- |
| `upcoming_events` | Returns upcoming club events with free-place counts from the database | signed-in member or organizer |
| `my_registrations` | Lists registrations belonging to the authenticated account only | the authenticated account owner |
| `register_for_event` | Reserves a place when capacity permits and rejects fully booked events | the authenticated account owner |

## UI
Plain HTML, CSS and client-side JavaScript. Planned screens: local/Google sign-in, upcoming event list, event detail and registration screen, organizer event management. Each screen needs loading, empty, error and success states. Only sign-in and the database-backed event list are implemented in slice 1. See `docs/UI.md` for the future checklist.

## Architecture
Slice 1 requests travel from `src/routes/http.mjs` to `src/services/auth.mjs` or `src/services/events.mjs`, then to SQL in `src/data/db.mjs`. Future MCP tools must call the same services. The Google provider and poster model are designed but intentionally not implemented in Exercise 2.

## Acceptance criteria
- [AC-1] A signed-in member opening the events list sees only future events sorted by date, with available places displayed.
- [AC-2] A member reserving a free place sees a confirmation, and a registration row appears in the database.
- [AC-3] A member trying to reserve a full event receives HTTP 409 and sees "This event is full"; no new registration appears.
- [AC-4] A member cancelling their own reservation sees the place become available again, while another member's reservation remains unchanged.
- [AC-5] An organizer creating a valid event sees it on the events list; an ordinary member attempting the same operation receives HTTP 403.
- [AC-6] A user who links a verified Google identity to their existing local account signs in to the same user id and no duplicate account is created.
- [AC-7] An organizer using poster suggestions with no model key sees "Automatic suggestions unavailable; enter event details manually" and can still fill in the form themselves.
- [AC-8] The MCP tool `register_for_event` uses the same capacity rule as the HTTP API and refuses a full event without inserting a registration.

### Slice 1: sign-in and the upcoming events list
- [AC-9] A visitor opening `/events` without signing in is redirected with HTTP 302 to `/login`; `/api/events` returns HTTP 401 without a session.
- [AC-10] After signing in with the seeded student account, `/events` lists the three seeded upcoming events, ordered by date, with each title, date and free-place count.
- [AC-11] Deleting one of the three event rows from SQLite and refreshing `/events` removes exactly that event without changing the other two.

## Traceability
| Criterion | Test |
| --- | --- |
| AC-1 | Planned full-feature test in Exercise 3 |
| AC-2 to AC-8 | Planned full-feature tests in Exercises 3-5 |
| AC-9 | `test/slice1.test.mjs`: redirect and unauthorized API |
| AC-10 | `test/slice1.test.mjs`: seeded sign-in and sorted list |
| AC-11 | `test/slice1.test.mjs`: database deletion reflected in API |

## Spec vs result
- Passed in local automated verification: AC-9, AC-10 and AC-11. The list is loaded from a real SQLite table and a session is required.
- Gap in the initial requirement: it specified three upcoming rows but did not state which order to show them in.
- Changed in this spec: AC-10 now explicitly requires date ordering. `src/data/db.mjs` sorts by event date, and the AC-10 test checks that ordering.
- The student must still open the actual Codespace browser and perform the manual clicks before requesting the teaching assistant's approval.
