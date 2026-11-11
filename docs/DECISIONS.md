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
_No decisions recorded yet._
