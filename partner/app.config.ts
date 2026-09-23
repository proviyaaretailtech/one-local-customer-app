import config from './app.json';

export default {
  ...config.expo,
  name: 'VINII Partner',
  extra: {
    backendUrl: process.env.BACKEND_URL,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY,
  },
};
