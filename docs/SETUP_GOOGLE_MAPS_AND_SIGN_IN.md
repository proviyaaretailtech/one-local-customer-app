# Switching on Google Maps and Google sign-in (founder checklist)

The app code is finished. These steps create keys and switch settings on, which only the account owner can do.
Never paste keys into chat; put them only in `OL-ui/.env` (not committed).

## A. Google Cloud (one project, e.g. "OneCity")
1. Create the project at console.cloud.google.com and attach a billing account (Maps needs it; there is a free monthly allowance).
2. **APIs & Services → Library**, enable:
   - Maps JavaScript API (the map on the website)
   - Places API (New) (address search)
   - Geocoding API (pin → address)
3. **Credentials → Create credentials → API key**, name it `OneCity server`:
   - API restrictions: Places API (New) and Geocoding API only.
   - Put it in `OL-ui/.env` as `GOOGLE_MAPS_API_KEY=` (used only by the server; never ships in the app).
4. Create a second API key, `OneCity web map`:
   - API restrictions: Maps JavaScript API only.
   - Application restrictions → Websites: `http://localhost:8081/*` (add the real website address later).
   - Put it in `OL-ui/.env` as `GOOGLE_MAPS_BROWSER_KEY=`.
5. **OAuth consent screen**: External, app name OneCity, your support email. Default scopes (email, profile) are enough.
6. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized redirect URI: `https://ywylhzcxuoeilygzdonx.supabase.co/auth/v1/callback`
   - Copy the Client ID and Client secret for step B1.

## B. Supabase dashboard (the VINII POS project, `ywylhzcxuoeilygzdonx`)
1. **Authentication → Sign In / Providers → Google**: enable, paste the Client ID and Client secret, save.
2. **Authentication → URL Configuration**:
   - Site URL: `http://localhost:8081` for now (the real website address later).
   - Redirect URLs: add `http://localhost:8081/**`, `onecity://**`, and `exp://**` (the last one is for testing in Expo Go).

## C. Then
Restart the Expo server so it reads the new keys. The map, address search and "Continue with Google" start working with no code change.

For store builds later: Android needs its own Maps key in `app.json` (`android.config.googleMaps.apiKey`, restricted to the app's package and signing certificate); iOS uses Apple Maps and needs none.
