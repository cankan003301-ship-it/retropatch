// api/sitemap.mjs — /sitemap.xml: sabit sayfalar + Firestore'daki tüm ürün sayfaları
// vercel.json: { "source": "/sitemap.xml", "destination": "/api/sitemap" }
import { BASE, productPath, esc, img, allProducts } from './_seo.mjs';

const STATIC = [
  ['/', 'weekly', '1.0'],
  ['/urunler.html', 'daily', '0.9'],
  ['/dijital-dosyalar.html', 'weekly', '0.8'],
  ['/sapka.html', 'weekly', '0.7'],
  ['/canta-anahtarlik.html', 'weekly', '0.7'],
  ['/tisort-sweatshirt.html', 'weekly', '0.7'],
  ['/rehber.html', 'monthly', '0.8'],
  ['/ozel-nakis-arma.html', 'monthly', '0.8'],
  ['/kisiye-ozel-yama.html', 'monthly', '0.8'],
  ['/logolu-arma.html', 'monthly', '0.8'],
  ['/cirtli-arma.html', 'monthly', '0.8'],
  ['/utuyle-yapisan-arma.html', 'monthly', '0.8'],
  ['/nakis-arma-fiyatlari.html', 'weekly', '0.8'],
  ['/toplu-arma-uretimi.html', 'monthly', '0.8'],
  ['/nakis-yama-nasil-yapilir.html', 'monthly', '0.7'],
  ['/takip.html', 'monthly', '0.3'],
  ['/yasal.html', 'yearly', '0.2'],
];

export default async function handler(req, res) {
  let products = [];
  try { products = await allProducts(); }
  catch (e) { console.error('[sitemap]', e); }   // ürünler okunamazsa en azından sabit sayfaları ver

  const day = d => (d && d.toDate ? d.toDate() : new Date()).toISOString().slice(0, 10);
  const urls = [
    ...STATIC.map(([p, f, pr]) => `<url><loc>${BASE}${p}</loc><changefreq>${f}</changefreq><priority>${pr}</priority></url>`),
    ...products.map(p => `<url><loc>${esc(BASE + productPath(p))}</loc>${p.createdAt ? `<lastmod>${day(p.createdAt)}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>0.8</priority>`
      + (p.image ? `<image:image><image:loc>${esc(img(p.image, 1200))}</image:loc></image:image>` : '') + '</url>'),
  ];

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', `public, s-maxage=${products.length ? 3600 : 60}, stale-while-revalidate=86400`);
  res.status(200).end(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join('\n')}
</urlset>
`);
}
