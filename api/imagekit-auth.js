// api/imagekit-auth.js — ImageKit Authentication Endpoint
// Vercel Serverless Function — repo'nun /api/ klasörüne koy

import crypto from 'crypto';

const IMAGEKIT_PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY;

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!IMAGEKIT_PRIVATE_KEY) {
    return res.status(500).json({ error: 'IMAGEKIT_PRIVATE_KEY tanımlı değil' });
  }

  const token = crypto.randomUUID();
  const expire = Math.floor(Date.now() / 1000) + 3600; // 1 saat geçerli
  const signature = crypto
    .createHmac('sha1', IMAGEKIT_PRIVATE_KEY)
    .update(token + expire)
    .digest('hex');

  return res.status(200).json({ token, expire, signature });
}
