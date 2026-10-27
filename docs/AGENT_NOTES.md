# Agent workflow notes - Exercise 2

Prepared planning, review, and implementation notes for the Exercise 2 agent steps. This document is not a CLI transcript.

## Step 1 - project-choice questions and answers
1. Whose needs do you understand? Students attending club events.
2. What should they find quickly? Upcoming events and available places.
3. Who controls the content? Club organizers.
4. Is payment required? No.
5. Which scope is easiest to verify? Sign-in plus upcoming-events list.

Decision: Club events.

## Step 2 - non-goals critique
- Payments, notifications, native apps and public registration are concrete exclusions.
- Do not let a coding agent add a ticket checkout, email service or sign-up page to slice 1.

## Step 3 - goals and constraints critique
- No goal contradicts a non-goal: registration is planned for the whole course, not built in slice 1.
- Node 22, built-in HTTP and SQLite run in the course Codespace.
- Hash storage and protected pages are verifiable through the database and curl.

## Step 4 - acceptance-criteria critique
- AC-1 through AC-11 name actors, actions and observable results.
- AC-9, AC-10 and AC-11 can each be verified with one browser action or command.
- AC-10 needed an ordering requirement; it was changed to say sorted by date.

## Step 5 - model, auth, MCP and UI critique
- Model timeout, unavailable key, HTTP 429 and invalid output all use manual-entry fallback.
- Password sign-in is present now; Google linking is scoped to a later exercise.
- Three future MCP project tools each have a description explaining when to invoke them.
- Screens and four future UI states are named in SPEC.md.

## Step 6 - instruction review
The Always ask before list says:
- deleting files or folders
- editing a migration that has already run
- installing or removing dependencies
- pushing, tagging or changing CI
- anything that touches secrets or `.env`
- changing an authentication or authorization rule
- adding, renaming or removing an MCP tool
- changing a coverage threshold
- sending user data to a third-party model

Commands: install `npm install`, run `npm start`, test `npm test`, MCP server `npm run mcp`.

## Step 7 - implementation plan
- Tables: `users`, `clubs`, `events`, `registrations`, `sessions`, `app_meta` in SQLite.
- API endpoints: `POST /api/login`, `POST /api/logout`, `GET /api/events`.
- Pages: `/login`, `/events`; `/events` redirects unauthenticated visitors.
- Files: `src/data/db.mjs`, `src/services/auth.mjs`, `src/services/events.mjs`, `src/routes/http.mjs`, `src/server.mjs`, `public/*`, `scripts/*`, `test/slice1.test.mjs`.
- AC-9: protected `/events` and `/api/events`.
- AC-10: seeded student account and three future events in the rendered list.
- AC-11: SQLite deletion changes the data returned and shown after reload.
- Not included: registration workflow, Google login, poster model integration, new MCP tools, payments or notifications.
- Plan refinement: show the events in chronological order.

## Step 8 - database commands
- List current database rows: `node scripts/db.mjs list`.
- Delete one event: `node scripts/db.mjs delete 2`.
- Restore that event: `node scripts/db.mjs restore 2`.
- Test unauthorized access: `curl -i http://localhost:3000/events` and `curl -i http://localhost:3000/api/events`.

## Step 9 - criteria verification
- AC-9: open `/events` in a private window and check for `/login`; check API returns 401.
- AC-10: sign in with the local seeded account, open `/events`, check three dated and sorted rows.
- AC-11: delete event 2, reload `/events`, check it disappears; restore it afterwards.

## Step 10 - usage notes
The course CLI was unavailable, so session token metrics were not recorded. See `AGENT_LOG.md` and `USAGE.md`.
