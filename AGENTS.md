# Instructions for the agent

Read this file at the start of every session. See `SPEC.md` for the project contract.

## Project
Club Events helps students view upcoming student-club activities and, later, register for places. Slice 1 includes local sign-in and a database-backed upcoming-events list.

## Commands
- Install: `npm install`
- Run: `npm start` (visit the forwarded port 3000)
- Test: `npm test`
- Coverage: `npm test` (the Exercise 3 coverage gate will be added later)
- MCP server: `npm run mcp` (retains the Exercise 1 MCP server)

## Conventions
- HTTP routing lives in `src/routes/`, business logic in `src/services/`, and database access with SQL only in `src/data/`.
- The UI lives in `public/`; use 401 for API authorization errors, 302 for protected HTML pages, and JSON for API responses.
- Do not implement full registrations, Google OAuth, or the model feature during Exercise 2.

## Layers
- HTTP route handler: `src/routes/http.mjs`
- Service layer: `src/services/`
- Data access: `src/data/db.mjs`
- MCP tools: `mcp-server/` (Exercise 1) now; future project tools call the same service functions as HTTP.

## The model feature
- The planned provider is Gemini 2.5 Flash, and the future single call site will be `src/services/poster.mjs`.
- Read `GEMINI_API_KEY` only from the environment; do not use a model in slice 1.
- Time out external calls and provide a manual-entry fallback without saving guesses.
- Test model behavior using a fake client rather than a real API.

## The MCP server
- Lives in `mcp-server/`, grown out of Exercise 1.
- Every future project tool must call a service function, never the database directly.
- It carries an authenticated user and applies the HTTP API's authorization rules.
- When adding a project tool, also update the MCP table in `SPEC.md`.

## Tests and coverage
- Test titles name acceptance criteria, such as AC-9, AC-10 and AC-11.
- Exercise 3 adds full coverage and traceability; do not weaken tests to hide faults.

## Always ask before
- deleting files or folders
- editing a migration that has already run
- installing or removing dependencies
- pushing, tagging or changing CI
- anything that touches secrets or `.env`
- changing an authentication or authorization rule
- adding, renaming or removing an MCP tool
- changing a coverage threshold
- sending user data to a third-party model

## Never
- commit secrets, passwords, API keys or an OAuth client secret
- weaken or delete a test to make it pass
- lower a coverage threshold or switch off a CI job to make the build green
- add an MCP tool that reaches past the service layer
- log a prompt that contains somebody's personal data
