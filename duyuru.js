/* RetroPatch — Duyuru sistemi (üst çubuk + açılır pencere)
   Admin → Duyurular'dan yönetilir. Veri: Firestore "announcements" koleksiyonu.
   Kullanım: sayfanın </body> kapanışından önce  <script src="duyuru.js"></script>
   Gereksinim: sayfada Firebase + global "db" tanımlı olmalı (mevcut sayfalarda var). */
(function () {
  'use strict';

  var TYPES = {
    info:     { bg: '#c8a96e', fg: '#000', icon: '📢', label: 'DUYURU' },
    kampanya: { bg: '#e63946', fg: '#fff', icon: '🔥', label: 'KAMPANYA' },
    yeni:     { bg: '#4ade80', fg: '#000', icon: '✨', label: 'YENİ' },
    uyari:    { bg: '#fb923c', fg: '#000', icon: '⚠️', label: 'DİKKAT' }
  };
  var LS_KEY = 'rp_ann_dismissed';       // kalıcı kapatılanlar  { id: sürüm }
  var SS_POP = 'rp_ann_popup_seen';      // bu oturumda gösterilen popup'lar

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Yalnızca güvenli bağlantılar (javascript: vb. engellenir)
  function safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(u)) return u;
    if (/^[\w\-./]+\.html?(#.*|\?.*)?$/i.test(u)) return u;   // dijital-dosyalar.html gibi
    return '';
  }
  function readLS() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; } }
  function writeLS(o) { try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch (e) {} }
  function readSS() { try { return JSON.parse(sessionStorage.getItem(SS_POP) || '[]'); } catch (e) { return []; } }
  function writeSS(a) { try { sessionStorage.setItem(SS_POP, JSON.stringify(a)); } catch (e) {} }

  function version(a) { return String((a.updatedAt && a.updatedAt.seconds) || (a.createdAt && a.createdAt.seconds) || 0); }
  function inRange(a) {
    var now = new Date();
    if (a.startAt && new Date(a.startAt + 'T00:00:00') > now) return false;
    if (a.endAt && new Date(a.endAt + 'T23:59:59') < now) return false;
    return true;
  }
  // Açılır pencere ödeme/sipariş sayfalarında gösterilmez (alışverişi bölmesin)
  function popupAllowed() {
    return !/(sepet|tesekkur|admin|takip)(\.html)?$/i.test(location.pathname.replace(/\/+$/, ''));
  }

  /* ───────── CSS ───────── */
  function injectCSS() {
    if (document.getElementById('rpAnnCss')) return;
    var st = document.createElement('style');
    st.id = 'rpAnnCss';
    st.textContent =
      ':root{--rp-ann-h:0px}' +
      'nav{top:var(--rp-ann-h)!important;transition:top .25s}' +
      'body{padding-top:var(--rp-ann-h)}' +
      '.mobile-menu{top:calc(64px + var(--rp-ann-h))!important}' +
      '#rpAnn{position:fixed;top:0;left:0;right:0;z-index:260;display:flex;align-items:center;justify-content:center;gap:12px;padding:9px 44px 9px 16px;min-height:38px;font-family:"Barlow Condensed",sans-serif;font-weight:600;font-size:13px;letter-spacing:1.2px;line-height:1.35;text-align:center;transition:background .35s,color .35s}' +
      '#rpAnn .rpa-txt{transition:opacity .3s}' +
      '#rpAnn .rpa-txt.out{opacity:0}' +
      '#rpAnn b{font-weight:800;letter-spacing:2px;margin-right:6px}' +
      '#rpAnn a.rpa-btn{display:inline-block;padding:3px 12px;border:1.5px solid currentColor;color:inherit;text-decoration:none;font-size:11px;font-weight:800;letter-spacing:2px;white-space:nowrap;transition:background .2s,color .2s}' +
      '#rpAnn a.rpa-btn:hover{background:rgba(0,0,0,.18)}' +
      '#rpAnn .rpa-x{position:absolute;right:10px;top:50%;transform:translateY(-50%);width:26px;height:26px;background:none;border:none;color:inherit;font-size:16px;cursor:pointer;opacity:.7;line-height:1}' +
      '#rpAnn .rpa-x:hover{opacity:1}' +
      '#rpAnn .rpa-dots{position:absolute;left:12px;top:50%;transform:translateY(-50%);display:flex;gap:5px}' +
      '#rpAnn .rpa-dots i{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.35;cursor:pointer;display:block}' +
      '#rpAnn .rpa-dots i.on{opacity:1}' +
      '@media(max-width:640px){#rpAnn{font-size:12px;letter-spacing:.6px;padding:8px 38px 8px 12px}#rpAnn .rpa-dots{display:none}}' +
      /* popup */
      '#rpAnnPop{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.82);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .3s}' +
      '#rpAnnPop.show{opacity:1}' +
      '#rpAnnPop .rpp-box{background:#111;border:1px solid #2a2a2a;max-width:440px;width:100%;position:relative;transform:translateY(18px);transition:transform .35s;overflow:hidden}' +
      '#rpAnnPop.show .rpp-box{transform:none}' +
      '#rpAnnPop .rpp-top{padding:26px 28px 18px;text-align:center}' +
      '#rpAnnPop .rpp-ic{font-size:42px;line-height:1}' +
      '#rpAnnPop .rpp-tag{display:inline-block;margin-top:12px;font-family:"Barlow Condensed",sans-serif;font-size:10px;font-weight:800;letter-spacing:3px;padding:3px 12px}' +
      '#rpAnnPop h3{font-family:"Bebas Neue",cursive;font-size:30px;letter-spacing:3px;margin:12px 0 8px;color:#e8e8e8;font-weight:400;line-height:1.1}' +
      '#rpAnnPop p{font-family:"Barlow",sans-serif;font-size:14px;line-height:1.7;color:#aaa;white-space:pre-line}' +
      '#rpAnnPop .rpp-act{padding:4px 28px 24px;display:flex;flex-direction:column;gap:10px}' +
      '#rpAnnPop .rpp-go{display:block;text-align:center;padding:13px;font-family:"Bebas Neue",cursive;font-size:19px;letter-spacing:3px;text-decoration:none}' +
      '#rpAnnPop .rpp-no{background:none;border:1px solid #2a2a2a;color:#888;padding:9px;font-family:"Barlow Condensed",sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;cursor:pointer}' +
      '#rpAnnPop .rpp-no:hover{border-color:#c8a96e;color:#c8a96e}' +
      '#rpAnnPop .rpp-never{display:flex;align-items:center;justify-content:center;gap:7px;font-size:11px;color:#666;font-family:"Barlow",sans-serif;cursor:pointer}' +
      '#rpAnnPop .rpp-x{position:absolute;right:10px;top:10px;width:30px;height:30px;background:rgba(0,0,0,.4);border:none;color:#aaa;font-size:16px;cursor:pointer}';
    document.head.appendChild(st);
  }

  /* ───────── ÜST ÇUBUK ───────── */
  var bar, items = [], idx = 0, timer = null, paused = false;

  function setOffset() {
    var h = bar ? bar.offsetHeight : 0;
    document.documentElement.style.setProperty('--rp-ann-h', h + 'px');
  }

  function paint(i, animate) {
    var a = items[i]; if (!a) return;
    var t = TYPES[a.type] || TYPES.info;
    bar.style.background = t.bg; bar.style.color = t.fg;
    var link = safeUrl(a.linkUrl);
    var html =
      '<span class="rpa-txt' + (animate ? ' out' : '') + '">' +
      '<b>' + t.icon + ' ' + esc(a.title || t.label) + '</b>' + esc(a.text) +
      '</span>' +
      (link ? '<a class="rpa-btn" href="' + esc(link) + '">' + esc(a.linkText || 'İNCELE') + ' →</a>' : '');
    var holder = bar.querySelector('.rpa-body');
    holder.innerHTML = html;
    if (animate) requestAnimationFrame(function () {
      var s = holder.querySelector('.rpa-txt'); if (s) s.classList.remove('out');
    });
    var dots = bar.querySelectorAll('.rpa-dots i');
    for (var k = 0; k < dots.length; k++) dots[k].className = k === i ? 'on' : '';
    var x = bar.querySelector('.rpa-x');
    if (x) x.style.display = a.dismissible === false ? 'none' : '';
    setOffset();
  }

  function start() {
    if (timer) clearInterval(timer);
    if (items.length < 2) return;
    timer = setInterval(function () {
      if (paused) return;
      idx = (idx + 1) % items.length;
      paint(idx, true);
    }, 6500);
  }

  function buildBar(list) {
    items = list; idx = 0;
    if (!items.length) { if (bar) { bar.remove(); bar = null; } setOffset(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'rpAnn';
      bar.setAttribute('role', 'region');
      bar.setAttribute('aria-label', 'Duyuru');
      document.body.insertBefore(bar, document.body.firstChild);
      bar.addEventListener('mouseenter', function () { paused = true; });
      bar.addEventListener('mouseleave', function () { paused = false; });
      window.addEventListener('resize', setOffset);
    }
    bar.innerHTML =
      '<div class="rpa-dots">' + items.map(function (_, i) { return '<i data-i="' + i + '"></i>'; }).join('') + '</div>' +
      '<div class="rpa-body" style="display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap"></div>' +
      '<button class="rpa-x" aria-label="Kapat" title="Kapat">✕</button>';
    if (items.length < 2) bar.querySelector('.rpa-dots').style.display = 'none';
    bar.querySelector('.rpa-dots').onclick = function (e) {
      var i = e.target && e.target.getAttribute && e.target.getAttribute('data-i');
      if (i != null) { idx = +i; paint(idx, true); }
    };
    bar.querySelector('.rpa-x').onclick = function () {
      var a = items[idx], d = readLS(); d[a.id] = version(a); writeLS(d);
      items.splice(idx, 1);
      if (!items.length) { bar.remove(); bar = null; if (timer) clearInterval(timer); setOffset(); return; }
      idx = idx % items.length;
      buildBar(items);
    };
    paint(0, false);
    start();
    setTimeout(setOffset, 60);
  }

  /* ───────── POPUP ───────── */
  function showPopup(a) {
    var t = TYPES[a.type] || TYPES.info;
    var link = safeUrl(a.linkUrl);
    var ov = document.createElement('div');
    ov.id = 'rpAnnPop';
    ov.innerHTML =
      '<div class="rpp-box" role="dialog" aria-modal="true">' +
        '<button class="rpp-x" aria-label="Kapat">✕</button>' +
        '<div class="rpp-top">' +
          '<div class="rpp-ic">' + t.icon + '</div>' +
          '<span class="rpp-tag" style="background:' + t.bg + ';color:' + t.fg + '">' + t.label + '</span>' +
          (a.title ? '<h3>' + esc(a.title) + '</h3>' : '') +
          '<p>' + esc(a.text) + '</p>' +
        '</div>' +
        '<div class="rpp-act">' +
          (link ? '<a class="rpp-go" href="' + esc(link) + '" style="background:' + t.bg + ';color:' + t.fg + '">' + esc(a.linkText || 'İNCELE') + ' →</a>' : '') +
          '<button class="rpp-no">KAPAT</button>' +
          (a.dismissible === false ? '' : '<label class="rpp-never"><input type="checkbox" id="rppNever"> Bir daha gösterme</label>') +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () { ov.classList.add('show'); });
    var firstBtn = ov.querySelector('.rpp-no'); if (firstBtn) try { firstBtn.focus(); } catch (e) {}

    var closed = false;
    function close() {
      if (closed) return; closed = true;
      var never = document.getElementById('rppNever');
      if (never && never.checked) { var d = readLS(); d[a.id] = version(a); writeLS(d); }
      if (a.freq !== 'always') { var seen = readSS(); if (seen.indexOf(a.id) < 0) seen.push(a.id); writeSS(seen); }
      ov.classList.remove('show');
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { ov.remove(); popupQueue.shift(); nextPopup(); }, 300);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('.rpp-x').onclick = close;
    ov.querySelector('.rpp-no').onclick = close;
    var go = ov.querySelector('.rpp-go');
    if (go) go.addEventListener('click', function () { if (a.freq !== 'always') { var seen = readSS(); if (seen.indexOf(a.id) < 0) seen.push(a.id); writeSS(seen); } });
  }

  var popupQueue = [];
  function nextPopup() {
    if (popupQueue.length && !document.getElementById('rpAnnPop')) showPopup(popupQueue[0]);
  }


  /* ───────── SEPET SENKRONU (terk sepet hatırlatma için) ─────────
     Giriş yapmış üyenin sepeti abandoned_carts/{uid} belgesine yazılır; sepet boşsa silinir. */
  var lastCartSig = '';
  function cartSync() {
    try {
      if (typeof firebase === 'undefined' || !firebase.auth || typeof db === 'undefined') return;
      var u = firebase.auth().currentUser; if (!u || !u.email) return;
      var cart = JSON.parse(localStorage.getItem('retropatch_cart') || '[]');
      var sig = u.uid + JSON.stringify(cart.map(function (i) { return [i.id, i.qty]; }));
      if (sig === lastCartSig) return; lastCartSig = sig;
      var ref = db.collection('abandoned_carts').doc(u.uid);
      if (!cart.length) { ref.delete().catch(function () {}); return; }
      var total = cart.reduce(function (s, i) { return s + (i.price || 0) * (i.qty || 1); }, 0);
      ref.set({
        email: u.email, name: u.displayName || '', total: total, reminded: false,
        items: cart.slice(0, 20).map(function (i) { return { name: String(i.name || '').slice(0, 80), qty: i.qty || 1, price: i.price || 0 }; }),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(function () {});
    } catch (e) {}
  }
  window.rpCartSync = function () { lastCartSig = ''; cartSync(); };
  (function waitAuth() {
    if (typeof firebase !== 'undefined' && firebase.auth && typeof db !== 'undefined') {
      firebase.auth().onAuthStateChanged(function (u) {
        setTimeout(cartSync, 1500);
        // Üye kaydı yoksa oluştur (Google girişinde kayıt eksik kalabiliyordu); admin üye listesi bu kayıttan okur
        if (u) {
          try {
            var r = db.collection('users').doc(u.uid);
            r.get().then(function (d) {
              if (d.exists) return;
              return r.set({ name: u.displayName || '', email: u.email || '', phone: u.phoneNumber || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(), role: 'customer' }, { merge: true });
            }).catch(function () {});
          } catch (e) {}
        }
      });
    } else setTimeout(waitAuth, 400);
  })();


  /* ───────── SEO / PERFORMANS ─────────
     1) Dinamik eklenen görsellere lazy-load; ürün kartı görsellerine ImageKit otomatik biçim/kalite
     2) Ürünler yüklenince schema.org Product listesi (Google zengin sonuçlar) */
  function optimizeImg(img) {
    try {
      if (img.getAttribute('data-rp-opt')) return; img.setAttribute('data-rp-opt', '1');
      if (img.closest('nav,header,.logo,.mobile-menu')) return;
      if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
      if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
      var src = img.getAttribute('src') || '';
      if (img.closest('.product-img,.pcard-img,.dgh-img') && /^https:\/\/ik\.imagekit\.io\//.test(src) && src.indexOf('tr=') < 0 && src.indexOf('tr:') < 0)
        img.setAttribute('src', src + (src.indexOf('?') < 0 ? '?' : '&') + 'tr=w-700,q-80,f-auto');
    } catch (e) {}
  }
  function scanImgs(root) {
    var list = (root.querySelectorAll ? root.querySelectorAll('img') : []);
    for (var i = 0; i < list.length; i++) optimizeImg(list[i]);
    if (root.tagName === 'IMG') optimizeImg(root);
  }
  try {
    scanImgs(document);
    new MutationObserver(function (ms) {
      ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scanImgs(n); }); });
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  var ldDone = false, ldTries = 0;
  function productLD() {
    if (ldDone) return;
    var list = null;
    try { list = (typeof allProducts !== 'undefined' && allProducts && allProducts.length) ? allProducts : null; } catch (e) {}
    if (!list) { if (++ldTries < 30) setTimeout(productLD, 1000); return; }
    ldDone = true;
    var origin = location.origin;
    var items = list.slice(0, 50).filter(function (p) { return p && p.name && Number(p.price) > 0; }).map(function (p, i) {
      var out = p.status === 'Tükendi';
      return { '@type': 'ListItem', position: i + 1, item: {
        '@type': 'Product', name: p.name, sku: p.id,
        image: p.image ? [p.image] : undefined,
        description: (p.desc || p.description || p.name + ' — RetroPatch özel nakış yama').toString().slice(0, 300),
        category: p.cat || undefined,
        brand: { '@type': 'Brand', name: 'RetroPatch' },
        offers: { '@type': 'Offer', priceCurrency: 'TRY', price: String(Number(p.price)), url: origin + location.pathname,
                  availability: out ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock' }
      } };
    });
    if (!items.length) return;
    var tag = document.createElement('script'); tag.type = 'application/ld+json';
    tag.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: items });
    document.head.appendChild(tag);
  }
  setTimeout(productLD, 2500);


  /* ───────── YASAL BAĞLANTILAR + BİLGİLENDİRME ÇUBUĞU ───────── */
  function legalFooter() {
    try {
      if (/yasal(\.html)?$/i.test(location.pathname) || document.getElementById('rpLegal')) return;
      var links = [['sozlesme', 'Mesafeli Satış Sözleşmesi'], ['on-bilgi', 'Ön Bilgilendirme'], ['iade', 'İade · İptal · Cayma'], ['kvkk', 'KVKK Aydınlatma'], ['gizlilik', 'Gizlilik · Çerez']];
      var box = document.createElement('div'); box.id = 'rpLegal';
      box.style.cssText = 'padding:14px 20px;text-align:center;font:600 11px "Barlow Condensed",sans-serif;letter-spacing:1px;color:#777;border-top:1px solid #2a2a2a;background:#0a0a0a;line-height:2';
      box.innerHTML = links.map(function (l) { return '<a href="yasal.html#' + l[0] + '" style="color:#999;text-decoration:none;margin:0 10px;white-space:nowrap">' + l[1] + '</a>'; }).join('') +
        '<div style="font-weight:400;letter-spacing:.3px;color:#666;font-size:11px">RetroPatch · Mersin · Satıcı bilgileri için sözleşme sayfalarına bakınız</div>';
      var f = document.querySelector('footer');
      if (f && f.parentNode) f.parentNode.insertBefore(box, f.nextSibling);
      else document.body.appendChild(box);
    } catch (e) {}
  }
  function cookieNote() {
    try {
      if (/yasal(\.html)?$/i.test(location.pathname)) return;
      if (localStorage.getItem('rp_cookie_ok')) return;
      var n = document.createElement('div');
      n.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:99990;max-width:560px;margin:0 auto;background:#141414;border:1px solid #c8a96e;color:#ccc;padding:12px 14px;font:13px/1.5 Barlow,sans-serif;display:flex;gap:12px;align-items:center;box-shadow:0 8px 30px rgba(0,0,0,.6)';
      n.innerHTML = '<span style="flex:1">Bu sitede reklam/takip çerezi kullanılmaz; yalnızca sepet ve oturum için zorunlu yerel depolama kullanılır. <a href="yasal.html#gizlilik" style="color:#c8a96e">Ayrıntı</a></span><button style="background:#c8a96e;border:none;color:#000;padding:8px 14px;font:700 12px \'Barlow Condensed\',sans-serif;letter-spacing:1px;cursor:pointer">TAMAM</button>';
      n.querySelector('button').onclick = function () { try { localStorage.setItem('rp_cookie_ok', '1'); } catch (e) {} n.remove(); };
      document.body.appendChild(n);
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { legalFooter(); cookieNote(); });
  else { legalFooter(); cookieNote(); }

  /* ───────── YÜKLE ───────── */
  function load() {
    injectCSS();
    db.collection('announcements').where('active', '==', true).get().then(function (snap) {
      var dismissed = readLS();
      var all = snap.docs.map(function (d) { var o = d.data(); o.id = d.id; return o; })
        .filter(inRange)
        .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

      // Kayan şerit (marquee) duyuruları anasayfadaki altın şeride eklenir
      window.rpMarqueeExtra = all.filter(function (a) { return a.place === 'marquee'; })
        .map(function (a) { return (a.title ? a.title + ': ' : '') + a.text; });
      if (typeof window.rpRenderMarquee === 'function') window.rpRenderMarquee();

      var bars = all.filter(function (a) { var p = a.place || 'bar'; return (p === 'bar' || p === 'both') && dismissed[a.id] !== version(a); });
      buildBar(bars);

      if (popupAllowed()) {
        var seen = readSS();
        popupQueue = all.filter(function (x) {
          return (x.place === 'popup' || x.place === 'both') && dismissed[x.id] !== version(x) &&
                 (x.freq === 'always' || seen.indexOf(x.id) < 0);
        });
        if (popupQueue.length) setTimeout(nextPopup, 1200);
      }
    }).catch(function (e) { console.warn('Duyurular yüklenemedi:', e && e.message); });
  }

  // db hazır olana kadar bekle (en fazla ~8 sn)
  var tries = 0;
  (function wait() {
    if (typeof db !== 'undefined' && db && db.collection) { load(); return; }
    if (++tries < 55) setTimeout(wait, 150);
  })();
})();
