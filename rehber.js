/* RetroPatch rehber sayfaları: güncel fiyat tablosu (settings/calculator + backPrices) ve mağazadan örnek ürünler. */
(function () {
  'use strict';
  if (typeof firebase === 'undefined') return;
  try { if (!firebase.apps.length) firebase.initializeApp({ apiKey: 'AIzaSyA597pu8o7M2ZWcZc6gbGW2TAwceTfyVhA', authDomain: 'retropatch-fd08e.firebaseapp.com', projectId: 'retropatch-fd08e', storageBucket: 'retropatch-fd08e.firebasestorage.app', messagingSenderId: '449894507687', appId: '1:449894507687:web:a932684047bd590579e782' }); } catch (e) { return; }
  var db = firebase.firestore();
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var tl = function (v) { return '₺' + (Number(v) || 0).toLocaleString('tr-TR'); };

  /* ── Fiyat tablosu ── */
  var box = document.getElementById('rbPrice');
  if (box) {
    Promise.all([db.collection('settings').doc('calculator').get(), db.collection('settings').doc('backPrices').get()]).then(function (r) {
      var c = r[0].exists ? r[0].data() : null, bp = r[1].exists ? r[1].data() : null;
      if (!c && !bp) return;   // kayıt yoksa sayfadaki varsayılan tablo kalır
      c = c || {};
      var D = window.RB_DEFAULT || {};
      var prods = (c.products && c.products.length ? c.products : D.products) || [];
      var patch = prods.filter(function (p) { return p.id === 'patch'; })[0] || prods[0];
      var sizes = (c.sizes && c.sizes.length ? c.sizes : D.sizes) || [];
      var backs = ((c.backTypes && c.backTypes.length ? c.backTypes : D.backs) || []).map(function (b) { var x = Object.assign({}, b); if (bp && bp[b.id] != null) x.extra = bp[b.id]; return x; });
      var designs = (c.designTypes && c.designTypes.length ? c.designTypes : D.designs) || [];
      var disc = (c.discounts && c.discounts.length ? c.discounts : D.discounts) || [];
      var colorExtra = c.colorExtra != null ? c.colorExtra : D.colorExtra;
      box.innerHTML = window.rbPriceHtml({ patch: patch, sizes: sizes, backs: backs, designs: designs, discounts: disc, colorExtra: colorExtra });
    }).catch(function () {});
  }

  /* ── Mağazadan örnekler ── */
  var sec = document.getElementById('rbProds');
  if (sec) {
    var kw = (sec.getAttribute('data-kw') || '').toLocaleLowerCase('tr');
    var show = function (list) {
      var TR = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'i': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u' };
      var slug = function (s) { return String(s || '').toLocaleLowerCase('tr').replace(/[çğıiöşü]/g, function (c) { return TR[c] || c; }).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); };
      var ok = list.filter(function (p) { return p.image && p.status !== 'Tükendi'; });
      if (kw) { var k = ok.filter(function (p) { return (String(p.name) + ' ' + String(p.desc || '')).toLocaleLowerCase('tr').indexOf(kw) >= 0; }); if (k.length >= 4) ok = k; }
      ok = ok.slice(0, 8);
      if (ok.length < 4) return;
      sec.querySelector('.prods').innerHTML = ok.map(function (p) {
        var im = /ik\.imagekit\.io/.test(p.image) && p.image.indexOf('?') < 0 ? p.image + '?tr=w-300' : p.image;
        return '<a href="/urun/' + slug(p.name) + '-' + esc(p.id) + '"><img src="' + esc(im) + '" alt="' + esc(p.name) + '" loading="lazy"><span>' + esc(p.name) + '</span><em>' + tl(p.price) + '</em></a>';
      }).join('');
      sec.style.display = '';
    };
    var cached = null; try { cached = JSON.parse(sessionStorage.getItem('rb_prods') || 'null'); } catch (e) {}
    if (cached && Date.now() - cached.t < 30 * 60e3) show(cached.d);
    else db.collection('products').orderBy('sales', 'desc').limit(24).get().then(function (s) {
      var d = s.docs.map(function (x) { var o = x.data(); return { id: x.id, name: o.name, desc: (o.desc || '').slice(0, 200), image: o.image, price: o.price, status: o.status }; });
      try { sessionStorage.setItem('rb_prods', JSON.stringify({ t: Date.now(), d: d })); } catch (e) {}
      show(d);
    }).catch(function () {});
  }
})();
