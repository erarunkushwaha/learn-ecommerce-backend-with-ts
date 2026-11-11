# Cursor Agent Rules — Backend Interview Lab

## Mission
Build a secure, educational, production-style e-commerce API **incrementally**. It is a reference implementation the learner will later rebuild unaided. Prefer correct, readable code and explicit trade-offs over cleverness or unnecessary abstraction.

## Source of truth (read selectively)
- `docs/PROGRESS.md`: current task, blockers, latest checks. **Read first.**
- `docs/ROADMAP.md`: task scope, dependencies and acceptance criteria. Read only the target task/section.
- `docs/PROJECT.md`: overall requirements and out-of-scope decisions; consult when needed.
- `docs/ARCHITECTURE.md`: structure, layering and integration conventions; consult for code changes.
- `docs/DATABASE.md`: schema, migrations, relations and SQL rules; consult for data changes.
- `docs/DECISIONS.md`: architectural decision records; consult when making related choices.
- `docs/INTERVIEW-CHECKLIST.md`: concepts to demonstrate/teach; consult only relevant section.

## Hard limits
1. Implement **one small roadmap task per Agent session**; never automatically proceed to the next.
2. Make only changes necessary for that task; do not bulk-generate other modules, empty folders or large boilerplate.
3. Inspect only the relevant files and their immediate dependencies. Prefer targeted reads/searches to whole-repository dumps.
4. Preserve established conventions. State a proposed change before modifying foundational design.
5. Avoid `any`, unsafe casts, secrets in source, string-interpolated SQL and silent catch blocks.
6. Use validation, least privilege, parameterized SQL, and safe error responses.
7. Database schema changes require migrations; never rely on destructive `sync({force:true})`.
8. Add focused tests and run applicable scripts. Report **not run/blocked** accurately; never claim verification without evidence.
9. Do not introduce Redis, BullMQ, cloud storage, payment integration or frameworks before their scheduled tasks.
10. At end: update `docs/PROGRESS.md`; mark the roadmap item complete **only when verified**; update DATABASE/ARCHITECTURE/DECISIONS and checklist only when those topics actually changed; finish with short recap and STOP.
11. If a task is blocked, record exact blocker and next action; do **not** falsely complete it.

## Default architecture
Node.js LTS + Express + strict TypeScript + MySQL 8+ + Sequelize + Zod. Feature-oriented modular monolith. Routes -> middleware -> controllers -> services -> repositories -> Sequelize/parameterized raw SQL. Exceptions are allowed when they simplify code; document why. Explicit async error handling. Separate app composition (`app.ts`) from process lifecycle (`server.ts`).

## Teaching notes
For each feature/module, create or update a short `LEARNING.md` in the module or `docs/learning/` covering request flow, reasoning, SQL/Node/TS concepts, security considerations, 5–10 interview Q&As, and a from-scratch exercise. For standalone conceptual labs, add runnable examples under `labs/` only when that lab is the selected task. Do not use app code to demonstrate concepts that are better isolated in experiments.

## Session output
- Task ID and result
- Files touched
- Commands/tests run and outcomes
- Any blocker/known limitation
- Next task ID (do not start it)
