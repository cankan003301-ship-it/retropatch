/* Havale/EFT ödeme kuralları — sepet (sipariş sonrası) ve Hesabım'da aynı metin.
   IBAN / alıcı / banka settings/bank'tan, WhatsApp numarası settings/site'tan gelir. */
(function () {
  var waCache = null;
  function fmtWA(n) { n = String(n || '').replace(/\D/g, ''); if (n.startsWith('0')) n = '9' + n; if (n.length === 10) n = '90' + n; return n; }
  window.rpShopWA = function () {
    if (waCache) return Promise.resolve(waCache);
    var def = '905375295290';
    try {
      return db.collection('settings').doc('site').get().then(function (d) {
        waCache = (d.exists && d.data().whatsapp) ? fmtWA(d.data().whatsapp) : def; return waCache;
      }).catch(function () { waCache = def; return def; });
    } catch (e) { return Promise.resolve(def); }
  };
  window.rpWADisplay = function (n) { n = fmtWA(n); return n.length === 12 ? '0' + n.slice(2, 5) + ' ' + n.slice(5, 8) + ' ' + n.slice(8, 10) + ' ' + n.slice(10) : n; };
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // code: sipariş kodu, name: sipariş sahibi adı, wa: mağaza WhatsApp (905…)
  window.rpHavaleRules = function (code, name, wa) {
    var ex = e(code || 'RP-XXXXXX') + ' - ' + e(name || 'Ad Soyad');
    var waTxt = wa ? '<a href="https://wa.me/' + e(wa) + '" target="_blank" rel="noopener" style="color:inherit;font-weight:700">' + e(rpWADisplay(wa)) + '</a>' : 'WhatsApp hattımız';
    return '<div class="rp-hrules" style="margin-top:12px;padding:12px 14px;border:1px solid rgba(230,126,34,.45);background:rgba(230,126,34,.07);font-size:12px;line-height:1.65;color:var(--text,#e8e8e8)">' +
      '<b style="color:#e67e22;letter-spacing:.5px">⚠️ ÖNEMLİ ÖDEME KURALLARI</b>' +
      '<ol style="margin:6px 0 0 18px;padding:0">' +
      '<li><b>Açıklamaya mutlaka yazın:</b> Sipariş No - Ad Soyad<br><span style="opacity:.75">Örn: ' + ex + '</span></li>' +
      '<li><b>Başka birinin hesabından ödüyorsanız</b> açıklamaya siparişi verenin adını ve telefonunu ekleyin. Açıklamasız veya kime ait olduğu belirsiz ödemeler işleme alınmaz ve <b>yalnızca gönderen hesaba</b> iade edilir.</li>' +
      '<li>IBAN bilgimizi <b>yalnızca sitemizden ve resmi WhatsApp hattımızdan</b> (' + waTxt + ') alın. Başkasının ilettiği hesaba yapılan ödemelerden sorumlu değiliz.</li>' +
      '<li>Ödeme sonrası dekontu WhatsApp hattımızdan iletebilirsiniz. Üretim/kargo süreci ödemeniz hesabımıza ulaştıktan sonra başlar.</li>' +
      '</ol></div>';
  };
})();
