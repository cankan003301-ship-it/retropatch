// api/_fb.js — Firebase Admin (yalnızca sunucuda çalışır; "_" ile başlayan dosyalar endpoint olmaz)
// Vercel → Settings → Environment Variables:
//   FIREBASE_SERVICE_ACCOUNT = Firebase Console > Proje Ayarları > Hizmet Hesapları > "Yeni özel anahtar oluştur" ile inen JSON'un TAMAMI
import admin from 'firebase-admin';

export function cfgErr(msg) { const e = new Error(msg); e.cfg = true; return e; }

export function fb() {
  if (globalThis.__RP_FB__) return globalThis.__RP_FB__;          // test için enjekte edilebilir
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw cfgErr('Sunucu ayarı eksik: Vercel\'de FIREBASE_SERVICE_ACCOUNT tanımlı değil');
    let sa;
    try { sa = JSON.parse(raw); } catch (e) { throw cfgErr('Sunucu ayarı hatalı: FIREBASE_SERVICE_ACCOUNT geçerli bir JSON değil (indirilen dosyanın TAMAMINI yapıştır)'); }
    if (sa.private_key) sa.private_key = String(sa.private_key).replace(/\\n/g, '\n');
    try { admin.initializeApp({ credential: admin.credential.cert(sa) }); }
    catch (e) { throw cfgErr('Sunucu ayarı hatalı: FIREBASE_SERVICE_ACCOUNT anahtarı okunamadı (' + e.message.slice(0, 80) + ')'); }
    if (sa.project_id && sa.project_id !== 'retropatch-fd08e')
      console.error('[fb] UYARI: servis hesabı projesi', sa.project_id, '≠ retropatch-fd08e');
  }
  return { db: admin.firestore(), auth: admin.auth(), FieldValue: admin.firestore.FieldValue };
}
