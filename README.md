# ecom-backend

Interview-lab e-commerce API. This repository currently contains the Node.js and strict TypeScript bootstrap only. Express, configuration, and database setup are later roadmap tasks.

## Requirements

- Node.js 22 LTS (verified on v22.12.0)
- npm 10

## Scripts

- `npm run typecheck` — strict TypeScript check, no emit
- `npm run build` — compile `src/` to `dist/`
- `npm run dev` — compile, then run the bootstrap entry
- `npm start` — run the already compiled entry
- `npm test` — Node.js built-in test for the package manifest

## Module format

The package is ECMAScript modules (`"type": "module"`). TypeScript uses `NodeNext`, so relative imports in later files need a `.js` specifier. See ADR-001 in `docs/DECISIONS.md`.

## Layout

- `src/index.ts` — entry used to prove the toolchain runs
- `tsconfig.json` — `"strict": true` plus a few extra checks
- `tests/bootstrap.test.mjs` — manifest check; no HTTP or database tests yet
