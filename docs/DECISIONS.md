# Architecture Decision Records

This log distinguishes **proposed defaults** from **approved implementation choices**. Add a dated ADR for material decisions instead of rewriting history.

## Proposed defaults (not yet approved by running code)
- Modular monolith, not microservices.
- Feature-based modules and an HTTP/controller/service/repository separation where useful.
- MySQL 8+/InnoDB, Sequelize migrations, parameterized raw SQL.
- Access JWT plus short-lived, rotating, hashed server-stored refresh tokens.
- Mock payment provider first; Redis/jobs only in later phases.

## ADR template
### ADR-000: Title
- **Status:** Proposed | Accepted | Superseded
- **Context:** What problem/constraints prompted choice?
- **Decision:** What will we do?
- **Alternatives:** What else was considered?
- **Consequences:** Pros, cons, security/performance trade-offs
- **Related task:** ID
- **Date:** YYYY-MM-DD

## Accepted decisions

### ADR-001: Use ECMAScript modules
- **Status:** Accepted
- **Context:** The stack requires a supported Node.js LTS and an early ESM or CommonJS choice. Node 22.12.0 is the verified runtime. Later tasks add Express, but the module format has to be fixed before the first compiled file.
- **Decision:** `"type": "module"` in `package.json`. TypeScript uses `module` and `moduleResolution` set to `NodeNext`. Relative imports in TypeScript must use the runtime `.js` extension.
- **Alternatives:** CommonJS (`"type"` omitted, `module: CommonJS`) matches older Express examples and needs no extensions. It fights Node's current default and makes a later migration touch every import.
- **Consequences:** Native `import`/`export` and top-level await stay available. Tooling must be ESM-aware. `require` is not the app's module loader. The module cache is still one evaluation per URL per process; a database client placed in a module scope is reused until the process exits.
- **Related task:** F01
- **Date:** 2026-11-11
