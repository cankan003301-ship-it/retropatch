/* RetroPatch — Mağaza ürün penceresi ekleri (urunler, sapka, tisort-sweatshirt, canta-anahtarlik)
   Çoklu fotoğraf + yakınlaştırma, ölçü görseli, standart ürün bilgisi, benzer ürünler, set, stok görünürlüğü.
   Sayfanın kendi openModal/renderGrid/openLB fonksiyonlarını sarar; duyuru.js'ten SONRA yüklenmeli. */
(function () {
  'use strict';
  if (typeof openModal !== 'function' || typeof allProducts === 'undefined') return;

  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var money = function (v) { return '₺' + (Number(v) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 }); };
  var prods = function () { try { return allProducts || []; } catch (e) { return []; } };
  var cur = function () { try { return currentProduct; } catch (e) { return null; } };
  var isOut = function (p) { return p && p.status === 'Tükendi'; };
  var thumb = function (u, w) { u = String(u || ''); return /ik\.imagekit\.io/.test(u) && u.indexOf('?') < 0 ? u + '?tr=w-' + (w || 300) : u; };

  /* ───────── CSS ───────── */
  var st = document.createElement('style');
  st.textContent = [
    '.rp-thumbs{display:flex;gap:6px;padding:8px;background:var(--bg2,#111);overflow-x:auto;cursor:default}',
    '.rp-thumbs img{width:56px!important;height:56px!important;max-height:none!important;object-fit:cover!important;border:2px solid transparent;opacity:.65;cursor:pointer;flex:0 0 auto;transform:none!important}',
    '.rp-thumbs img.on{border-color:var(--accent,#c8a96e);opacity:1}',
    '#modalImg .rp-main{transition:transform .15s ease-out;will-change:transform}',
    '#modalImg.rp-zooming .modal-zoom-hint{opacity:0}',
    '.rp-stock{display:flex;align-items:center;gap:8px;margin:2px 0 10px;font-family:"Barlow Condensed",sans-serif;font-weight:700;letter-spacing:1px;font-size:14px}',
    '.rp-stock i{width:10px;height:10px;border-radius:50%;display:inline-block}',
    '.rp-stock.ok{color:#2ecc71}.rp-stock.ok i{background:#2ecc71;box-shadow:0 0 0 4px rgba(46,204,113,.15)}',
    '.rp-stock.low{color:#f39c12}.rp-stock.low i{background:#f39c12;box-shadow:0 0 0 4px rgba(243,156,18,.18);animation:rpPulse 1.4s infinite}',
    '.rp-stock.out{color:#e63946}.rp-stock.out i{background:#e63946}',
    '.rp-stock small{font-family:"Barlow",sans-serif;font-weight:400;letter-spacing:0;color:var(--muted,#888);font-size:12px}',
    '@keyframes rpPulse{50%{box-shadow:0 0 0 7px rgba(243,156,18,0)}}',
    '.modal-order-btn.rp-dis{background:#333!important;color:#888!important;cursor:not-allowed}',
    '.rp-sec{margin-top:16px;border-top:1px solid var(--border,#2a2a2a);padding-top:14px}',
    '.rp-sec>b{display:block;font-family:"Barlow Condensed",sans-serif;font-size:11px;letter-spacing:2.5px;color:var(--accent,#c8a96e);margin-bottom:10px}',
    '.rp-info{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:12px}',
    '.rp-info dt{color:var(--muted,#888);font-family:"Barlow Condensed",sans-serif;letter-spacing:1px;font-size:11px;text-transform:uppercase;padding-top:1px}',
    '.rp-info dd{margin:0;color:var(--text,#ddd);line-height:1.5}',
    '.rp-size>svg{width:100%;max-width:340px;display:block}',
    '.rp-size div{font-size:11px;color:var(--muted,#888);margin-top:4px}',
    '#modalOverlay .modal-body,#modalOverlay .modal-img,#rpExtra{min-width:0;max-width:100%}',
    '.rp-sim{max-width:100%;display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;scroll-snap-type:x mandatory}',
    '.rp-sim a{flex:0 0 118px;scroll-snap-align:start;background:var(--bg3,#1a1a1a);border:1px solid var(--border,#2a2a2a);text-decoration:none;color:var(--text,#ddd);cursor:pointer;position:relative}',
    '.rp-sim a:hover{border-color:var(--accent,#c8a96e)}',
    '.rp-sim img{width:100%;height:100px;object-fit:cover;display:block;background:#222}',
    '.rp-sim span{display:block;font-size:11px;line-height:1.3;padding:6px 7px 2px;height:30px;overflow:hidden}',
    '.rp-sim em{display:block;font-style:normal;color:var(--accent,#c8a96e);font-weight:700;font-size:12px;padding:2px 7px 7px}',
    '.rp-sim .so{position:absolute;top:6px;left:6px;background:#e63946;color:#fff;font-size:9px;padding:2px 6px;letter-spacing:1px}',
    '.rp-set{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
    '.rp-set img{width:64px;height:64px;object-fit:cover;border:1px solid var(--border,#2a2a2a);background:#222}',
    '.rp-set .pl{color:var(--muted,#888);font-size:18px}',
    '.rp-set-f{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;flex-wrap:wrap}',
    '.rp-set-f div{font-size:12px;color:var(--muted,#888)}.rp-set-f div b{color:var(--text,#ddd);font-size:15px}',
    '.rp-set-f button{background:var(--accent,#c8a96e);color:#000;border:0;padding:10px 16px;font-family:"Barlow Condensed",sans-serif;font-weight:700;letter-spacing:1.5px;font-size:13px;cursor:pointer}',
    '.rp-set-c{margin-top:8px;font-size:12px;color:#2ecc71}',
    /* kartlar */
    '.product-card .rp-rib{position:absolute;top:10px;left:10px;z-index:3;font-family:"Barlow Condensed",sans-serif;font-weight:800;letter-spacing:1.5px;font-size:11px;padding:4px 9px}',
    '.product-card .rp-rib.low{background:#f39c12;color:#000}',
    '.product-card .rp-rib.out{background:#e63946;color:#fff}',
    '.product-card[data-stock=out] .product-img img{filter:grayscale(1);opacity:.45}',
    '.product-card[data-stock=out] button[onclick*="rpQuickAdd"]{background:#2a2a2a!important;color:#777!important;cursor:not-allowed}',
    '.product-card .rp-more{position:absolute;bottom:10px;right:10px;z-index:3;background:rgba(0,0,0,.7);color:#fff;font-size:10px;padding:3px 7px;letter-spacing:1px}',
    '.product-img{position:relative}',
    /* lightbox */
    '#lightbox .lb-img-wrap{overflow:hidden;position:relative}',
    '#lbImg{transition:transform .2s;cursor:zoom-in;touch-action:none}',
    '#lbImg.rp-z{transform:scale(2.5);cursor:zoom-out}',
    '.rp-lbn{position:absolute;top:50%;transform:translateY(-50%);z-index:5;background:rgba(0,0,0,.6);color:#fff;border:1px solid #444;width:42px;height:56px;font-size:24px;cursor:pointer}',
    '.rp-lbn.p{left:8px}.rp-lbn.n{right:8px}',
    '.rp-lbh{text-align:center;font-size:11px;color:#888;margin-top:6px;letter-spacing:1px}'
  ].join('');
  document.head.appendChild(st);

  /* ───────── Galeri ───────── */
  var gal = [], gi = 0;
  function imagesOf(p) {
    var a = [p.image].concat(Array.isArray(p.images) ? p.images : []).filter(function (u) { return u && /^https?:\/\//.test(u); });
    return a.filter(function (u, i) { return a.indexOf(u) === i; });
  }
  function showImg(i) {
    gi = (i + gal.length) % gal.length;
    var m = document.querySelector('#modalImg img.rp-main'); if (m) m.src = gal[gi];
    document.querySelectorAll('.rp-thumbs img').forEach(function (t, k) { t.classList.toggle('on', k === gi); });
  }
  function setupGallery(p) {
    var box = document.getElementById('modalImg'); if (!box) return;
    gal = imagesOf(p); gi = 0;
    var main = box.querySelector('img'); if (!main) return;
    main.classList.add('rp-main');
    if (gal.length > 1) {
      var th = document.createElement('div'); th.className = 'rp-thumbs';
      th.innerHTML = gal.map(function (u, k) { return '<img src="' + esc(thumb(u, 150)) + '" data-k="' + k + '"' + (k ? '' : ' class="on"') + ' alt="">'; }).join('');
      th.addEventListener('click', function (e) { e.stopPropagation(); var k = e.target.getAttribute && e.target.getAttribute('data-k'); if (k != null) showImg(+k); });
      box.appendChild(th);
      var hh = box.querySelector('.modal-zoom-hint'); if (hh) { hh.style.top = '10px'; hh.style.bottom = 'auto'; }
    }
    // masaüstünde fareyle yakınlaştırma
    if (window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches) {
      main.addEventListener('mousemove', function (e) {
        var r = main.getBoundingClientRect();
        main.style.transformOrigin = ((e.clientX - r.left) / r.width * 100) + '% ' + ((e.clientY - r.top) / r.height * 100) + '%';
        main.style.transform = 'scale(2.2)'; box.classList.add('rp-zooming');
      });
      main.addEventListener('mouseleave', function () { main.style.transform = ''; box.classList.remove('rp-zooming'); });
      var hint = box.querySelector('.modal-zoom-hint'); if (hint) hint.innerHTML = '🔍 Üzerine gel: yakınlaştır · Tıkla: tam ekran';
    }
  }

  /* ───────── Ölçü görseli ───────── */
  function parseSize(s) {
    var n = (String(s || '').replace(',', '.').match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(function (x) { return x > 0 && x < 100; });
    if (!n.length) return null;
    return { w: n[0], h: n[1] || n[0] };
  }
  function sizeViz(p) {
    var z = parseSize(p.size); if (!z) return '';
    var S = Math.min(10, 150 / Math.max(z.w, z.h, 8.56)), base = Math.max(z.h, 8.4) * S + 12, W = z.w * S, H = z.h * S;
    var cx = 10 + W + 22;
    var svg = '<svg viewBox="0 0 ' + Math.ceil(cx + 8.56 * S + 12) + ' ' + Math.ceil(base + 22) + '" font-family="Barlow Condensed,Arial,sans-serif">' +
      '<rect x="10" y="' + (base - H) + '" width="' + W + '" height="' + H + '" rx="' + Math.min(W, H) * .1 + '" fill="rgba(200,169,110,.15)" stroke="#c8a96e" stroke-width="2" stroke-dasharray="4 2"/>' +
      '<text x="' + (10 + W / 2) + '" y="' + (base - H / 2 + 4) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#c8a96e">' + z.w + (z.h !== z.w ? '×' + z.h : '') + ' cm</text>' +
      '<line x1="10" y1="' + (base + 8) + '" x2="' + (10 + W) + '" y2="' + (base + 8) + '" stroke="#666"/><text x="' + (10 + W / 2) + '" y="' + (base + 19) + '" text-anchor="middle" font-size="9" fill="#888">' + z.w + ' cm</text>' +
      '<rect x="' + cx + '" y="' + (base - 5.4 * S) + '" width="' + 8.56 * S + '" height="' + 5.4 * S + '" rx="4" fill="#2a4365" stroke="#4a6fa5"/><rect x="' + (cx + 1.2 * S) + '" y="' + (base - 5.4 * S + 1.6 * S) + '" width="' + 1.1 * S + '" height="' + .85 * S + '" rx="1" fill="#d4af37"/>' +
      '<text x="' + (cx + 4.28 * S) + '" y="' + (base + 12) + '" text-anchor="middle" font-size="9" fill="#888">Kredi kartı 8,6×5,4 cm</text>' +
      '<circle cx="' + (cx + 8.56 * S - 1.3 * S) + '" cy="' + (base - 5.4 * S - 1.3 * S - 6) + '" r="' + 1.3 * S + '" fill="#b8a46a" stroke="#8a7a45"/><text x="' + (cx + 8.56 * S - 2.6 * S - 6) + '" y="' + (base - 5.4 * S - 1.3 * S - 3) + '" text-anchor="end" font-size="9" fill="#888">1 TL</text>' +
      '</svg>';
    return '<div class="rp-sec rp-size"><b>📏 GERÇEK BOYUT KARŞILAŞTIRMASI</b>' + svg + '<div>Oranlar gerçek ölçülere göre çizilmiştir.</div></div>';
  }

  /* ───────── Standart ürün bilgisi ───────── */
  function infoBlock(p) {
    var cat = String(p.cat || ''), patch = !/tişört|tisort|sweat|şapka|sapka|çanta|canta|anahtar/i.test(cat);
    var z = parseSize(p.size);
    var rows = [
      ['Ölçü', z ? z.w + (z.h !== z.w ? ' × ' + z.h : '') + ' cm (en uzun kenar ' + Math.max(z.w, z.h) + ' cm)' : esc(p.size || '—')],
      ['Teknik', patch ? 'Makine nakışı, kenarları overlok/saten dikişle bitirilmiş yama' : 'Makine nakışı'],
      patch ? ['Arka yüzey', 'Düz (dikilerek), Ütüyle yapışan veya Cırt cırt — yukarıdan seçin'] : null,
      ['Malzeme', 'Nakış ipliği, kumaş zemin, tela'],
      ['Bakım', 'Ters çevirerek 30°C\'de yıkayın, ağartıcı kullanmayın, nakışın üzerine doğrudan ütü basmayın'],
      ['Stok', isOut(p) ? 'Tükendi' : p.status === 'Son 3' ? 'Son 3 adet' : 'Stokta, hazır ürün'],
      ['Kategori', esc(cat || '—')]
    ].filter(Boolean);
    return '<div class="rp-sec"><b>📋 ÜRÜN BİLGİLERİ</b><dl class="rp-info">' + rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl></div>';
  }

  /* ───────── Benzer ürünler ───────── */
  var STOP = { patch: 1, yama: 1, arma: 1, ve: 1, ile: 1, 'nakış': 1, nakis: 1, the: 1, of: 1 };
  function words(s) { return String(s || '').toLocaleLowerCase('tr').split(/[^a-zçğıöşü0-9]+/i).filter(function (w) { return w.length > 2 && !STOP[w]; }); }
  function similar(p, n) {
    var pw = words(p.name), mainCat = String(p.cat || '').split('/')[0].trim();
    return prods().filter(function (x) { return x.id !== p.id && x.image; }).map(function (x) {
      var s = 0, xw = words(x.name);
      if (x.cat && x.cat === p.cat) s += 4; else if (mainCat && String(x.cat || '').split('/')[0].trim() === mainCat) s += 2;
      pw.forEach(function (w) { if (xw.indexOf(w) >= 0) s += 3; });
      if (!isOut(x)) s += 1;
      s += Math.min(2, (x.sales || 0) / 20);
      return { x: x, s: s };
    }).filter(function (o) { return o.s >= 2; }).sort(function (a, b) { return b.s - a.s; }).slice(0, n).map(function (o) { return o.x; });
  }
  function similarBlock(list) {
    if (!list.length) return '';
    return '<div class="rp-sec"><b>🔁 BENZER ÜRÜNLER</b><div class="rp-sim">' + list.map(function (x) {
      return '<a data-open="' + esc(x.id) + '">' + (isOut(x) ? '<i class="so">TÜKENDİ</i>' : '') + '<img src="' + esc(thumb(x.image, 240)) + '" alt="" loading="lazy"><span>' + esc(x.name) + '</span><em>' + money(x.price) + '</em></a>';
    }).join('') + '</div></div>';
  }

  /* ───────── Set ───────── */
  var autoCamps = null;
  function loadCamps() {
    if (autoCamps || typeof db === 'undefined') return;
    autoCamps = [];
    try {
      db.collection('coupons').where('public', '==', true).get().then(function (s) {
        autoCamps = s.docs.map(function (d) { var o = d.data(); o.id = d.id; return o; }).filter(function (c) {
          return c.auto === true && c.active !== false && (c.type === 'xpay' || c.type === 'nthpct') && !(c.expiry && new Date(c.expiry + 'T23:59:59') < new Date());
        });
        var el = document.getElementById('rpSetCamp'); if (el) el.innerHTML = campNote();
      }).catch(function () {});
    } catch (e) {}
  }
  function campNote() {
    var c = (autoCamps || []).filter(function (c) { return (parseInt(c.buy, 10) || 0) <= 3 && (parseInt(c.buy, 10) || 0) >= 2; })[0];
    if (!c) return '';
    return '🔥 Sepette otomatik kampanya: ' + (c.type === 'xpay' ? esc(c.buy) + ' al ' + esc(c.pay) + ' öde' : esc(c.buy) + '. ürüne %' + esc(c.value) + ' indirim') + (c.minCart ? ' (min. ₺' + esc(c.minCart) + ')' : '');
  }
  var setItems = [];
  function setBlock(p, sims) {
    if (isOut(p)) return '';
    setItems = [p].concat(sims.filter(function (x) { return !isOut(x); }).slice(0, 2));
    if (setItems.length < 3) return '';
    var tot = setItems.reduce(function (s, x) { return s + (parseFloat(x.price) || 0); }, 0);
    return '<div class="rp-sec"><b>🧩 SET OLARAK AL</b><div class="rp-set">' + setItems.map(function (x, i) {
      return (i ? '<span class="pl">+</span>' : '') + '<img src="' + esc(thumb(x.image, 160)) + '" title="' + esc(x.name) + '" alt="">';
    }).join('') + '</div><div class="rp-set-f"><div>3 ürün · <b>' + money(tot) + '</b> (düz arka yüzey)</div><button type="button" id="rpSetBtn">SETİ SEPETE EKLE</button></div><div class="rp-set-c" id="rpSetCamp">' + campNote() + '</div></div>';
  }
  function addSet() {
    var c = []; try { c = JSON.parse(localStorage.getItem('retropatch_cart') || '[]'); } catch (e) {}
    setItems.forEach(function (x) {
      var base = parseFloat(x.price) || 0, ex = null;
      for (var i = 0; i < c.length; i++) if (c[i].id === x.id && (c[i].backType || c[i].back || 'Düz') === 'Düz') { ex = c[i]; break; }
      if (ex) ex.qty = (ex.qty || 1) + 1;
      else c.push({ id: x.id, name: x.name, price: base, basePrice: base, backType: 'Düz', back: 'Düz', backExtra: 0, image: x.image || '', cat: x.cat || '', size: x.size || '', qty: 1 });
    });
    localStorage.setItem('retropatch_cart', JSON.stringify(c));
    try { updateCartCount(); } catch (e) {}
    try { window.rpCartSync && window.rpCartSync(); } catch (e) {}
    try { window.dispatchEvent(new StorageEvent('storage', { key: 'retropatch_cart' })); } catch (e) {}
    try { showToast('✓ Set sepete eklendi (3 ürün)'); } catch (e) {}
  }

  /* ───────── Stok satırı ───────── */
  function stockLine(p) {
    var el = document.getElementById('rpStock');
    if (!el) { el = document.createElement('div'); el.id = 'rpStock'; var pr = document.getElementById('modalPrice'); if (!pr) return; pr.insertAdjacentElement('afterend', el); }
    if (isOut(p)) el.innerHTML = '<i></i>TÜKENDİ <small>Bu ürün şu an satışta değil. Benzerlerine aşağıdan bakabilirsiniz.</small>', el.className = 'rp-stock out';
    else if (p.status === 'Son 3') el.innerHTML = '<i></i>SON 3 ADET! <small>Tükenmeden alın.</small>', el.className = 'rp-stock low';
    else el.innerHTML = '<i></i>STOKTA <small>Hazır ürün, hızlı kargo.</small>', el.className = 'rp-stock ok';
    var b = document.querySelector('#modalOverlay .modal-order-btn');
    if (b) { b.classList.toggle('rp-dis', isOut(p)); b.disabled = isOut(p); if (!b.dataset.html) b.dataset.html = b.innerHTML; b.innerHTML = isOut(p) ? 'TÜKENDİ' : b.dataset.html; }
  }

  /* ───────── openModal sarmalayıcı ───────── */
  var origOpen = window.openModal;
  window.openModal = function (id) {
    origOpen.apply(this, arguments);
    var p = cur(); if (!p || p.id !== id) return;
    try {
      setupGallery(p);
      stockLine(p);
      loadCamps();
      var old = document.getElementById('rpExtra'); if (old) old.remove();
      var sims = similar(p, 8);
      var ex = document.createElement('div'); ex.id = 'rpExtra';
      ex.innerHTML = setBlock(p, sims) + similarBlock(sims) + sizeViz(p) + infoBlock(p);
      var rev = document.querySelector('#modalOverlay .reviews-section');
      if (rev) rev.parentNode.insertBefore(ex, rev); else { var mb = document.querySelector('#modalOverlay .modal-body'); if (mb) mb.appendChild(ex); }
      ex.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('[data-open]');
        if (a) { e.preventDefault(); var mid = a.getAttribute('data-open'); window.openModal(mid); var m = document.querySelector('#modalOverlay .modal'); if (m) m.scrollTop = 0; var ov = document.getElementById('modalOverlay'); if (ov) ov.scrollTop = 0; return; }
        if (e.target.id === 'rpSetBtn') addSet();
      });
    } catch (e) { console.warn('[urun-ek]', e); }
  };

  /* ───────── Tükenmiş ürün sepete eklenmesin ───────── */
  if (typeof window.addToCartFromModal === 'function') {
    var origAdd = window.addToCartFromModal;
    window.addToCartFromModal = function () { var p = cur(); if (isOut(p)) { try { showToast('Bu ürün tükendi'); } catch (e) {} return; } return origAdd.apply(this, arguments); };
  }
  function wrapQuick() {
    if (typeof window.rpQuickAdd !== 'function' || window.rpQuickAdd._rp) return;
    var oq = window.rpQuickAdd;
    window.rpQuickAdd = function (id) { var p = prods().find(function (x) { return x.id === id; }); if (isOut(p)) { try { showToast('Bu ürün tükendi'); } catch (e) {} return; } return oq.apply(this, arguments); };
    window.rpQuickAdd._rp = 1;
  }
  wrapQuick(); document.addEventListener('DOMContentLoaded', wrapQuick); window.addEventListener('load', wrapQuick);

  /* ───────── Kartlar: stok şeridi + foto sayısı ───────── */
  function decorate() {
    var map = {}; prods().forEach(function (p) { map[p.id] = p; });
    document.querySelectorAll('.product-card[data-pid]').forEach(function (c) {
      var p = map[c.getAttribute('data-pid')]; if (!p) return;
      var img = c.querySelector('.product-img'); if (!img) return;
      var s = isOut(p) ? 'out' : p.status === 'Son 3' ? 'low' : 'ok';
      c.setAttribute('data-stock', s);
      var r = img.querySelector('.rp-rib'); if (r) r.remove();
      if (s !== 'ok') img.insertAdjacentHTML('beforeend', '<span class="rp-rib ' + s + '">' + (s === 'out' ? 'TÜKENDİ' : 'SON 3 ADET') + '</span>');
      var m = img.querySelector('.rp-more'); if (m) m.remove();
      var n = imagesOf(p).length; if (n > 1) img.insertAdjacentHTML('beforeend', '<span class="rp-more">📷 ' + n + '</span>');
      if (s === 'out') { var q = c.querySelector('button[onclick*="rpQuickAdd"]'); if (q) q.textContent = 'TÜKENDİ'; }
    });
  }
  if (typeof window.renderGrid === 'function') {
    var origGrid = window.renderGrid;
    window.renderGrid = function () { var r = origGrid.apply(this, arguments); try { decorate(); } catch (e) {} return r; };
  }
  decorate();

  /* ───────── Tam ekran: galeri + tıkla/dokun yakınlaştır ───────── */
  if (typeof window.openLB === 'function') {
    window.openLB = function () {
      var p = cur(); if (!p || !gal.length) return;
      var lb = document.getElementById('lightbox'), im = document.getElementById('lbImg'); if (!lb || !im) return;
      im.classList.remove('rp-z'); im.src = gal[gi];
      var nm = document.getElementById('lbName'), pr = document.getElementById('lbPrice');
      if (nm) nm.textContent = p.name || ''; if (pr) pr.textContent = p.price ? '₺' + p.price : '';
      var wrap = im.parentElement;
      wrap.querySelectorAll('.rp-lbn').forEach(function (b) { b.remove(); });
      if (gal.length > 1) {
        ['p', 'n'].forEach(function (d) {
          var b = document.createElement('button'); b.type = 'button'; b.className = 'rp-lbn ' + d; b.textContent = d === 'p' ? '‹' : '›';
          b.onclick = function (e) { e.stopPropagation(); showImg(gi + (d === 'p' ? -1 : 1)); im.classList.remove('rp-z'); im.src = gal[gi]; };
          wrap.appendChild(b);
        });
      }
      var h = lb.querySelector('.rp-lbh'); if (!h) { h = document.createElement('div'); h.className = 'rp-lbh'; wrap.insertAdjacentElement('afterend', h); }
      h.textContent = 'Detay için görsele tıklayın' + (gal.length > 1 ? ' · ' + (gi + 1) + '/' + gal.length : '');
      lb.classList.add('open');
    };
    var lbi = document.getElementById('lbImg');
    if (lbi) {
      var pan = function (x, y) { var r = lbi.parentElement.getBoundingClientRect(); lbi.style.transformOrigin = Math.max(0, Math.min(100, (x - r.left) / r.width * 100)) + '% ' + Math.max(0, Math.min(100, (y - r.top) / r.height * 100)) + '%'; };
      lbi.addEventListener('click', function (e) { e.stopPropagation(); pan(e.clientX, e.clientY); lbi.classList.toggle('rp-z'); });
      lbi.addEventListener('mousemove', function (e) { if (lbi.classList.contains('rp-z')) pan(e.clientX, e.clientY); });
      lbi.addEventListener('touchmove', function (e) { if (lbi.classList.contains('rp-z') && e.touches[0]) { e.preventDefault(); pan(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: false });
      document.addEventListener('keydown', function (e) {
        var lb = document.getElementById('lightbox'); if (!lb || !lb.classList.contains('open') || gal.length < 2) return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { showImg(gi + (e.key === 'ArrowLeft' ? -1 : 1)); lbi.classList.remove('rp-z'); lbi.src = gal[gi]; }
      });
    }
  }
})();
