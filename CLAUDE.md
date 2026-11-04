# One Local customer app: working rules

Claude Code reads this at the start of every session; it is written for every developer too.

`frontend/` is two things: the customer app (screens in `app/`, shared code in `src/`) and the API server
(`app/api/**/+api.ts` routes, logic in `server/`). The Partner app, Rider app and Master also call that server, and the
production Supabase project (`ywylhzcxuoeilygzdonx`) is shared by every Proviyaa app.

## Code quality: lean, no slop

- Make the smallest change that does the job. No drive-by refactors, renames, reformatting or "while I'm here" edits.
- No unused code: no unused imports, variables, props, parameters, exports, styles or files. Delete what your change
  makes dead.
- No speculative code: no abstractions, options, config or helpers for cases that do not exist yet. A one-off stays
  inline; extract only when there is a second real use.
- Reuse before adding: look in `src/components/`, `src/ui/`, `src/theme.ts`, `src/motion.tsx`, `src/motion-tokens.ts`
  and `src/i18n/` first.
- No commented-out code, `console.log`, placeholder TODOs, empty or error-swallowing `try/catch`, or `any` /
  `as unknown as` to quiet the type checker.
- Comments say why, briefly, in the file's existing voice; never narrate what the next line does.
- Match the surrounding file: naming, structure, styling approach and comment density.
- No new dependencies without asking. When approved, add them with `npx expo install <package>` so versions stay
  compatible with Expo SDK 57.

## UI conventions (as the code already does them)

- `Text` and `TextInput` come from `@/src/ui/text` (Poppins), not from `react-native`.
- Styles use `StyleSheet.create`, colours from `src/theme.ts` (`colors`, `useTheme`) and its `spacing` / `radius`
  tokens. Do not add new hard-coded hex colours.
- Every visible string goes through i18n: `t('feature.key')`, added to `en.json` and `hi.json` together with
  `npm run i18n:add`; numbers, money and dates go through `useFormat()`. Details: `frontend/src/i18n/README.md`.
- In `app/` and `src/`, `react-native` resolves to `src/native/react-native.tsx` (see `metro.config.js`), which gives
  every button a haptic and press motion. Do not add `haptic.tap()` to ordinary presses.
- Keep existing `testID`s; the e2e tests in `frontend/e2e/` depend on them.
- Shared code must run on web, iOS and Android: guard web-only or native-only APIs with a platform check.

## UI revamp: components

The UI revamp's plan, component list and phase order are in `docs/UI_REVAMP.md`. In short:

- Layers: tokens (`src/theme.ts`) → primitives (`src/ui/`, no data or routing) → domain components (`src/components/`,
  one API type from `src/api.ts` as a prop, no fetching) → sections → screens (`app/`, fetch through one shared
  react-query hook per endpoint).
- Build a primitive in the change that first uses it, and delete the hand-built copies it replaces in that same change.
- Looks are chosen with `variant` / `size` / `tone` unions, never boolean switches. `style` is for outside layout only.
- No raw colour, font size, radius or shadow outside `src/theme.ts` in revamped code.

## Do not break what works

- UI work stays in `app/` (not `app/api/`) and `src/`. Ask before changing `server/`, `app/api/`, `db/`, `supabase/`,
  `scripts/db.py`, `metro.config.js`, `app.json`, `app.config.ts` or native config.
- API responses are contracts with the Partner app, Rider app and Master: only add optional fields, never rename or
  remove. Contracts: `docs/MASTER_CONTRACT_V1.md`, `docs/ONE_LOCAL_RIDER_BACKEND_CONTRACT.md`,
  `docs/RIDER_DISPATCH_API.md`, `docs/PAYMENTS.md`.
- Never weaken the server's guards: `server/env.ts` (local Supabase only unless `ALLOW_REMOTE=1`), auth, rate limits,
  idempotency.
- Nothing reaches production from a development machine: no `ALLOW_REMOTE=1`, no service-role key in `.env`, no
  migrations on production, no `eas update` / `eas build --profile production` / `eas submit`, no copying into
  `one-local-server`. Those need the founder's approval.
- A native change (new native package, permission, config plugin, app icon) needs a new dev build and changes which
  over-the-air updates a build accepts. Flag it before making it.

## Before calling a change done

Run from `frontend/`:

- `npx tsc --noEmit`: no new errors. One already exists, in `scripts/delivery-otp-checks.ts`.
- `npm run lint`: no new warnings in the files you touched.
- `npm run i18n:check` when strings changed.
- When server code changed: the matching `npx tsx scripts/<area>-checks.ts`.
- See it running on web (`npx expo start`, then `w`) and in the iOS simulator (`i`). Android is not installed on this
  Mac; say a change is untested there.
- Read `git diff` once more for leftovers: debug code, unused imports, files you did not mean to touch.

## Local setup

- Use Node 22 or newer; the Supabase client needs it once sign-in is configured.
- Without a `.env` the server runs on built-in sample data and talks to no database. Keep it that way for UI work.
- The dev server runs on port 8081, which the installed iOS dev build expects.

## Git

- Work on your own branch. Never push to `feat/expo-router-api` or `release/*` without the team's say-so.
- Add files by name (`git add <path>`), never `git add .`. Never commit `.env*`, an unintended `package-lock.json`
  change, or `frontend/server/data/media.json` (a local-only image map until the team decides).
- Messages follow the repo style, `type(scope): what changed, in plain English`, for example
  `fix(customer-app): …`, `feat(customer-app): …`, `docs(journal): …`.
- Notable changes get an entry at the top of `docs/JOURNAL.md`, in the same format as the existing entries.
