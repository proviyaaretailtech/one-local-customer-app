import config from './app.json';

// Only public values go into `extra` (it ships inside the app). Server secrets such as
// GOOGLE_MAPS_API_KEY stay in process.env and are read only by app/api routes.
export default {
  ...config.expo,
  name: 'OneCity',
  extra: {
    backendUrl: process.env.BACKEND_URL,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY,
    googleMapsBrowserKey: process.env.GOOGLE_MAPS_BROWSER_KEY,
  },
};
