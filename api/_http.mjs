// api/_http.mjs — ortak yardımcılar (endpoint değildir)
import { fb } from './_fb.mjs';
import { HttpError, GROUP_RE } from './_pay.mjs';

export function sendErr(res, e) {
  const status = e instanceof HttpError ? e.status : 500;
  if (status === 500) console.error('[pay]', e);
  res.status(status).json({ error: status === 500 ? 'Sunucu hatası' : e.message });
}
// Giriş yapmış üyenin kimliğini doğrular (Authorization: Bearer <Firebase ID token>)
export async function authUid(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) throw new HttpError(401, 'Giriş gerekli');
  try { return (await fb().auth.verifyIdToken(m[1])).uid; }
  catch (e) { throw new HttpError(401, 'Oturum doğrulanamadı'); }
}
export function groupOf(body) {
  const g = body && body.group;
  if (typeof g !== 'string' || !GROUP_RE.test(g)) throw new HttpError(400, 'Geçersiz sipariş grubu');
  return g;
}
export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '1.1.1.1').split(',')[0].trim();
}
export function bodyOf(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = Object.fromEntries(new URLSearchParams(b)); } }
  return b || {};
}
