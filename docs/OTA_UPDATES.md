# Over-the-air (OTA) updates — ship UI changes without a rebuild

The customer app uses **expo-updates**. Screen, style, copy and logic changes (anything in
JavaScript or images) can go out to installed phones in minutes. A new store build is only needed
when native code changes (new native package, widget/Live Activity Swift, permissions, app icon).

## How it is wired

- `frontend/app.config.ts` turns updates on **only when `EAS_PROJECT_ID` is set**, so local builds
  keep working with no account.
- `runtimeVersion: { policy: 'fingerprint' }` — Expo hashes the native layer. A phone only receives
  updates made for the exact native build it has, so a JS update can never crash an older binary.
  If the fingerprint changes, EAS tells you a new build is needed.

## One-time setup (founder)

```bash
npm install -g eas-cli
```

```bash
cd frontend && eas login
```

```bash
cd frontend && eas init
```

Put the printed project id into `.env.local` as `EAS_PROJECT_ID=...`, then make one build per
channel (`eas build --profile pilot`, later `stable`). That build is the one that can receive
updates.

## Every UI change after that

```bash
cd frontend && eas update --channel pilot --message "Brand page header"
```

Phones pick it up on next launch (downloaded in the background, applied on the following open).
Roll back with `eas update:republish` of the previous group, or in the EAS dashboard.

## Rules

- Test on web/simulator first; an update reaches every phone on that channel.
- Channels: `internal` (team) → `pilot` (demo phones, test merchants) → `stable` (store app). See `PLATFORM_FOUNDATIONS.md` §3 for rollouts, the minimum-version gate and server-driven screens.
- Never put secrets in the app bundle — updates ship the bundle to every phone.
