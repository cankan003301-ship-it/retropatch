// api/_seo.mjs — ürün sayfaları ve site haritası için ortak yardımcılar (endpoint değildir)
import { fb } from './_fb.mjs';

export const BASE = 'https://retropatch.vercel.app';

const TR = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

// "Attack On Titan Keşif Birliği" -> "attack-on-titan-kesif-birligi"
// Aynı fonksiyon urunler.html ve kategori sayfalarında (rpSlug) da var; ikisi aynı kalmalı.
export function slugify(s) {
  return String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/[çğıiöşüâîû]/g, c => TR[c] || c)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'urun';
}

export const productPath = p => `/urun/${slugify(p.name)}-${p.id}`;

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ImageKit adreslerine boyut/format dönüşümü ekler
export function img(url, w) {
  if (!url) return '';
  if (!/ik\.imagekit\.io/.test(url)) return url;
  return url + (url.includes('?') ? '&' : '?') + `tr=w-${w},q-80,f-auto`;
}

// Sıcak fonksiyon örneklerinde Firestore okumalarını azaltmak için kısa önbellek
let cache = { at: 0, list: null };
export async function allProducts() {
  if (cache.list && Date.now() - cache.at < 5 * 60 * 1000) return cache.list;
  const snap = await fb().db.collection('products').get();
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.name);
  cache = { at: Date.now(), list };
  return list;
}
