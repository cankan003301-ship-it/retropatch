// api/_fb.js — Firebase Admin (yalnızca sunucuda çalışır; "_" ile başlayan dosyalar endpoint olmaz)
// Vercel → Settings → Environment Variables:
//   FIREBASE_SERVICE_ACCOUNT = Firebase Console > Proje Ayarları > Hizmet Hesapları > "Yeni özel anahtar oluştur" ile inen JSON'un TAMAMI
import admin from 'firebase-admin';

export function cfgErr(msg) { const e = new Error(msg); e.cfg = true; return e; }

function parseSA(raw) {
  let t = String(raw).replace(/^\uFEFF/, '').trim();
  const tries = [];
  // dıştaki tırnakları at ("{...}" veya '{...}')
  if (/^(["']).*\1$/s.test(t)) t = t.slice(1, -1).trim();
  tries.push(t);
  if (t.charAt(0) !== '{') { tries.push('{' + t); tries.push('{"' + t); }   // baştaki { veya {" yapıştırılırken kaybolmuşsa
  if (t.charAt(t.length - 1) !== '}') tries.push(t + '}');
  tries.push(t.replace(/\\"/g, '"'));                       // \" ile kaçırılmış yapıştırma
  tries.push(t.replace(/\r?\n/g, '\\n'));                    // satır sonları gerçek yeni satır olarak girilmişse
  try { tries.push(Buffer.from(t, 'base64').toString('utf8')); } catch (e) {}
  for (const c of tries) {
    try { const o = JSON.parse(c); if (o && typeof o === 'object' && o.private_key) return o; } catch (e) {}
  }
  const first = t.charAt(0), last = t.charAt(t.length - 1);
  const hint = first !== '{' ? 'başı "' + first + '" ile başlıyor ({ olmalı)' : last !== '}' ? 'sonu "' + last + '" ile bitiyor (} olmalı, dosya yarım yapıştırılmış)' : !/private_key/.test(t) ? 'private_key alanı yok' : 'içerik bozuk';
  throw cfgErr('Sunucu ayarı hatalı: FIREBASE_SERVICE_ACCOUNT okunamadı — ' + hint + ' · uzunluk ' + t.length + ' karakter (tam dosya yaklaşık 2300)');
}

export function fb() {
  if (globalThis.__RP_FB__) return globalThis.__RP_FB__;          // test için enjekte edilebilir
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw cfgErr('Sunucu ayarı eksik: Vercel\'de FIREBASE_SERVICE_ACCOUNT tanımlı değil');
    const sa = parseSA(raw);
    if (sa.private_key) sa.private_key = String(sa.private_key).replace(/\\n/g, '\n');
    try { admin.initializeApp({ credential: admin.credential.cert(sa) }); }
    catch (e) { throw cfgErr('Sunucu ayarı hatalı: FIREBASE_SERVICE_ACCOUNT anahtarı okunamadı (' + e.message.slice(0, 80) + ')'); }
    if (sa.project_id && sa.project_id !== 'retropatch-fd08e')
      console.error('[fb] UYARI: servis hesabı projesi', sa.project_id, '≠ retropatch-fd08e');
  }
  return { db: admin.firestore(), auth: admin.auth(), FieldValue: admin.firestore.FieldValue };
}
