# F01 — TypeScript bootstrap

## What this task is
There is no HTTP request flow yet. `src/index.ts` is a process entry that prints one line when Node runs it directly. `npm run typecheck` asks the TypeScript compiler to reject unsafe code. `npm run build` emits JavaScript into `dist/`. `npm test` checks that `package.json` declares a private ESM package and the toolchain scripts.

## Why the compiler options look like this
`"strict": true` turns on `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, and the rest of the strict family. A value that might be missing must be handled before use. `process.argv[1]` is `string | undefined` because `noUncheckedIndexedAccess` is also on. `verbatimModuleSyntax` keeps `import`/`export` aligned with what Node actually loads.

## ESM, CommonJS, and the module cache
CommonJS loads `require()` / `module.exports` and resolves files synchronously. This repo uses ESM: `import` / `export`, `"type": "module"`, and static specifiers Node can resolve. With `NodeNext`, write `import { x } from "./file.js"` inside `file.ts`. TypeScript does not rewrite that specifier; Node loads the compiled `file.js`.

Node caches a module by its absolute URL. The first import runs the file; later imports in the same process get the same exports object. That is useful for one shared client later, and it is a footgun if a test expects a fresh copy without clearing the cache or using a new process.

## Security
Secrets do not belong in source. `.gitignore` excludes `.env` and `.env.*` (an optional `.env.example` can be committed). The bootstrap entry does not read credentials or open a port.

## Interview questions
1. What does `strictNullChecks` change compared with a loose `null`? A `string` no longer includes `null` or `undefined`. Call sites must narrow before reading properties.
2. Why is `noImplicitAny` not enough on its own? It forces a type for unannotated values. It does not stop assigning `null` to a `string` unless `strictNullChecks` is on. `"strict": true` enables both.
3. Why do ESM imports use `.js` in TypeScript source? `NodeNext` emits specifiers unchanged. Node resolves the runtime file, which is `.js`.
4. What is the module cache? Node keeps one module instance per resolved URL per process. A second `import` does not re-run the body.
5. Why record ESM in an ADR now? Express and Sequelize code will import this way. Switching later rewrites every relative import.
6. What does `npm run typecheck` prove that `node dist/index.js` does not? `tsc --noEmit` checks types. Node only runs the emitted JavaScript and will not report a bad annotation.

## From-scratch exercise
Create an empty folder, run `npm init -y`, set `"type": "module"`, install TypeScript, and add a `tsconfig.json` with `"strict": true` and `NodeNext`. Add `src/index.ts` that reads `process.argv[1]` without asserting it is defined. Make `npx tsc --noEmit` pass, then break it on purpose by using `argv[1]` as a `string` with no check.
