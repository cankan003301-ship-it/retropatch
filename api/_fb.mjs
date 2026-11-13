// api/_fb.js — Firebase Admin (yalnızca sunucuda çalışır; "_" ile başlayan dosyalar endpoint olmaz)
// Vercel → Settings → Environment Variables:
//   FIREBASE_SERVICE_ACCOUNT = Firebase Console > Proje Ayarları > Hizmet Hesapları > "Yeni özel anahtar oluştur" ile inen JSON'un TAMAMI
import admin from 'firebase-admin';

export function fb() {
  if (globalThis.__RP_FB__) return globalThis.__RP_FB__;          // test için enjekte edilebilir
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT tanımlı değil');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  }
  return { db: admin.firestore(), auth: admin.auth(), FieldValue: admin.firestore.FieldValue };
}
