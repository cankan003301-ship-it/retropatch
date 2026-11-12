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
  function isHome() {
    var p = location.pathname.replace(/\/+$/, '');
    return p === '' || /\/index\.html$/i.test(p);
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
    requestAnimationFrame(function () { ov.classList.add('show'); });

    var seen = readSS(); seen.push(a.id); writeSS(seen);
    function close() {
      var never = document.getElementById('rppNever');
      if (never && never.checked) { var d = readLS(); d[a.id] = version(a); writeLS(d); }
      ov.classList.remove('show');
      setTimeout(function () { ov.remove(); }, 300);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('.rpp-x').onclick = close;
    ov.querySelector('.rpp-no').onclick = close;
  }

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

      if (isHome()) {
        var seen = readSS();
        var pops = all.filter(function (a) {
          return (a.place === 'popup' || a.place === 'both') && dismissed[a.id] !== version(a) && seen.indexOf(a.id) < 0;
        });
        if (pops.length) setTimeout(function () { showPopup(pops[0]); }, 1400);
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
