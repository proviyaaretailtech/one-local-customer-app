# OneLocal customer app — store release checklist

Built from the "publish to the App Store" walkthrough (Expo / React Native) the founder shared on 11 Oct 2026, checked
against this app. ✅ done in code · 🟡 needs the founder · ⬜ to do at release time.

## In the app (code)
- ✅ Name: **OneLocal** (`app.config.ts` `name`).
- ✅ Bundle id / package: **com.proviyaa.onelatur** on iOS and Android (`app.json`). Permanent once the first build is
  uploaded to App Store Connect / Play Console: change it now or never.
- ✅ Version 1.0.0; build numbers are managed by EAS (`eas.json`: `appVersionSource: remote`, `autoIncrement` on production).
- ✅ iPad off (`supportsTablet: false`): no iPad screenshots needed. Turning it on later is one-way: once iPad is supported
  it must stay supported.
- ✅ Encryption declaration: `ITSAppUsesNonExemptEncryption: false` (the app only uses standard HTTPS), so App Store
  Connect does not ask on every build.
- ✅ App icon: 1024×1024, no transparency, made from the green "O" of the OneLocal logo (draft: replace with a designed
  icon if the founder has one). Android adaptive icon and web favicon match.
- ✅ Launch screen: OneLocal wordmark on the brand ink colour (the template's "Start building apps on emergent" splash
  is gone).
- ✅ Over-the-air updates linked to the Expo project (`docs/OTA_UPDATES.md`).
- 🟡 Apple Team ID (`ios.appleTeamId`): needed for the home-screen widget target and signing.
- 🟡 Backend address for phone builds (`BACKEND_URL` as an EAS environment variable): a built app has no dev server.

## Accounts
- 🟡 Apple Developer Program ($99/year, approval takes a day or two) and Google Play Console.
- ⬜ Create the app in App Store Connect with the bundle id above; first build via `eas build --profile production`
  then `eas submit` (or Xcode → Archive → Distribute, as in the video).
- ⬜ TestFlight: internal group with automatic distribution; install on a real phone and test before submitting.

## Store listing
- ⬜ Screenshots: iPhone 6.7" (and 6.5"), 3–5 images of the best screens (home, food brands, product, cart, order
  tracking). Take them from a TestFlight build in light mode.
- ⬜ Promotional text, description, keywords (drafts below).
- 🟡 Support URL and privacy policy URL: the app has a privacy notice screen; it must also be on a public web page
  (the partner website can host it).
- 🟡 App Review sign-in: the app has sign-in, so Apple needs a working demo account (phone/email + password or OTP that
  works for the reviewer).
- ⬜ Age rating questionnaire, content rights ("no third-party content" only if true: brand logos are shown with the
  partners' agreement), price **Free**, availability **India**.
- ⬜ Privacy "nutrition label": location (delivery address), contact info (phone, name), purchases, identifiers.

## Draft listing text (edit before use)
- **Name:** OneLocal
- **Subtitle (30):** Latur’s food, groceries & shops
- **Promotional text:** Order from your favourite Latur restaurants, kiranas, pharmacies and shops, delivered fast.
- **Keywords (100):** latur,food delivery,grocery,kirana,pharmacy,local shops,restaurant,order online,delivery,marathi
- **Description:** OneLocal brings your neighbourhood to your phone. Order food from local restaurants, daily groceries
  from your kirana, medicines from the pharmacy and finds from shops around Latur, and track your order to the door.
  Pay online or cash on delivery. Available in English, Hindi and Marathi.
