// api/urun.mjs — /urun/<ad>-<id> adresindeki ürün sayfasını sunucuda üretir (arama motorları için)
// vercel.json: { "source": "/urun/:slug", "destination": "/api/urun?slug=:slug" }
import { BASE, productPath, esc, img, allProducts } from './_seo.mjs';

const CAT_PAGES = [
  [['şapka', 'sapka', 'kep'], '/sapka.html'],
  [['tişört', 'tisort', 'sweatshirt'], '/tisort-sweatshirt.html'],
  [['çanta', 'canta', 'anahtarlık', 'anahtarlik'], '/canta-anahtarlik.html'],
];
function catHref(cat) {
  const c = String(cat || '').toLocaleLowerCase('tr');
  for (const [keys, href] of CAT_PAGES) if (keys.some(k => c.includes(k))) return href;
  return '/urunler.html?cat=' + encodeURIComponent(cat || '');
}

const AVAIL = { 'Tükendi': 'https://schema.org/OutOfStock', 'Son 3': 'https://schema.org/LimitedAvailability' };

function notFound(res) {
  res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60');
  res.end(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Ürün bulunamadı — RetroPatch</title>
<style>body{background:#0a0a0a;color:#e8e8e8;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;text-align:center}a{color:#c8a96e}</style><!-- Google tag (gtag.js) — izin modu: ziyaretçi çerez bildiriminde "Kabul" demeden analiz çerezi yazılmaz -->
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  (function(){var ok=null;try{ok=localStorage.getItem('rp_consent');}catch(e){}
    gtag('consent','default',{analytics_storage:ok==='granted'?'granted':'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});})();
  gtag('js', new Date());
  gtag('config', 'G-FYYNJKZTVL');
</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-FYYNJKZTVL"></script>
</head>
<body><div><h1>Ürün bulunamadı</h1><p>Bu ürün kaldırılmış olabilir. <a href="/urunler.html">Tüm ürünlere göz atın</a>.</p></div></body></html>`);
}

export default async function handler(req, res) {
  const slug = String(req.query.slug || '');
  const id = slug.slice(slug.lastIndexOf('-') + 1);
  if (!/^[A-Za-z0-9]{6,40}$/.test(id)) return notFound(res);

  let products;
  try { products = await allProducts(); }
  catch (e) { console.error('[urun]', e); res.status(503).setHeader('Retry-After', '60'); return res.end('Geçici hata'); }

  const p = products.find(x => x.id === id);
  if (!p) return notFound(res);

  // Ürün adı değiştiyse eski adres yeni adrese kalıcı yönlenir
  const path = productPath(p);
  if (`/urun/${slug}` !== path) { res.statusCode = 301; res.setHeader('Location', path); return res.end(); }

  const url = BASE + path;
  const price = parseFloat(p.price) || 0;
  const status = p.status || 'Stokta';
  const desc = String(p.desc || '').trim();
  const metaDesc = (desc ? desc.replace(/\s+/g, ' ').slice(0, 140) + ' · ' : `${p.name} — makine nakışı ile üretilmiş ${p.cat ? p.cat.toLocaleLowerCase('tr') + ' ' : ''}yama. `)
    + (price ? `₺${price}. ` : '') + 'Tek adetten sipariş, hızlı kargo.';
  const image = img(p.image, 1200) || `${BASE}/og-image.jpg`;
  const title = `${p.name}${/yama|patch/i.test(p.name) ? '' : ' Nakış Yama'} — RetroPatch`;
  const cHref = catHref(p.cat);

  const related = products
    .filter(x => x.id !== p.id && x.cat === p.cat)
    .sort((a, b) => (b.sales || 0) - (a.sales || 0))
    .slice(0, 8);

  // Google "Ürün snippet'leri": Product için offers (fiyat) ZORUNLU. Fiyatı olmayan ürünlerde
  // Product şeması hiç yazılmaz (kritik hata verir); yalnızca BreadcrumbList kalır.
  const priceValidUntil = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: desc || metaDesc,
    image: p.image ? [img(p.image, 1200)] : undefined,
    sku: p.id,
    category: p.cat || undefined,
    brand: { '@type': 'Brand', name: 'RetroPatch' },
    url,
    offers: {
      '@type': 'Offer',
      url,
      price: price.toFixed(2),
      priceCurrency: 'TRY',
      priceValidUntil,
      availability: AVAIL[status] || 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: 'RetroPatch' },
    },
  };
  const ld = [...(price > 0 ? [productLd] : []), {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: BASE + '/' },
      { '@type': 'ListItem', position: 2, name: p.cat || 'Ürünler', item: BASE + cHref },
      { '@type': 'ListItem', position: 3, name: p.name, item: url },
    ],
  }];
  const ldJson = JSON.stringify(ld).replace(/</g, '\\u003c');

  const specs = [
    p.cat && ['Kategori', p.cat],
    p.size && p.size.trim() !== 'cm' && ['Boyut', p.size],
    p.back && ['Arka yüzey', p.back],
    ['Stok', status],
  ].filter(Boolean);

  const shopHref = `/urunler.html#prod-${p.id}`;
  const wa = 'https://wa.me/905375295290?text=' + encodeURIComponent(`Merhaba, "${p.name}" ürünü hakkında bilgi almak istiyorum: ${url}`);

  const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(metaDesc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="product">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(metaDesc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:locale" content="tr_TR">
<meta property="og:site_name" content="RetroPatch">
${price ? `<meta property="product:price:amount" content="${price.toFixed(2)}">\n<meta property="product:price:currency" content="TRY">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(metaDesc)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#0a0a0a">
<link rel="preconnect" href="https://ik.imagekit.io">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@600;700&display=swap" rel="stylesheet">
<script type="application/ld+json">${ldJson}</script>
<style>
:root{--bg:#0a0a0a;--bg2:#121212;--bg3:#1a1a1a;--border:#262626;--text:#e8e8e8;--muted:#9a9a9a;--accent:#c8a96e}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:'Barlow',system-ui,sans-serif;line-height:1.6}
a{color:inherit}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 24px;border-bottom:1px solid var(--border)}
.top img{height:34px;width:auto;display:block}
.top nav{display:flex;gap:20px;font-family:'Barlow Condensed',sans-serif;font-weight:600;letter-spacing:1.5px;font-size:14px}
.top nav a{text-decoration:none;color:var(--muted);white-space:nowrap}.top nav a:hover{color:var(--accent)}
main{max-width:1120px;margin:0 auto;padding:24px}
.crumb{font-size:13px;color:var(--muted);margin-bottom:20px}
.crumb a{text-decoration:none}.crumb a:hover{color:var(--accent)}
.prod{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:start}
.pimg{background:var(--bg3);border:1px solid var(--border);border-radius:12px;overflow:hidden;aspect-ratio:1}
.pimg img{width:100%;height:100%;object-fit:cover;display:block}
.cat{font-family:'Barlow Condensed',sans-serif;letter-spacing:2px;text-transform:uppercase;color:var(--accent);font-size:13px}
h1{font-family:'Bebas Neue',sans-serif;font-weight:400;font-size:clamp(34px,5vw,52px);letter-spacing:1.5px;line-height:1.05;margin:6px 0 12px}
.price{font-family:'Bebas Neue',sans-serif;font-size:40px;color:var(--accent);letter-spacing:1px}
.badge{display:inline-block;margin-left:12px;padding:3px 10px;border:1px solid var(--border);border-radius:99px;font-size:12px;vertical-align:middle}
.badge.out{color:#e06c6c;border-color:#5a2a2a}
.desc{color:#cfcfcf;white-space:pre-line;margin:16px 0}
dl{display:grid;grid-template-columns:auto 1fr;gap:6px 18px;margin:18px 0;font-size:15px}
dt{color:var(--muted)}dd{margin:0}
.btns{display:flex;flex-wrap:wrap;gap:12px;margin-top:22px}
.btn{display:inline-flex;align-items:center;justify-content:center;padding:14px 22px;border-radius:10px;font-family:'Barlow Condensed',sans-serif;font-weight:700;letter-spacing:2px;font-size:15px;text-decoration:none}
.btn-p{background:var(--accent);color:#000}.btn-s{border:1px solid var(--border);color:var(--text)}
.btn-s:hover{border-color:var(--accent)}
.note{font-size:13px;color:var(--muted);margin-top:14px}
h2{font-family:'Bebas Neue',sans-serif;font-weight:400;letter-spacing:2px;font-size:32px;margin:56px 0 18px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.card{text-decoration:none;background:var(--bg2);border:1px solid var(--border);border-radius:10px;overflow:hidden;display:block}
.card:hover{border-color:var(--accent)}
.card img{width:100%;aspect-ratio:1;object-fit:cover;display:block;background:var(--bg3)}
.card div{padding:10px 12px;font-size:14px}.card b{display:block;color:var(--accent);font-weight:600}
footer{border-top:1px solid var(--border);margin-top:64px;padding:24px;text-align:center;font-size:13px;color:var(--muted)}
footer a{margin:0 8px;text-decoration:none}footer a:hover{color:var(--accent)}
@media (max-width:760px){.prod{grid-template-columns:1fr;gap:20px}.grid{grid-template-columns:repeat(2,1fr)}.top{padding:12px 16px}.top nav{gap:12px;font-size:13px}main{padding:16px}.top img{height:28px;width:auto}}
@media (max-width:420px){.hide-s{display:none}}
</style>
</head>
<body>
<header class="top">
  <a href="/" aria-label="RetroPatch ana sayfa"><img src="/retro_logo.png" alt="RetroPatch" width="164" height="34"></a>
  <nav><a href="/urunler.html">ÜRÜNLER</a><a href="/#siparis" class="hide-s">ÖZEL SİPARİŞ</a><a href="/sepet.html">SEPET</a></nav>
</header>
<main>
  <nav class="crumb" aria-label="Sayfa yolu"><a href="/">Ana Sayfa</a> › <a href="${esc(cHref)}">${esc(p.cat || 'Ürünler')}</a> › <span>${esc(p.name)}</span></nav>
  <article class="prod">
    <div class="pimg">${p.image ? `<img src="${esc(img(p.image, 900))}" alt="${esc(p.name)} nakış yama" width="900" height="900" fetchpriority="high">` : ''}</div>
    <div>
      ${p.cat ? `<div class="cat">${esc(p.cat)}</div>` : ''}
      <h1>${esc(p.name)}</h1>
      <div><span class="price">${price ? '₺' + esc(price) : 'Fiyat için yazın'}</span><span class="badge${status === 'Tükendi' ? ' out' : ''}">${esc(status)}</span></div>
      ${desc ? `<p class="desc">${esc(desc)}</p>` : ''}
      <dl>${specs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="btns">
        <a class="btn btn-p" href="${esc(shopHref)}">${status === 'Tükendi' ? 'ÜRÜNÜ İNCELE' : 'SEPETE EKLE'}</a>
        <a class="btn btn-s" href="${esc(wa)}" target="_blank" rel="noopener">WHATSAPP'TAN SOR</a>
      </div>
      <p class="note">Arka yüzey (ütüyle / cırt cırt) ve boyut seçeneklerini sepete eklerken seçebilirsiniz. Kendi tasarımınız için <a href="/#siparis">özel sipariş</a> verebilirsiniz.</p>
    </div>
  </article>
  ${related.length ? `<section><h2>Benzer Ürünler</h2><div class="grid">${related.map(r => `
    <a class="card" href="${esc(productPath(r))}"><img src="${esc(img(r.image, 400))}" alt="${esc(r.name)}" loading="lazy" decoding="async" width="400" height="400"><div>${esc(r.name)}${r.price ? `<b>₺${esc(r.price)}</b>` : ''}</div></a>`).join('')}
  </div></section>` : ''}
</main>
<footer>
  <a href="/urunler.html">Tüm Ürünler</a><a href="/dijital-dosyalar.html">Dijital Dosyalar</a><a href="/yasal.html#sozlesme">Mesafeli Satış Sözleşmesi</a><a href="/yasal.html#iade">İade</a><a href="/yasal.html#kvkk">KVKK</a>
  <p>RetroPatch · Mersin</p>
</footer>
<!-- Cloudflare Web Analytics (çerezsiz) --><script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "ede77b3777cb4744873f2ed46976f3a1"}'></script><!-- End Cloudflare Web Analytics -->
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
  res.status(200).end(html);
}
