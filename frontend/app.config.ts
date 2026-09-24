import config from './app.json';

// Customer app identity comes from .env (CUSTOMER_APP_BUNDLE_ID), falling back to app.json.
const bundleIdentifier = process.env.CUSTOMER_APP_BUNDLE_ID || config.expo.ios.bundleIdentifier;
// Shared with the home-screen widget (targets/widget) so it can show the latest order.
export const APP_GROUP = `group.${bundleIdentifier}`;

// Over-the-air updates (expo-updates / EAS Update): JavaScript and UI changes ship without a store
// rebuild. The runtime version is a fingerprint of the native code, so an update only reaches
// builds whose native side it matches; adding native modules or widget Swift needs a new build.
// Switches on once EAS_PROJECT_ID is set (`eas init` creates it) — see docs/OTA_UPDATES.md.
const easProjectId = process.env.EAS_PROJECT_ID;

// Only public values go into `extra` (it ships inside the app). Server secrets such as
// GOOGLE_MAPS_API_KEY stay in process.env and are read only by app/api routes.
export default {
  ...config.expo,
  name: 'OneCity',
  runtimeVersion: { policy: 'fingerprint' },
  updates: easProjectId
    ? { enabled: true, url: `https://u.expo.dev/${easProjectId}`, checkAutomatically: 'ON_LOAD', fallbackToCacheTimeout: 0 }
    : { enabled: false },
  ios: {
    ...config.expo.ios,
    bundleIdentifier,
    // Live Activities (order tracking on the lock screen and in the Dynamic Island).
    infoPlist: { ...config.expo.ios.infoPlist, NSSupportsLiveActivities: true },
    entitlements: { 'com.apple.security.application-groups': [APP_GROUP] },
  },
  plugins: [
    ...config.expo.plugins,
    // iOS add-in layer: notifications, Live Activities / Dynamic Island, home-screen widget.
    // All three need a development build (`npx expo run:ios`); Expo Go and the web skip them.
    ['expo-notifications', { color: '#B3F400' }],
    '@bacons/apple-targets',
    'expo-dev-client',
    // Native launch screen in the intro's ink colour, so launch → intro has no white flash.
    ['expo-splash-screen', { backgroundColor: '#050605', dark: { backgroundColor: '#050605' } }],
    // Our folder name has spaces; keeps pod build scripts working (see the plugin).
    './plugins/with-space-safe-paths',
  ],
  extra: {
    ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
    backendUrl: process.env.BACKEND_URL,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY,
    googleMapsBrowserKey: process.env.GOOGLE_MAPS_BROWSER_KEY,
    appGroup: APP_GROUP,
  },
};
