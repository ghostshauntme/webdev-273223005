# Agent log

## 2026-10-27 - Planning and slice 1 implementation
- Goal: implement the SPEC.md slice 1, AC-9 through AC-11.
- Work completed: review the requirements, prepare the implementation plan, create the SQLite-backed sign-in and events list, and add automated tests.
- Checkpoints: reviewed the plan against non-goals; verified persistent SQLite tables; tested signed-out redirects and deletion reflected in the list. Browser verification in Codespaces remains to be completed by the student.
- Gap discovered: the initial acceptance criterion did not specify the order of upcoming events.
- Updated: AC-10 now requires chronological order; SQL uses date ordering and the test asserts it.
- Usage: the course CLI was unavailable, so no CLI session statistics are available.

## 2026-11-24–25 - Exercise 3 implementation

- Goal: implement AC-1 through AC-8 from SPEC.md.
- Reviewed and approved plan: database migration, registration service, HTTP API, browser UI, organizer event creation, Google OAuth, Gemini poster suggestions, MCP tools, testing and documentation.
- The student approved the plan before implementation and reviewed staged changes at each checkpoint.
- Separate approval was given for authentication changes, Google configuration, Gemini integration and the three project MCP tools.
- Unexpected changes: corrected .gitignore to track src/data, changed date formatting and removed raw MCP request logging.
- The existing registrations table required a timestamp and index migration rather than a new table.
- Mutation test: disabling the capacity rule caused three tests to fail. Restoring the rule made the tests pass again.
- Results: 56 passing tests, 100% service line, branch and function coverage, and 18/18 Exercise 3 checks.
- Additional coverage tests were implemented because the existing CI workflow already enforces coverage thresholds.
- Google and Gemini were tested using simulated provider responses, not live credentials.
- Manual verification and remote CI verification remain pending.

### Manual verification - 2026-11-25
- Browser: sign-in, upcoming events, reservation, cancellation, available places and logout verified successfully.
- curl: unauthorized request 401, registration 201, full event 409, cancellation by another user 403, own cancellation 200.
- All five manual API checks passed using an isolated in-memory database.
- Remote CI verification remains pending.

## 2026-11-25 — Exercise 4

- Добавлены публичный `/health`, проверка конфигурации старта, Dockerfile, настройка Render и тесты развёртывания.
- Проверены HTTP-обработчик на SQLite в памяти, отказы старта при неверной конфигурации, ограничения доступа, cookie и заголовки. Логика состояний списка проверена с тестовыми DOM и fetch.
- Exercise 4 дал 26/29 в копии без секретов. Ожидаются браузерные доказательства и адрес Render. Полные прогоны тестов и покрытия блокирует TCP bind с `EPERM`. Docker socket недоступен.
- Команды и ручные сценарии записаны в `READINESS.md`.

### Повторная проверка Exercise 4

- Обработчик JSON ограничивает размер в байтах, принимает объект и возвращает HTTP 400 для `null` и слишком большого тела. Добавлены проверки диагностики недоступной БД и ответов HTTP.
- На потоке HTTP/1.1 в памяти подтверждены `/health`, 302, 401, 404 и 400. Пять некорректных конфигураций дали код 1 при прямом запуске сервера.
- Штатные тесты и coverage снова упёрлись в ограничения среды. Результат Exercise 4 и точные шаги проверки Render и UI записаны в `READINESS.md`.
