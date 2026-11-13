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


  /* ───────── SEPET GÖSTERGESİ: ürün adedi + toplam tutar, büyük ve her sayfada ───────── */
  (function () {
    var skip = /(sepet|tesekkur|admin|takip|uye|yasal)/i.test(location.pathname);
    var st = document.createElement('style');
    st.textContent =
      '.rp-cart-pill{display:inline-flex!important;align-items:center;gap:8px;font-size:14px!important;padding:6px 10px!important;border-radius:10px;transition:background .2s}' +
      '.rp-cart-pill:hover{background:rgba(200,169,110,.12)}' +
      '.rp-cart-pill .ic,.rp-cart-pill svg{width:24px!important;height:24px!important}' +
      '.rp-cart-pill #cartCount{background:var(--accent,#c8a96e);color:#000;border-radius:999px;min-width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;padding:0 6px;letter-spacing:0}' +
      '.rp-cart-pill .rp-cart-sum{color:#fff;font-size:13px;letter-spacing:.5px;font-weight:700}' +
      '.rp-cartdd .rp-ci .rp-ctl{display:inline-flex;align-items:center;border:1px solid #333;border-radius:999px;overflow:hidden;margin-top:5px}' +
      '.rp-cartdd .rp-ci .rp-ctl button{background:#1b1b1b;border:0;color:#fff;width:24px;height:22px;cursor:pointer;font-size:14px;line-height:1}' +
      '.rp-cartdd .rp-ci .rp-ctl i{font-style:normal;min-width:24px;text-align:center;color:#fff;font-size:12px}' +
      '.rp-cartdd .rp-ci .rp-del{background:none;border:0;color:#e06666;cursor:pointer;font-size:12px;display:block;margin:6px 0 0 auto;text-decoration:underline;padding:0;font-family:inherit}' +
      '.rp-cartdd .rp-ci .rp-right{text-align:right;flex:0 0 auto}' +
      '.rp-cart-pill.rp-bump{animation:rpBump .6s}' +
      '@keyframes rpBump{0%{transform:scale(1)}35%{transform:scale(1.18)}100%{transform:scale(1)}}' +
      '.rp-hasdd{position:relative}' +
      '.rp-dd{display:none;position:absolute;top:100%;right:0;padding-top:10px;z-index:9999;min-width:230px;text-align:left}' +
      '.rp-dd>.rp-ddb{background:#141414;border:1px solid #2a2a2a;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.6);padding:8px;font-family:"Barlow",sans-serif}' +
      '.rp-hasdd:hover>.rp-dd,.rp-hasdd.rp-open>.rp-dd{display:block}' +
      '.rp-dd a,.rp-dd button.rp-lnk{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border:0;background:none;color:#ddd!important;text-decoration:none;font-family:"Barlow Condensed",sans-serif;font-size:14px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;border-radius:8px;cursor:pointer;text-align:left;background:transparent!important;white-space:nowrap}' +
      '.rp-dd a:hover,.rp-dd button.rp-lnk:hover{background:rgba(200,169,110,.14)!important;color:var(--accent,#c8a96e)!important}' +
      '.rp-dd hr{border:0;border-top:1px solid #2a2a2a;margin:6px 0}' +
      '.rp-dd.rp-cartdd{min-width:320px;max-width:92vw}' +
      '.rp-cartdd .rp-ci{display:flex;gap:10px;align-items:center;padding:8px 6px;border-bottom:1px solid #222}' +
      '.rp-cartdd .rp-ci img{width:44px;height:44px;object-fit:cover;border-radius:6px;background:#222;flex-shrink:0}' +
      '.rp-cartdd .rp-ci div{flex:1;min-width:0;text-transform:none;letter-spacing:0}' +
      '.rp-cartdd .rp-ci b{display:block;color:#fff;font-size:13px;font-weight:600;white-space:normal;line-height:1.25}' +
      '.rp-cartdd .rp-ci small{display:block;color:#999;font-size:11px;margin-top:2px;line-height:1.35}' +
      '.rp-cartdd .rp-ci span{color:var(--accent,#c8a96e);font-weight:700;font-size:13px;white-space:nowrap}' +
      '.rp-cartdd .rp-ct{display:flex;justify-content:space-between;padding:10px 6px 6px;color:#fff;font-size:14px;text-transform:none;letter-spacing:0}' +
      '.rp-cartdd .rp-ct b{color:var(--accent,#c8a96e)}' +
      '.rp-cartdd .rp-cgo{justify-content:center;background:var(--accent,#c8a96e)!important;color:#000!important;margin-top:6px}' +
      '.rp-cartdd .rp-cgo:hover{background:#d4b77a!important;color:#000!important}' +
      '#rpCartFloat{position:fixed;left:14px;bottom:14px;z-index:9990;display:none;align-items:center;gap:12px;background:var(--accent,#c8a96e);color:#000;text-decoration:none;padding:13px 20px;box-shadow:0 8px 30px rgba(0,0,0,.55);font-family:"Barlow Condensed",sans-serif;font-weight:800;letter-spacing:1.5px;font-size:16px;max-width:calc(100vw - 28px)}' +
      '#rpCartFloat.show{display:flex}' +
      '#rpCartFloat .rp-fc-n{background:#000;color:var(--accent,#c8a96e);min-width:26px;height:26px;border-radius:13px;display:inline-flex;align-items:center;justify-content:center;font-size:14px;padding:0 6px}' +
      '#rpCartFloat .rp-fc-go{opacity:.75;font-size:13px}' +
      '#rpCartFloat.rp-bump{animation:rpBump .6s}' +
      '#rpCartNote{position:fixed;left:14px;bottom:78px;z-index:9991;background:#111;border:1px solid var(--accent,#c8a96e);color:#fff;padding:12px 16px;font-size:14px;line-height:1.5;opacity:0;transform:translateY(10px);pointer-events:none;transition:all .3s;max-width:calc(100vw - 28px)}' +
      '#rpCartNote.show{opacity:1;transform:none}#rpCartNote b{color:var(--accent,#c8a96e)}';
    document.head.appendChild(st);

    function read() {
      try {
        var c = JSON.parse(localStorage.getItem('retropatch_cart') || '[]'), n = 0, t = 0;
        c.forEach(function (i) { var q = i.qty || 1; n += q; t += (parseFloat(i.price) || 0) * q; });
        return { n: n, t: Math.round(t * 100) / 100 };
      } catch (e) { return { n: 0, t: 0 }; }
    }
    function money(v) { return v.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' ₺'; }

    var float = null, note = null, last = null, noteTimer = 0, cartDD = null;
    function esc2(x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function paintCartDD(v) {
      if (!cartDD) return;
      var c = []; try { c = JSON.parse(localStorage.getItem('retropatch_cart') || '[]'); } catch (e) {}
      var h = '';
      c.forEach(function (i, ix) {
        var q = i.qty || 1, pr = parseFloat(i.price) || 0, feat = [];
        if (i.backType || i.back) feat.push('Arka: ' + (i.backType || i.back));
        if (i.size) feat.push('Boyut: ' + i.size);
        if (i.cat) feat.push(i.cat);
        h += '<div class="rp-ci"><img src="' + esc2(i.image) + '" alt=""><div><b>' + esc2(i.name) + '</b><small>' + esc2(feat.join(' · ')) + '</small><span class="rp-ctl"><button type="button" data-a="m" data-i="' + ix + '">−</button><i>' + q + '</i><button type="button" data-a="p" data-i="' + ix + '">+</button></span></div><div class="rp-right"><span>' + money(pr * q) + '</span><button type="button" class="rp-del" data-a="r" data-i="' + ix + '">Çıkar</button></div></div>';
      });
      cartDD.querySelector('.rp-ddb').innerHTML = c.length
        ? h + '<div class="rp-ct"><span>' + v.n + ' ürün · Toplam</span><b>' + money(v.t) + '</b></div><a class="rp-cgo" href="sepet.html">SEPETE GİT</a>'
        : '<div style="padding:18px;color:#888;text-align:center;text-transform:none;letter-spacing:0">Sepetiniz boş</div>';
    }
    function ensure() {
      if (!document.body) return false;
      var cc = document.getElementById('cartCount');
      var a = cc && cc.closest ? cc.closest('a') : null;
      if (a && !a.classList.contains('rp-cart-pill')) {
        a.classList.add('rp-cart-pill');
        var li = a.parentElement; if (li) { li.classList.add('rp-hasdd'); cartDD = document.createElement('div'); cartDD.className = 'rp-dd rp-cartdd'; cartDD.innerHTML = '<div class="rp-ddb"></div>'; li.appendChild(cartDD);
          cartDD.addEventListener('click', function (e) {
            var t = e.target.closest ? e.target.closest('[data-a]') : null; if (!t) return;
            e.preventDefault(); e.stopPropagation();
            var c2 = []; try { c2 = JSON.parse(localStorage.getItem('retropatch_cart') || '[]'); } catch (x) {}
            var ix = +t.getAttribute('data-i'), a2 = t.getAttribute('data-a'); if (!c2[ix]) return;
            if (a2 === 'p') c2[ix].qty = Math.min(99, (c2[ix].qty || 1) + 1);
            else if (a2 === 'm') c2[ix].qty = Math.max(1, (c2[ix].qty || 1) - 1);
            else c2.splice(ix, 1);
            localStorage.setItem('retropatch_cart', JSON.stringify(c2));
            try { if (typeof updateCartCount === 'function') updateCartCount(); } catch (x) {}
            tick();
          }); }
        var sp = document.createElement('span'); sp.className = 'rp-cart-sum'; sp.id = 'rpCartSum'; a.appendChild(sp);
      }
      if (!skip && !float) {
        float = document.createElement('a'); float.id = 'rpCartFloat'; float.href = 'sepet.html';
        float.innerHTML = '<span>SEPETİM</span><span class="rp-fc-n" id="rpFcN">0</span><span id="rpFcT"></span><span class="rp-fc-go">GÖR →</span>';
        document.body.appendChild(float);
        note = document.createElement('div'); note.id = 'rpCartNote'; document.body.appendChild(note);
      }
      return true;
    }
    function paint(showNote) {
      if (!ensure()) return;
      var v = read();
      var pill = document.querySelector('.rp-cart-pill'), sum = document.getElementById('rpCartSum');
      if (sum) sum.textContent = v.n ? money(v.t) : '';
      paintCartDD(v);
      if (float) {
        float.classList.toggle('show', v.n > 0);
        document.getElementById('rpFcN').textContent = v.n;
        document.getElementById('rpFcT').textContent = money(v.t);
      }
      if (showNote && v.n) {
        [pill, float].forEach(function (el) { if (el) { el.classList.remove('rp-bump'); void el.offsetWidth; el.classList.add('rp-bump'); } });
        if (note) {
          note.innerHTML = '✓ Sepete eklendi · Sepetinizde <b>' + v.n + ' ürün</b> var · Toplam <b>' + money(v.t) + '</b>';
          note.classList.add('show'); clearTimeout(noteTimer);
          noteTimer = setTimeout(function () { note.classList.remove('show'); }, 3500);
        }
      }
    }
    function tick() {
      var v = read();
      if (last === null) { last = v; paint(false); return; }
      if (v.n !== last.n || v.t !== last.t) { var up = v.n > last.n; last = v; paint(up); }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick); else tick();
    setInterval(tick, 500);
    window.addEventListener('storage', tick);
  })();

  /* ───────── HIZLI SEPETE EKLE (ek özellikleri sorar) + SEPET ÇEKMECESİ ───────── */
  (function () {
    var st = document.createElement('style');
    st.textContent =
      '#rpQA{position:fixed;inset:0;z-index:100010;background:rgba(0,0,0,.72);display:none;align-items:flex-end;justify-content:center}' +
      '#rpQA.open{display:flex}' +
      '#rpQA .rp-sheet{background:#141414;border:1px solid #2a2a2a;border-bottom:0;width:100%;max-width:460px;padding:20px 20px 22px;border-radius:18px 18px 0 0;animation:rpUp .25s ease;max-height:92vh;overflow:auto}' +
      '@media(min-width:640px){#rpQA{align-items:center}#rpQA .rp-sheet{border-bottom:1px solid #2a2a2a;border-radius:18px}}' +
      '@keyframes rpUp{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}' +
      '#rpQA .rp-top{display:flex;gap:14px;align-items:center;margin-bottom:16px}' +
      '#rpQA .rp-thumb{width:64px;height:64px;object-fit:cover;border-radius:10px;background:#222;flex-shrink:0}' +
      '#rpQA .rp-nm{font-family:"Barlow Condensed",sans-serif;font-weight:700;letter-spacing:1px;font-size:18px;color:#fff;line-height:1.2}' +
      '#rpQA .rp-bp{color:var(--accent,#c8a96e);font-size:14px;margin-top:2px}' +
      '#rpQA .rp-x{margin-left:auto;background:none;border:1px solid #333;color:#aaa;width:32px;height:32px;border-radius:50%;cursor:pointer;flex-shrink:0}' +
      '#rpQA .rp-lbl{font-family:"Barlow Condensed",sans-serif;font-size:11px;letter-spacing:2px;color:#888;text-transform:uppercase;margin:12px 0 7px}' +
      '#rpQA .rp-opts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}' +
      '#rpQA .rp-opt{background:#1b1b1b;border:1px solid #2f2f2f;color:#ddd;border-radius:12px;padding:11px 6px;cursor:pointer;text-align:center;font-size:13px;font-family:inherit;line-height:1.3}' +
      '#rpQA .rp-opt small{display:block;color:var(--accent,#c8a96e);font-size:12px;margin-top:2px}' +
      '#rpQA .rp-opt.on{border-color:var(--accent,#c8a96e);background:rgba(200,169,110,.14);color:#fff}' +
      '#rpQA .rp-qty{display:inline-flex;align-items:center;border:1px solid #2f2f2f;border-radius:999px;overflow:hidden}' +
      '#rpQA .rp-qty button{background:#1b1b1b;border:0;color:#fff;width:42px;height:40px;font-size:20px;cursor:pointer}' +
      '#rpQA .rp-qty span{min-width:44px;text-align:center;font-weight:700;color:#fff}' +
      '#rpQA .rp-go{width:100%;margin-top:18px;background:var(--accent,#c8a96e);color:#000;border:0;border-radius:999px;padding:15px;font-family:"Bebas Neue",cursive;font-size:20px;letter-spacing:2px;cursor:pointer}' +
      '#rpDr{position:fixed;inset:0;z-index:100008;background:rgba(0,0,0,.6);display:none}#rpDr.open{display:block}' +
      '#rpDr .rp-panel{position:absolute;right:0;top:0;bottom:0;width:min(400px,100vw);background:#121212;border-left:1px solid #2a2a2a;display:flex;flex-direction:column;animation:rpSl .25s ease}' +
      '@keyframes rpSl{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}' +
      '#rpDr .rp-h{padding:16px 18px;border-bottom:1px solid #2a2a2a;display:flex;justify-content:space-between;align-items:center;font-family:"Bebas Neue",cursive;font-size:22px;letter-spacing:2px;color:#fff}' +
      '#rpDr .rp-l{flex:1;overflow:auto;padding:10px 16px}' +
      '#rpDr .rp-it{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #222;align-items:center}' +
      '#rpDr .rp-it img{width:56px;height:56px;object-fit:cover;border-radius:8px;background:#222;flex-shrink:0}' +
      '#rpDr .rp-in{flex:1;min-width:0}#rpDr .rp-in b{display:block;color:#fff;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#rpDr .rp-in small{color:#888;font-size:12px;display:block;margin:2px 0 6px}' +
      '#rpDr .rp-q{display:inline-flex;align-items:center;border:1px solid #2f2f2f;border-radius:999px;overflow:hidden}#rpDr .rp-q button{background:#1b1b1b;border:0;color:#fff;width:28px;height:26px;cursor:pointer}#rpDr .rp-q span{min-width:28px;text-align:center;font-size:13px;color:#fff}' +
      '#rpDr .rp-pr{text-align:right;color:var(--accent,#c8a96e);font-weight:700;font-size:14px;white-space:nowrap}#rpDr .rp-pr button{display:block;margin:6px 0 0 auto;background:none;border:0;color:#777;font-size:12px;cursor:pointer;text-decoration:underline}' +
      '#rpDr .rp-f{padding:16px 18px;border-top:1px solid #2a2a2a}#rpDr .rp-tot{display:flex;justify-content:space-between;color:#fff;font-size:17px;margin-bottom:12px}#rpDr .rp-tot b{color:var(--accent,#c8a96e)}' +
      '#rpDr .rp-gosepet{display:block;text-align:center;background:var(--accent,#c8a96e);color:#000;text-decoration:none;border-radius:999px;padding:14px;font-family:"Bebas Neue",cursive;font-size:20px;letter-spacing:2px}' +
      '#rpDr .rp-empty{color:#777;text-align:center;padding:50px 10px}';
    document.head.appendChild(st);

    function esc(x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function money(v) { return v.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' ₺'; }
    function readCart() { try { return JSON.parse(localStorage.getItem('retropatch_cart') || '[]'); } catch (e) { return []; } }
    function writeCart(c) { localStorage.setItem('retropatch_cart', JSON.stringify(c)); try { if (typeof updateCartCount === 'function') updateCartCount(); } catch (e) {} }
    function prices() {
      var p = { 'Düz': 0, 'Ütüyle Yapışan': 20, 'Cırt Cırt': 30 };
      try { if (typeof BACK_PRICES_IDX !== 'undefined') p = BACK_PRICES_IDX; else if (typeof BACK_PRICES !== 'undefined') p = BACK_PRICES; } catch (e) {}
      return p;
    }
    function product(id) {
      try { if (typeof allProducts !== 'undefined') { for (var i = 0; i < allProducts.length; i++) if (allProducts[i].id === id) return allProducts[i]; } } catch (e) {}
      return null;
    }

    var qa = null, cur = null, selBack = 'Düz', qty = 1;
    function ensureQA() {
      if (qa) return;
      qa = document.createElement('div'); qa.id = 'rpQA';
      qa.innerHTML = '<div class="rp-sheet"><div class="rp-top"><img class="rp-thumb" id="rpQi" alt=""><div><div class="rp-nm" id="rpQn"></div><div class="rp-bp" id="rpQb"></div></div><button class="rp-x" aria-label="Kapat">✕</button></div>' +
        '<div class="rp-lbl">Arka yüzey</div><div class="rp-opts" id="rpQo"></div>' +
        '<div class="rp-lbl">Adet</div><div class="rp-qty"><button type="button" id="rpQm">−</button><span id="rpQq">1</span><button type="button" id="rpQp">+</button></div>' +
        '<button class="rp-go" id="rpQgo" type="button"></button></div>';
      document.body.appendChild(qa);
      qa.addEventListener('click', function (e) { if (e.target === qa || e.target.className === 'rp-x') closeQA(); });
      document.getElementById('rpQm').onclick = function () { if (qty > 1) { qty--; paintQA(); } };
      document.getElementById('rpQp').onclick = function () { if (qty < 99) { qty++; paintQA(); } };
      document.getElementById('rpQgo').onclick = confirmQA;
    }
    function closeQA() { if (qa) qa.classList.remove('open'); document.body.style.overflow = ''; }
    function paintQA() {
      var pr = prices(), base = parseFloat(cur.price) || 0, extra = pr[selBack] || 0;
      document.querySelectorAll('#rpQo .rp-opt').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-b') === selBack); });
      document.getElementById('rpQq').textContent = qty;
      document.getElementById('rpQgo').textContent = 'SEPETE EKLE · ' + money((base + extra) * qty);
    }
    function confirmQA() {
      var pr = prices(), extra = pr[selBack] || 0, base = parseFloat(cur.price) || 0;
      var c = readCart(), ex = null;
      for (var i = 0; i < c.length; i++) if (c[i].id === cur.id && (c[i].backType || c[i].back || 'Düz') === selBack) { ex = c[i]; break; }
      if (ex) ex.qty = (ex.qty || 1) + qty;
      else c.push({ id: cur.id, name: cur.name, price: base + extra, basePrice: base, backType: selBack, back: selBack, backExtra: extra, image: cur.image || '', cat: cur.cat || '', size: cur.size || '', qty: qty });
      writeCart(c); closeQA();
    }
    window.rpQuickAdd = function (id) {
      var p = product(id); if (!p) { location.href = 'urunler.html'; return; }
      ensureQA(); cur = p; qty = 1; selBack = 'Düz';
      var pr = prices();
      document.getElementById('rpQi').src = p.image || '';
      document.getElementById('rpQn').textContent = p.name || '';
      document.getElementById('rpQb').textContent = 'Başlangıç: ' + money(parseFloat(p.price) || 0);
      var o = document.getElementById('rpQo'); o.innerHTML = '';
      ['Düz', 'Ütüyle Yapışan', 'Cırt Cırt'].forEach(function (k) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'rp-opt'; b.setAttribute('data-b', k);
        b.innerHTML = esc(k) + '<small>' + ((pr[k] || 0) ? '+' + (pr[k] || 0) + ' ₺' : 'Ücretsiz') + '</small>';
        b.onclick = function () { selBack = k; paintQA(); };
        o.appendChild(b);
      });
      paintQA(); qa.classList.add('open'); document.body.style.overflow = 'hidden';
    };

    /* Sepet çekmecesi */
    var dr = null;
    function paintDrawer() {
      var c = readCart(), tot = 0, n = 0, h = '';
      c.forEach(function (i, ix) {
        var q = i.qty || 1, pr = parseFloat(i.price) || 0; tot += pr * q; n += q;
        h += '<div class="rp-it"><img src="' + esc(i.image) + '" alt=""><div class="rp-in"><b>' + esc(i.name) + '</b><small>' + esc(i.backType || i.back || 'Düz') + ' · ' + money(pr) + '</small>' +
          '<span class="rp-q"><button data-a="m" data-i="' + ix + '">−</button><span>' + q + '</span><button data-a="p" data-i="' + ix + '">+</button></span></div>' +
          '<div class="rp-pr">' + money(pr * q) + '<button data-a="r" data-i="' + ix + '">Kaldır</button></div></div>';
      });
      document.getElementById('rpDrL').innerHTML = h || '<div class="rp-empty">Sepetiniz boş</div>';
      document.getElementById('rpDrN').textContent = n ? '(' + n + ' ürün)' : '';
      document.getElementById('rpDrT').textContent = money(tot);
      document.getElementById('rpDrF').style.display = n ? '' : 'none';
    }
    window.rpOpenCart = function () {
      if (!dr) {
        dr = document.createElement('div'); dr.id = 'rpDr';
        dr.innerHTML = '<div class="rp-panel"><div class="rp-h"><span>SEPETİM <small id="rpDrN" style="font-size:14px;color:#888"></small></span><button class="rp-x" style="background:none;border:1px solid #333;color:#aaa;width:32px;height:32px;border-radius:50%;cursor:pointer">✕</button></div>' +
          '<div class="rp-l" id="rpDrL"></div><div class="rp-f" id="rpDrF"><div class="rp-tot"><span>Ara toplam</span><b id="rpDrT"></b></div><a class="rp-gosepet" href="sepet.html">SEPETE GİT / ÖDEME</a></div></div>';
        document.body.appendChild(dr);
        dr.addEventListener('click', function (e) {
          if (e.target === dr || (e.target.className === 'rp-x')) { dr.classList.remove('open'); document.body.style.overflow = ''; return; }
          var a = e.target.getAttribute && e.target.getAttribute('data-a'); if (!a) return;
          var ix = +e.target.getAttribute('data-i'), c = readCart(); if (!c[ix]) return;
          if (a === 'p') c[ix].qty = Math.min(99, (c[ix].qty || 1) + 1);
          else if (a === 'm') c[ix].qty = Math.max(1, (c[ix].qty || 1) - 1);
          else c.splice(ix, 1);
          writeCart(c); paintDrawer();
        });
      }
      paintDrawer(); dr.classList.add('open'); document.body.style.overflow = 'hidden';
    };
    document.addEventListener('click', function (e) {
      var f = e.target.closest && e.target.closest('#rpCartFloat');
      if (f) { e.preventDefault(); window.rpOpenCart(); }
    });
  })();


  /* ───────── HESABIM AÇILIR MENÜ ───────── */
  (function () {
    var done = false;
    function build() {
      var li = document.getElementById('navHesapLi'); if (!li || done) return;
      var a = li.querySelector('a'); if (!a) return;
      if (!/hesap\.html/.test(a.getAttribute('href') || '')) return;
      if (li.style.display === 'none') return;
      done = true;
      li.classList.add('rp-hasdd');
      var d = document.createElement('div'); d.className = 'rp-dd';
      d.innerHTML = '<div class="rp-ddb">' +
        '<a href="hesap.html#orders">Siparişlerim</a><a href="hesap.html#cargo">Kargo Takibi</a><a href="hesap.html#favorites">Favorilerim</a>' +
        '<a href="hesap.html#addresses">Adreslerim</a><a href="hesap.html#profile">Profilim</a><hr>' +
        '<button type="button" class="rp-lnk" id="rpLogout">Çıkış Yap</button></div>';
      li.appendChild(d);
      a.addEventListener('click', function (e) { if (window.matchMedia('(hover:none)').matches) { e.preventDefault(); li.classList.toggle('rp-open'); } });
      d.querySelector('#rpLogout').onclick = function () {
        try { firebase.auth().signOut().then(function () { location.href = 'index.html'; }); } catch (e) { location.href = 'index.html'; }
      };
    }
    setInterval(build, 600);
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
