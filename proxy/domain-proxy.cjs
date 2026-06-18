/* eslint-disable no-console */
const http = require('http');
const httpProxy = require('http-proxy');
const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const PROXY_PORT = Number(process.env.PROXY_PORT || 8080);
const SUPERADMIN_PORT = Number(process.env.SUPERADMIN_PORT || 3000);
const APP_DOMAIN = (process.env.APP_DOMAIN || '').trim().toLowerCase();
const CACHE_TTL_MS = Number(process.env.PROXY_CACHE_TTL_MS || 15000);

const proxy = httpProxy.createProxyServer({
  xfwd: true,
  changeOrigin: false,
  ws: true,
});

const pgClient = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

const orgCache = new Map();

function cacheKey(hostname) {
  return hostname.toLowerCase();
}

function readCache(hostname) {
  const entry = orgCache.get(cacheKey(hostname));
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    orgCache.delete(cacheKey(hostname));
    return null;
  }
  return entry.value;
}

function writeCache(hostname, value) {
  orgCache.set(cacheKey(hostname), { value, at: Date.now() });
}

function parseHost(hostHeader) {
  if (!hostHeader) return { hostname: '', port: null };
  const [hostname, rawPort] = hostHeader.split(':');
  const parsedPort = Number(rawPort);
  return {
    hostname: (hostname || '').toLowerCase(),
    port: Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : null,
  };
}

function resolveSubdomain(hostname) {
  if (!hostname) return null;
  if (hostname.includes('.localhost')) return hostname.split('.')[0];
  if (APP_DOMAIN && hostname.endsWith(`.${APP_DOMAIN}`)) {
    return hostname.replace(`.${APP_DOMAIN}`, '');
  }
  return null;
}

function isAuthBootstrapPath(pathname) {
  return (
    pathname === '/auth/handoff/consume' ||
    pathname === '/auth/session' ||
    pathname === '/auth/refresh' ||
    pathname === '/auth/login' ||
    pathname === '/auth/employee/login'
  );
}

async function resolveTarget(hostHeader, pathname = '') {
  // Auth bootstrap endpoints use master DB (handoff tokens, session RBAC).
  // Browser still calls {subdomain}.localhost:8080 so cookies stay on tenant host.
  if (isAuthBootstrapPath(pathname)) {
    return `http://127.0.0.1:${SUPERADMIN_PORT}`;
  }

  const { hostname } = parseHost(hostHeader);
  if (!hostname) {
    return `http://127.0.0.1:${SUPERADMIN_PORT}`;
  }

  const cached = readCache(hostname);
  if (cached) return cached;

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === APP_DOMAIN) {
    const target = `http://127.0.0.1:${SUPERADMIN_PORT}`;
    writeCache(hostname, target);
    return target;
  }

  const subdomain = resolveSubdomain(hostname);
  if (!subdomain) {
    const target = `http://127.0.0.1:${SUPERADMIN_PORT}`;
    writeCache(hostname, target);
    return target;
  }

  // Route tenant subdomains through superadmin; tenant is resolved from Host header.
  const routeTenantsToSuperadmin =
    (process.env.PROXY_ROUTE_TENANTS_TO_SUPERADMIN ?? 'true').toLowerCase() !==
    'false';

  if (routeTenantsToSuperadmin) {
    const target = `http://127.0.0.1:${SUPERADMIN_PORT}`;
    writeCache(hostname, target);
    return target;
  }

  const result = await pgClient.query(
    `SELECT org_port
     FROM organizations
     WHERE subdomain = $1
       AND status = 'ACTIVE'
       AND org_port IS NOT NULL
       AND "deletedAt" IS NULL
     LIMIT 1`,
    [subdomain],
  );

  if (result.rowCount === 0) {
    throw new Error(`No active organization found for subdomain "${subdomain}"`);
  }

  const orgPort = Number(result.rows[0].org_port);
  if (!Number.isInteger(orgPort) || orgPort <= 0) {
    throw new Error(`Invalid org_port for "${subdomain}"`);
  }

  const target = `http://127.0.0.1:${orgPort}`;
  writeCache(hostname, target);
  return target;
}

async function start() {
  await pgClient.connect();
  console.log(`[proxy] connected to postgres, starting on ${PROXY_PORT}`);

  const server = http.createServer(async (req, res) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-bootstrap-admin-key, x-org-id');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.statusCode = 204;
      res.end();
      return;
    }

    try {
      const pathname = req.url?.split('?')[0] ?? '';
      const target = await resolveTarget(req.headers.host, pathname);
      
      // Add CORS headers to all responses
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      
      proxy.web(req, res, { target });
    } catch (error) {
      res.statusCode = 502;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          message: error.message || 'Unable to resolve organization routing',
          statusCode: 502,
        }),
      );
    }
  });

  server.on('upgrade', async (req, socket, head) => {
    try {
      const target = await resolveTarget(req.headers.host, req.url?.split('?')[0] ?? '');
      proxy.ws(req, socket, head, { target });
    } catch {
      socket.destroy();
    }
  });

  proxy.on('error', (error, req, res) => {
    if (res && !res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: error.message, statusCode: 502 }));
      return;
    }
    console.error('[proxy] upstream error', error.message);
  });

  server.listen(PROXY_PORT, () => {
    console.log(`[proxy] domain router listening on :${PROXY_PORT}`);
  });
}

start().catch((error) => {
  console.error('[proxy] startup failed', error);
  process.exit(1);
});
