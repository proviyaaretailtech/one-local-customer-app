// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const path = require('path');
const { FileStore } = require('metro-cache');

const config = getDefaultConfig(__dirname);

// Use a stable on-disk store (shared across web/android)
const root = process.env.METRO_CACHE_ROOT || path.join(__dirname, '.metro-cache');
config.cacheStores = [
  new FileStore({ root: path.join(root, 'cache') }),
];


// // Exclude unnecessary directories from file watching
// config.watchFolders = [__dirname];
// config.resolver.blacklistRE = /(.*)\/(__tests__|android|ios|build|dist|.git|node_modules\/.*\/android|node_modules\/.*\/ios|node_modules\/.*\/windows|node_modules\/.*\/macos)(\/.*)?$/;

// // Alternative: use a more aggressive exclusion pattern
// config.resolver.blacklistRE = /node_modules\/.*\/(android|ios|windows|macos|__tests__|\.git|.*\.android\.js|.*\.ios\.js)$/;

// Reduce the number of workers to decrease resource usage
config.maxWorkers = 2;


// Dev proxy: the web build calls same-origin /api, so forward it to FastAPI.
const http = require('http');
const API_TARGET = { host: '127.0.0.1', port: 8001 };
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) => {
    if (!req.url.startsWith('/api')) return middleware(req, res, next);
    const upstream = http.request({ ...API_TARGET, path: req.url, method: req.method, headers: { ...req.headers, host: `${API_TARGET.host}:${API_TARGET.port}` } }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    upstream.on('error', () => { res.statusCode = 502; res.end('API backend unavailable'); });
    req.pipe(upstream);
  },
};

module.exports = config;
