# F09 — ESLint, Prettier, and the check scripts

## What this task is
There is no new HTTP route. `npm run lint` runs ESLint 9 from `eslint.config.js`. `npm run format:check` runs Prettier on the code files. `npm run typecheck` still asks `tsc` to type-check without writing `dist`. `npm test` still compiles `src/` and then runs the Node.js test runner. Those last two stay separate: a type error and a failing test are different failures, and a type check must not be the thing that refreshes `dist`.

## Why lint and format are different tools
ESLint reports suspicious code. The `src/` block uses `typescript-eslint` `recommendedTypeChecked`, so rules such as `@typescript-eslint/no-floating-promises` and `@typescript-eslint/no-explicit-any` can see the types from `tsconfig.json`. F10 adds a second block for `labs/**/*.ts`. That block uses the same rules, and the project service reads the tsconfig that includes the file: `labs/f10-types/tsconfig.json` or, from F11, `labs/f11-types/tsconfig.json`. Prettier only moves whitespace, quotes, and line breaks. `eslint-config-prettier` turns off ESLint rules that would argue with Prettier. Running Prettier as an ESLint rule would mix "this may be a bug" with "this line is 101 characters."

`src/database/migrator.ts` kept a runtime array, `HISTORY_TABLES`, whose only use was `typeof` in a type alias. The unused-vars rule rejects a value that exists only for the type position. `HistoryTable` is now `typeof MIGRATION_HISTORY_TABLE | typeof SEEDER_HISTORY_TABLE`. The two exported names are still the only legal history tables.

The shutdown chain in `src/server.ts` is not awaited, because a signal listener returns `void`. It ends in `.catch`, so `no-floating-promises` accepts it. A call that drops the promise on the floor does not.

Tests and `scripts/` are `.mjs` files outside `tsconfig.json` `"include"`. They get ESLint's JavaScript recommended rules and Node globals. They do not get type-aware rules. `tsc` still does not type-check them.

## Why the test glob is quoted
`npm test` used to pass `tests/*.test.mjs`. npm runs the script with `sh`, and `sh` expands an unquoted glob before Node starts. That misses a test nested in a folder. `**` is not "any depth" in `sh` unless globstar is on, and it is off. The script is now:

```text
tsc -p tsconfig.json && node --test --test-reporter=spec "tests/**/*.test.mjs"
```

The quotes leave the pattern as one argument. Node's test runner matches it, including a nested file. `--test-reporter=spec` keeps the same summary when stdout is not a terminal. Node's default is `spec` on a TTY and `tap` otherwise.

`npm run typecheck` is `tsc -p tsconfig.json --noEmit`. `npm test` must emit, because the tests import `dist/`. Do not run two compiles that both write `dist` at the same time.

## Why this is ESLint 9
ESLint 10's engines are `^20.19.0 || ^22.13.0 || >=24`. This repo is verified on Node 22.12.0, which ESLint 9 allows (`^18.18.0 || ^20.9.0 || >=21.1.0`). Flat config is the ESLint 9 format. There is no `.eslintrc`. npm still warns that ESLint 9.39.5 is unsupported upstream. That is a maintenance warning, and the binary runs here. Jest and Vitest stay later tasks. The runner remains `node --test`.

Prettier's print width is 100. The existing imports already sat near that width. Width 80 would reflow them without changing meaning. Markdown under `docs/` and `prompts/` is outside the formatter so a prose wrap is still a hand edit. F10 adds `labs/` to the format globs. `labs/**/dist/` stays ignored because the ignore pattern `dist` matches a directory of that name.

## Security
A linter is not a secret scanner. A password in a string can be formatted and still ship. ESLint's ban on explicit `any` blocks one way to silence the type checker. It does not review SQL, cookies, or authorization. Those stay in the feature tasks. The config files do not contain credentials.

## Interview questions
1. What does ESLint catch that Prettier will happily print? An unused value, an explicit `any`, or a promise with no `await`, `return`, or `.catch`. Prettier will reprint all three.
2. Why keep `typecheck` if `npm test` already runs `tsc`? `typecheck` must not write `dist`. Test needs the compiled files. CI can report a type failure without refreshing the build output, and a person can type-check while a server is running from an older `dist`.
3. Why quote `tests/**/*.test.mjs`? npm uses `sh`. An unquoted glob is expanded by the shell, `*` does not cross `/`, and `**` is not recursive unless globstar is enabled. Node receives the pattern only when the shell leaves it alone.
4. What is flat config? `eslint.config.js` exports an array of config objects. ESLint 9 does not read `.eslintrc`. `ignores` and `files` live in that array.
5. Why doesn't one type-aware project cover every file? `projectService` follows the tsconfig that includes the file. `src/` uses the application `tsconfig.json`. `labs/f10-types/*.ts` and `labs/f11-types/*.ts` each use that directory's tsconfig. Tests are `.mjs` and are not in either `"include"`. `labs/**/reject/**` is an ESLint ignore because that file is supposed to fail `tsc`.
6. Why not ESLint 10 today? Its `engines` field rejects Node 22.12.0. Installing it would make `npm run lint` depend on a runtime this repo does not claim.
7. What makes a promise "floating"? Creating it and neither awaiting it, returning it, nor attaching `.catch`. The signal handler cannot `await`. The `.catch` on that chain is what keeps the rule quiet.
8. Why not `eslint-plugin-prettier`? Format failures would look like lint findings. The two commands stay separate so a formatting-only diff is obvious.
9. What does `--noEmit` prove that `node dist/server.js` does not? The compiler checked the types. Node runs the last JavaScript that was written and will not report a bad annotation.

## From-scratch exercise
In an empty folder, run `npm init -y`, set `"type": "module"`, and install `typescript`, `eslint`, `@eslint/js`, `typescript-eslint`, and `prettier`. Add a `tsconfig.json` with `"strict": true` and a `src/demo.ts` that declares `const ids = [1, 2] as const` and uses it only as `type Id = (typeof ids)[number]`. Wire `eslint.config.js` to `recommendedTypeChecked`. `npx eslint .` should report the unused value. Replace the array with a type the program actually uses, or read the array at runtime, and make lint pass. Then add `"test": "node --test \"tests/**/*.test.mjs\""` and confirm `sh -c 'echo tests/**/*.test.mjs'` does not list a nested file the same way `node --test` does.
