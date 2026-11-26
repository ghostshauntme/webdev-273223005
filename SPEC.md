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
- Node.js 22 built-in HTTP server, SQLite for local development and tests, and PostgreSQL for production. The UI uses plain HTML, CSS and JavaScript.
- HTTP, MCP and account setup use PostgreSQL when `DATABASE_URL` is set. With `NODE_ENV=production`, the URL is required. PostgreSQL startup applies the existing schema and seeds the initial events once.
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
The UI uses plain HTML, CSS and client-side JavaScript. Slice 1 introduced local sign-in and a database-backed event list. The list now supports booking and cancellation on event cards, and organizers have event creation and poster suggestion controls. Each screen needs loading, empty, error and success states. The [UI checklist](docs/UI.md) records which cases were verified and links the Exercise 4 screenshots.

## Architecture
- The browser sends a POST request from `public/app.js` to `/api/events/:id/register`.
- The HTTP route in `src/routes/http.mjs` checks the current user through `src/services/auth.mjs`.
- The registration service in `src/services/registrations.mjs` checks event capacity and existing registrations.
- Registration SQL runs in `src/data/` inside a transaction. PostgreSQL locks the event row before checking capacity. SQLite serializes write transactions on the connection.
- A successful registration returns HTTP 201. A full event returns HTTP 409 without inserting a registration.
- The MCP server calls the same registration service as the HTTP API.
- The registrations table already existed after Exercise 2, so migration 001 added a timestamp and an index instead of creating a new table.

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
| AC-1 | `test/mcp-project.test.mjs`, `test/slice1.test.mjs` |
| AC-2 | `test/registrations.test.mjs`, `test/registrations-api.test.mjs` |
| AC-3 | `test/registrations.test.mjs`, `test/registrations-api.test.mjs` |
| AC-4 | `test/registrations.test.mjs`, `test/registrations-api.test.mjs` |
| AC-5 | `test/events.test.mjs` |
| AC-6 | `test/google-auth.test.mjs`, `test/google-flow-coverage.test.mjs` |
| AC-7 | `test/poster.test.mjs`, `test/poster-api.test.mjs` |
| AC-8 | `test/mcp-project.test.mjs` |
| AC-9 | `test/slice1.test.mjs`: redirect and unauthorized API |
| AC-10 | `test/slice1.test.mjs`: seeded sign-in and sorted list |
| AC-11 | `test/slice1.test.mjs`: database deletion reflected in API |

## Spec vs result
- Passed in local automated verification: AC-9, AC-10 and AC-11. The list is loaded from a real SQLite table and a session is required.
- Gap in the initial requirement: it specified three upcoming rows but did not state which order to show them in.
- Changed in this spec: AC-10 now explicitly requires date ordering. `src/data/db.mjs` sorts by event date, and the AC-10 test checks that ordering.
- Exercise 4 manual checks on Render covered password sign-in, reserving and cancelling a place, and data persistence after redeployment. The [readiness report](READINESS.md) records the deployment evidence and outstanding production checks.
