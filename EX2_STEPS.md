# Exercise 2 - Club Events quick steps

1. Open your existing Exercise 1 GitHub repository in Codespaces.
2. Upload `ex2-club-events.zip` to the repository root (keep `mcp-server/`).
3. In the terminal, run `unzip -o ex2-club-events.zip` and `node setup-ex2.mjs`.
4. Run `npm install`.
5. Create a local demo password without committing it:
   `read -rs -p 'Choose demo password (8+ characters): ' SEED_PASSWORD; echo; export SEED_PASSWORD; npm run setup; unset SEED_PASSWORD`
6. Run `npm test` (expected: 5 passing tests).
7. Run `npm start` in the first terminal. Open forwarded port 3000. Sign in with `student@example.test` and your chosen password.
8. In a new terminal run `curl -i http://localhost:3000/events` (expected 302 redirect) and `curl -i http://localhost:3000/api/events` (expected 401).
9. In the second terminal run `node scripts/db.mjs list`, `node scripts/db.mjs delete 2`. Refresh the events page: event 2 is gone. Run `node scripts/db.mjs restore 2` and refresh again.
10. Run `node checks/ex2.mjs` in the repository root. All checks must say `ok`. If the MCP script fails, finish/fix Exercise 1's MCP server.
11. Review `SPEC.md`, `AGENTS.md`, `AGENT_LOG.md`, `USAGE.md` and `docs/AGENT_NOTES.md`. The course CLI was unavailable; its usage statistics remain unrecorded.
12. Remove the uploaded zip from the repository root with `rm ex2-club-events.zip`. Run `git add -A`, `git commit -m 'Exercise 2: spec and slice 1'`, and `git push`.
13. Show your work to your course assistant, including the browser, self-check output and completed agent workflow notes.

Note: Google OAuth, model calls and future project MCP tools are planned in the spec, not implemented in slice 1. No Gemini API key is needed for this exercise.
