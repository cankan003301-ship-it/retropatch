// api/_dolap.mjs — Admin: Dolap profilindeki ilanları sunucudan çeker (yer imi / pano gerekmez).
// GET /api/track?dolap=1&limit=30   Authorization: Bearer <admin Firebase ID token>
// Cevap: { rows: [{ baslik, fiyat_tl, gorseller, aciklama, dolap_id, tur }], total }
import { fb } from './_fb.mjs';

const ADMIN_EMAILS = ['retropatchyama@gmail.com', 'admin@retropatch.com'];
const PROFILE = 'https://dolap.com/profil/retropatch';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'", nbsp: ' ' };
const dec = s => String(s || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, k) => ENT[k.toLowerCase()] ?? (k[0] === '#' ? String.fromCodePoint(k[1] === 'x' || k[1] === 'X' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10)) : m));
const big = u => String(u || '').replace(/\/mnresize\/\d+\/\d+/, '');

async function get(url, ms) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'tr-TR,tr;q=0.9', Accept: 'text/html' }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error('Dolap ' + r.status);
  return r.text();
}

function parseList(h) {
  const out = new Map();
  const arts = h.split('<article').slice(1);
  for (const a of arts) {
    const href = (a.match(/href="(https:\/\/dolap\.com\/urun\/[^"]*?-(\d+))"/) || []);
    if (!href[1]) continue;
    const id = href[2];
    if (out.has(id)) continue;
    const name = dec((a.match(/<p[^>]*>([^<]+)<\/p>/) || [])[1] || (a.match(/aria-label="([^"]+)"/) || [])[1] || '').trim();
    const price = parseInt(((a.match(/>\s*([\d.]+)\s*TL\s*</) || [])[1] || '').replace(/\./g, ''), 10) || 0;
    const img = big((a.match(/<img[^>]*src="([^"]+)"/) || [])[1] || '');
    if (name) out.set(id, { url: href[1], id, name, price, img });
  }
  return [...out.values()];
}

function parseProduct(h) {
  const res = {};
  for (const m of h.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const j = JSON.parse(m[1]);
      for (const x of (Array.isArray(j) ? j : [j])) if (x && x['@type'] === 'Product') {
        res.desc = x.description || ''; res.images = (Array.isArray(x.image) ? x.image : [x.image]).filter(Boolean);
        if (x.offers && x.offers.price) res.price = Number(x.offers.price);
        res.sold = /OutOfStock|SoldOut/i.test((x.offers && x.offers.availability) || '');
      }
    } catch (e) {}
  }
  if (!res.desc) res.desc = dec((h.match(/<meta property="og:description" content="([^"]*)"/) || [])[1] || '');
  return res;
}

export async function dolapFetch(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!m) return res.status(401).json({ error: 'Giriş gerekli' });
    let u; try { u = await fb().auth.verifyIdToken(m[1]); } catch (e) { return res.status(401).json({ error: 'Oturum doğrulanamadı' }); }
    if (!ADMIN_EMAILS.includes(u.email)) return res.status(403).json({ error: 'Yetkisiz' });

    const limit = Math.max(1, Math.min(60, parseInt(req.query.limit, 10) || 30));
    let list;
    try { list = parseList(await get(PROFILE, 8000)); }
    catch (e) { return res.status(502).json({ error: 'Dolap sayfası açılamadı (' + e.message + '). Yer imi yöntemini kullanın.' }); }
    if (!list.length) return res.status(502).json({ error: 'Dolap sayfasında ilan bulunamadı; sayfa yapısı değişmiş olabilir. Yer imi yöntemini kullanın.' });
    list = list.slice(0, limit);

    // Ürün sayfalarından açıklama + büyük görsel (6'şar paralel, toplam süre sınırlı)
    const t0 = Date.now();
    for (let i = 0; i < list.length; i += 6) {
      if (Date.now() - t0 > 7000) break;
      await Promise.all(list.slice(i, i + 6).map(async p => {
        try { const d = parseProduct(await get(p.url, 4000)); p.desc = d.desc; if (d.images && d.images.length) p.images = d.images.map(big); if (d.price) p.price = d.price; p.sold = d.sold; } catch (e) {}
      }));
    }
    const rows = list.filter(p => !p.sold && !/^özel ilan$/i.test(p.name.trim())).map(p => ({
      baslik: p.name, fiyat_tl: p.price, gorseller: (p.images && p.images.length ? p.images : [p.img]).filter(Boolean).join('|'),
      aciklama: String(p.desc || '').replace(/\\n/g, '\n').replace(/Lütfen bu ürünü almayınız.*/s, '').trim(), dolap_id: p.id, tur: 'Yama'
    }));
    res.status(200).json({ rows, total: rows.length, withDesc: list.filter(p => p.desc).length });
  } catch (e) { console.error('[dolap]', e); res.status(500).json({ error: 'Sunucu hatası' }); }
}
