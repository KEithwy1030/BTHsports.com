'use strict';

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const morgan = require('morgan');
const { LRUCache } = require('lru-cache');

const app = express();

const PORT = Number(process.env.PORT || 8787);
const DEFAULT_REFERER = process.env.DEFAULT_REFERER || 'http://play.jgdhds.com/';
const DEFAULT_USER_AGENT =
  process.env.DEFAULT_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 15000);
const SESSION_TTL_SECONDS = Math.max(Number(process.env.SESSION_TTL_SECONDS || 900), 60);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const ALLOW_ALL_ORIGINS = ALLOWED_ORIGINS.includes('*');

const PROXY_SEGMENT_PATH = '/proxy-segment';
const MANIFEST_CACHE_TTL = Number(process.env.MANIFEST_CACHE_TTL_MS || 5000);
const SEGMENT_CACHE_TTL = Number(process.env.SEGMENT_CACHE_TTL_MS || 15000);
const MANIFEST_CACHE_MAX = Number(process.env.MANIFEST_CACHE_MAX || 500);
const SEGMENT_CACHE_MAX = Number(process.env.SEGMENT_CACHE_MAX || 200);

app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));
app.use(
  cors({
    origin(origin, callback) {
      if (ALLOW_ALL_ORIGINS || !origin || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: false
  })
);
app.use(
  morgan(':method :url :status :res[content-length] - :response-time ms', {
    skip: (req) => req.url.includes('health')
  })
);

// --- session store --------------------------------------------------------
const sessionStore = new Map();

function setSession(streamId, payload = {}) {
  if (!streamId) return;
  const ttl = Number(payload.ttlSeconds || SESSION_TTL_SECONDS) * 1000;
  sessionStore.set(streamId, {
    playUrl: payload.playUrl || '',
    cookies: payload.cookies || '',
    sourceUrl: payload.sourceUrl || '',
    updatedAt: Date.now(),
    expiresAt: Date.now() + ttl
  });
}

function getSession(streamId) {
  if (!streamId) return null;
  const record = sessionStore.get(streamId);
  if (!record) return null;
  if (record.expiresAt && record.expiresAt < Date.now()) {
    sessionStore.delete(streamId);
    return null;
  }
  return record;
}

function pruneSessions() {
  const now = Date.now();
  for (const [streamId, record] of sessionStore.entries()) {
    if (record.expiresAt && record.expiresAt < now) {
      sessionStore.delete(streamId);
    }
  }
}

setInterval(pruneSessions, Math.max(SESSION_TTL_SECONDS * 500, 60_000)).unref();

// --- caches ---------------------------------------------------------------
const manifestCache = new LRUCache({
  max: MANIFEST_CACHE_MAX,
  ttl: MANIFEST_CACHE_TTL,
  allowStale: false
});

const segmentCache = new LRUCache({
  max: SEGMENT_CACHE_MAX,
  ttl: SEGMENT_CACHE_TTL,
  allowStale: false,
  sizeCalculation: (value, key) => {
    if (!value) return 1;
    return value.byteLength || 1;
  }
});

// --- helpers --------------------------------------------------------------
function decodeBase64Param(token = '') {
  if (!token) return '';
  try {
    return Buffer.from(token, 'base64').toString('utf-8');
  } catch (error) {
    console.warn('Base64 decode failed:', error.message);
    return '';
  }
}

function encodeBase64Param(value = '') {
  if (!value) return '';
  try {
    return Buffer.from(value, 'utf-8').toString('base64');
  } catch (error) {
    console.warn('Base64 encode failed:', error.message);
    return '';
  }
}

function rewriteM3u8Manifest(content, baseUrl, sessionToken = '', refererToken = '', streamId = '') {
  if (!content) return '';
  const lines = content.split(/\r?\n/);
  let base;
  try {
    base = new URL(baseUrl);
  } catch (error) {
    console.warn('Failed to parse base URL:', baseUrl);
    base = null;
  }

  return lines
    .map((line) => {
      if (!line || line.startsWith('#') || !base) {
        return line;
      }
      let absoluteUrl;
      try {
        absoluteUrl = new URL(line, base).toString();
      } catch (error) {
        console.warn('Failed to resolve segment URL:', line, error.message);
        return line;
      }
      const params = new URLSearchParams();
      params.set('url', absoluteUrl);
      if (streamId) {
        params.set('streamId', streamId);
      }
      if (sessionToken) {
        params.set('session', sessionToken);
      }
      if (refererToken) {
        params.set('referer', refererToken);
      }
      return `${PROXY_SEGMENT_PATH}?${params.toString()}`;
    })
    .join('\n');
}

function buildRequestHeaders({ refererHeader, cookieHeader, overrideUA }) {
  return {
    'User-Agent': overrideUA || DEFAULT_USER_AGENT,
    Referer: refererHeader || DEFAULT_REFERER,
    Accept: 'application/vnd.apple.mpegurl, application/x-mpegURL, application/octet-stream, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Connection: 'keep-alive',
    ...(cookieHeader ? { Cookie: cookieHeader } : {})
  };
}

async function fetchUpstream(url, options = {}) {
  return axios.get(url, {
    ...options,
    timeout: REQUEST_TIMEOUT_MS,
    maxRedirects: 5,
    responseEncoding: 'utf8',
    headers: {
      ...options.headers
    }
  });
}

function sendError(res, status, payload) {
  res.status(status).json({
    success: false,
    ...payload
  });
}

// --- routes ---------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    sessions: sessionStore.size
  });
});

app.post('/sessions', (req, res) => {
  const { streamId, playUrl, cookies, sourceUrl, ttlSeconds } = req.body || {};
  if (!streamId) {
    return sendError(res, 400, { message: 'streamId is required' });
  }
  setSession(streamId, { playUrl, cookies, sourceUrl, ttlSeconds });
  res.json({
    success: true,
    message: 'session stored',
    expiresIn: Number(ttlSeconds || SESSION_TTL_SECONDS)
  });
});

app.get('/proxy-m3u8', async (req, res) => {
  const { url, session = '', referer = '', streamId = '' } = req.query;

  if (!url) {
    return sendError(res, 400, { message: 'Missing url parameter' });
  }

  const decodedUrl = decodeURIComponent(url);
  let targetUrl = decodedUrl;
  let sessionToken = session || '';
  let refererToken = referer || '';
  let cookieHeader = decodeBase64Param(sessionToken);
  let refererHeader = decodeBase64Param(refererToken) || DEFAULT_REFERER;

  const storedSession = getSession(streamId);
  if (storedSession) {
    refererHeader = storedSession.sourceUrl || refererHeader;
    if (storedSession.playUrl) {
      targetUrl = storedSession.playUrl;
    }
    if (!cookieHeader && storedSession.cookies) {
      cookieHeader = storedSession.cookies;
      sessionToken = encodeBase64Param(cookieHeader);
    }
  }

  const cacheKey = `${targetUrl}|${streamId}|${sessionToken}|${refererToken}`;
  if (manifestCache.has(cacheKey) && MANIFEST_CACHE_TTL > 0) {
    const cached = manifestCache.get(cacheKey);
    const manifestContentCached = typeof cached.data === 'string' ? cached.data : '';
    const effectiveSessionTokenCached = sessionToken || (cookieHeader ? encodeBase64Param(cookieHeader) : cached.sessionToken || '');
    const effectiveRefererTokenCached = refererToken || (refererHeader ? encodeBase64Param(refererHeader) : cached.refererToken || '');
    const rewrittenCached = rewriteM3u8Manifest(
      manifestContentCached,
      cached.targetUrl || targetUrl,
      effectiveSessionTokenCached,
      effectiveRefererTokenCached,
      streamId
    );

    res.set({
      'Content-Type': cached.headers?.['content-type'] || 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache'
    });

    return res.send(rewrittenCached);
  }

  try {
    const response = await fetchUpstream(targetUrl, {
      responseType: 'text',
      transformResponse: [(data) => data],
      headers: buildRequestHeaders({ refererHeader, cookieHeader })
    });

    manifestCache.set(cacheKey, {
      data: response.data,
      headers: response.headers,
      targetUrl,
      sessionToken,
      refererToken,
      streamId
    });

    const manifestContent = typeof response.data === 'string' ? response.data : '';
    const effectiveSessionToken = sessionToken || (cookieHeader ? encodeBase64Param(cookieHeader) : '');
    const effectiveRefererToken = refererToken || (refererHeader ? encodeBase64Param(refererHeader) : '');
    const rewritten = rewriteM3u8Manifest(
      manifestContent,
      targetUrl,
      effectiveSessionToken,
      effectiveRefererToken,
      streamId
    );

    res.set({
      'Content-Type': response.headers['content-type'] || 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache'
    });

    return res.send(rewritten);
  } catch (error) {
    const status = error.response?.status || 500;
    console.error('proxy-m3u8 failed:', status, error.message);
    if (error.response?.data) {
      res
        .status(status)
        .set({
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        })
        .send(error.response.data);
      return;
    }
    return sendError(res, status, { message: 'proxy m3u8 failed', error: error.message });
  }
});

app.get(PROXY_SEGMENT_PATH, async (req, res) => {
  const { url, session = '', referer = '', streamId = '' } = req.query;

  if (!url) {
    return sendError(res, 400, { message: 'Missing url parameter' });
  }

  const decodedUrl = decodeURIComponent(url);
  let sessionToken = session || '';
  let refererToken = referer || '';
  let cookieHeader = decodeBase64Param(sessionToken);
  let refererHeader = decodeBase64Param(refererToken) || DEFAULT_REFERER;

  const cacheKey = `${decodedUrl}|${streamId}|${sessionToken}|${refererToken}`;
  if (segmentCache.has(cacheKey)) {
    const cached = segmentCache.get(cacheKey);
    res.set({
      'Content-Type': cached.contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache'
    });
    return res.end(cached.buffer, 'binary');
  }

  const storedSession = getSession(streamId);
  if (storedSession) {
    refererHeader = storedSession.sourceUrl || refererHeader;
    if (!cookieHeader && storedSession.cookies) {
      cookieHeader = storedSession.cookies;
      sessionToken = encodeBase64Param(cookieHeader);
    }
  }

  try {
    const response = await fetchUpstream(decodedUrl, {
      responseType: 'arraybuffer',
      headers: {
        ...buildRequestHeaders({ refererHeader, cookieHeader }),
        Accept: '*/*'
      }
    });

    const upstreamContentType = response.headers['content-type'] || '';
    const bufferData = Buffer.from(response.data);

    if (
      upstreamContentType.includes('application/vnd.apple.mpegurl') ||
      bufferData.toString('utf-8', 0, 7).includes('#EXTM3U')
    ) {
      const manifestText = bufferData.toString('utf-8');
      const effectiveSessionToken = sessionToken || (cookieHeader ? encodeBase64Param(cookieHeader) : '');
      const effectiveRefererToken = refererToken || (refererHeader ? encodeBase64Param(refererHeader) : '');
      const rewritten = rewriteM3u8Manifest(
        manifestText,
        decodedUrl,
        effectiveSessionToken,
        effectiveRefererToken,
        streamId
      );

      res.set({
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache'
      });

      return res.send(rewritten);
    }

    res.set({
      'Content-Type': upstreamContentType || 'video/mp2t',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache'
    });

    segmentCache.set(cacheKey, {
      buffer: bufferData,
      contentType: upstreamContentType || 'video/mp2t'
    });

    return res.end(bufferData, 'binary');
  } catch (error) {
    const status = error.response?.status || 500;
    console.error('proxy-segment failed:', status, error.message);
    if (error.response?.data) {
      res
        .status(status)
        .set({
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        })
        .send(error.response.data);
      return;
    }
    return sendError(res, status, { message: 'proxy segment failed', error: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'JRKAN Edge Proxy ready',
    health: {
      sessions: sessionStore.size,
      ttlSeconds: SESSION_TTL_SECONDS,
      defaultReferer: DEFAULT_REFERER,
      manifestCacheSize: manifestCache.size,
      segmentCacheSize: segmentCache.size
    }
  });
});

app.post('/prewarm', async (req, res) => {
  try {
    const { url, session = '', referer = '', streamId = '' } = req.body || {};
    if (!url) {
      return sendError(res, 400, { message: 'url is required' });
    }
    const targetUrl = decodeURIComponent(url);
    const cacheKey = `${targetUrl}|${streamId}|${session}|${referer}`;
    manifestCache.delete(cacheKey);
    segmentCache.delete(cacheKey);

    const headers = buildRequestHeaders({
      refererHeader: decodeBase64Param(referer) || DEFAULT_REFERER,
      cookieHeader: decodeBase64Param(session) || ''
    });

    const response = await fetchUpstream(targetUrl, {
      responseType: 'text',
      transformResponse: [(data) => data],
      headers
    });

    manifestCache.set(cacheKey, {
      data: response.data,
      headers: response.headers,
      targetUrl,
      sessionToken: session,
      refererToken: referer,
      streamId
    });

    res.json({
      success: true,
      message: 'prewarm success'
    });
  } catch (error) {
    console.error('prewarm failed:', error.message);
    sendError(res, 500, { message: 'prewarm failed', error: error.message });
  }
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('Unhandled error:', err.message);
  sendError(res, 500, { message: 'internal server error', error: err.message });
});

app.listen(PORT, () => {
  console.log(`JRKAN edge proxy listening on port ${PORT}`);
});

