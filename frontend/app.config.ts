import config from './app.json';
export default { ...config.expo, name: 'OneCity', extra: { backendUrl: process.env.BACKEND_URL } };