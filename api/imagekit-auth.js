// api/imagekit-auth.js — ImageKit Authentication Endpoint
// Vercel Serverless Function — repo'nun /api/ klasörüne koy

import crypto from 'crypto';

const IMAGEKIT_PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://retropatch.vercel.app';

// Basit in-memory rate limiter (IP başına dakikada maks 10 istek)
const rateLimitMap = new Map();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 1000;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };

  if (now - entry.start > RATE_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return false;
  }

  if (entry.count >= RATE_LIMIT) return true;

  entry.count++;
  rateLimitMap.set(ip, entry);
  return false;
}

export default function handler(req, res) {
  // CORS — sadece kendi domain'e izin ver
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Sadece GET kabul et
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Origin kontrolü
  const origin = req.headers.origin || '';
  if (origin && origin !== ALLOWED_ORIGIN) {
    return res.status(403).json({ error: 'Yetkisiz kaynak' });
  }

  // Rate limit kontrolü
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Çok fazla istek, lütfen bekleyin' });
  }

  if (!IMAGEKIT_PRIVATE_KEY) {
    return res.status(500).json({ error: 'IMAGEKIT_PRIVATE_KEY tanımlı değil' });
  }

  const token = crypto.randomUUID();
  const expire = Math.floor(Date.now() / 1000) + 1800; // 30 dakika geçerli
  const signature = crypto
    .createHmac('sha1', IMAGEKIT_PRIVATE_KEY)
    .update(token + expire)
    .digest('hex');

  return res.status(200).json({ token, expire, signature });
}
