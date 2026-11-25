import crypto from 'node:crypto';

function getS3Config() {
  const endpoint = (process.env.AWS_ENDPOINT_URL_S3 || '').replace(/\/+$/, '');
  const region = process.env.AWS_REGION || 'eu-central-1';
  const bucket = process.env.NEON_S3_BUCKET || 'philab26';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
  return { endpoint, region, bucket, accessKeyId, secretAccessKey };
}

export function isS3Configured() {
  const cfg = getS3Config();
  return Boolean(cfg.endpoint && cfg.accessKeyId && cfg.secretAccessKey);
}

function hmac(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest();
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function amzDates(d = new Date()) {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function encodeRfc3986(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function encodePathSegments(p) {
  return p.split('/').map((s) => encodeRfc3986(s)).join('/');
}

function getSigningKey(secretKey, dateStamp, region, service) {
  return hmac(hmac(hmac(hmac('AWS4' + secretKey, dateStamp), region), service), 'aws4_request');
}

function safeFileName(name, fallback = 'file.bin') {
  const clean = String(name || fallback).replace(/[^a-zA-Z0-9._-]+/g, '_');
  return clean.slice(-80) || fallback;
}

export async function uploadBuffer(key, body, contentType = 'application/octet-stream') {
  const cfg = getS3Config();
  if (!cfg.endpoint || !cfg.accessKeyId || !cfg.secretAccessKey) {
    throw new Error('Neon S3 Object Storage is not configured');
  }
  const host = new URL(cfg.endpoint).host;
  const canonicalUri = `/${cfg.bucket}/${encodePathSegments(key)}`;
  const { amzDate, dateStamp } = amzDates();
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const payloadHash = sha256Hex(payload);

  const headersToSign = {
    host,
    'content-type': contentType,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const sortedKeys = Object.keys(headersToSign).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${headersToSign[k]}\n`).join('');
  const signedHeaders = sortedKeys.join(';');
  const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256Hex(canonicalRequest)}`;
  const signingKey = getSigningKey(cfg.secretAccessKey, dateStamp, cfg.region, 's3');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const res = await fetch(`${cfg.endpoint}${canonicalUri}`, {
    method: 'PUT',
    headers: {
      'content-type': contentType,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: payload,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Neon S3 upload failed HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  return { key, bucket: cfg.bucket, size: payload.length, contentType };
}

export async function uploadDataUrl(keyPrefix, fileName, dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;
  const contentType = match[1] || 'application/octet-stream';
  const buffer = Buffer.from(match[2], 'base64');
  const key = `${keyPrefix.replace(/^\/+|\/+$/g, '')}/${Date.now()}_${safeFileName(fileName)}`;
  return uploadBuffer(key, buffer, contentType);
}

export function getPresignedUrl(key, expiresIn = 3600) {
  const cfg = getS3Config();
  if (!key || !cfg.endpoint || !cfg.accessKeyId || !cfg.secretAccessKey) return '';
  const host = new URL(cfg.endpoint).host;
  const canonicalUri = `/${cfg.bucket}/${encodePathSegments(key)}`;
  const { amzDate, dateStamp } = amzDates();
  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const qp = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${cfg.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expiresIn)],
    ['X-Amz-SignedHeaders', 'host'],
  ].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const canonicalQuery = qp.map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`).join('&');
  const canonicalRequest = `GET\n${canonicalUri}\n${canonicalQuery}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256Hex(canonicalRequest)}`;
  const signingKey = getSigningKey(cfg.secretAccessKey, dateStamp, cfg.region, 's3');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return `${cfg.endpoint}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export function getPresignedPutUrl(key, contentType = 'application/octet-stream', expiresIn = 1800) {
  const cfg = getS3Config();
  if (!key || !cfg.endpoint || !cfg.accessKeyId || !cfg.secretAccessKey) return '';
  const host = new URL(cfg.endpoint).host;
  const canonicalUri = `/${cfg.bucket}/${encodePathSegments(key)}`;
  const { amzDate, dateStamp } = amzDates();
  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const qp = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${cfg.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expiresIn)],
    ['X-Amz-SignedHeaders', 'content-type;host'],
  ].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const canonicalQuery = qp.map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`).join('&');
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const canonicalRequest = `PUT\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\ncontent-type;host\nUNSIGNED-PAYLOAD`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256Hex(canonicalRequest)}`;
  const signingKey = getSigningKey(cfg.secretAccessKey, dateStamp, cfg.region, 's3');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return `${cfg.endpoint}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export function buildSafeObjectKey(prefix, fileName) {
  const cleanPrefix = String(prefix || 'uploads').replace(/^\/+|\/+$/g, '').replace(/\.\./g, '');
  return `${cleanPrefix}/${Date.now()}_${safeFileName(fileName)}`;
}

export function getPermanentAssetUrl(key, baseOrigin = 'https://penelope-inc.vercel.app') {
  if (!key) return '';
  return `${baseOrigin.replace(/\/+$/, '')}/api/relay?channel=asset&key=${encodeURIComponent(key)}`;
}
