/* RetroPatch adres seçici — DHL'deki gibi: İl → İlçe → Mahalle (listeden) + Cadde/Sokak + Bina/Kapı No + Daire/Tarif.
   Veri: /data/adres/iller.json ve /data/adres/<plaka>.json (MIT, github.com/muratgozel/turkey-neighbourhoods)
   Kullanım: const a = RPAddr.mount(kapsayiciEl, { hidden: { line:'adAddress', district:'adDistrict', city:'adCity' }, cls: { row:'fg-row', fg:'fg' } });
             a.set({ city, district, neighbourhood, street, doorNo, desc, line });  a.get();  a.validate() → '' ya da hata */
(function () {
  const BASE = '/data/adres/';
  let _iller = null; const _il = {};
  const lc = s => String(s || '').replace(/I/g, 'ı').replace(/İ/g, 'i').toLocaleLowerCase('tr-TR');
  const norm = s => lc(s).replace(/[^a-zçğıöşü0-9 ]/g, ' ').replace(/\b(mah|mahallesi|mh)\b/g, '').replace(/\s+/g, ' ').trim();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function iller() { if (!_iller) _iller = fetch(BASE + 'iller.json').then(r => r.json()).catch(() => { _iller = null; return []; }); return _iller; }
  async function ilData(code) { if (!_il[code]) _il[code] = fetch(BASE + code + '.json').then(r => r.json()).catch(() => { delete _il[code]; return {}; }); return _il[code]; }

  if (!document.getElementById('rpAddrCss')) {
    const st = document.createElement('style'); st.id = 'rpAddrCss';
    st.textContent = `.rpac{position:relative}.rpac input{width:100%;box-sizing:border-box}
.rpac-list{position:absolute;left:0;right:0;top:100%;z-index:60;max-height:240px;overflow:auto;background:var(--bg2,#1a1a1a);border:1px solid var(--accent,#c8a96e);border-top:0;display:none;box-shadow:0 8px 24px rgba(0,0,0,.4)}
.rpac.open .rpac-list{display:block}.rpac-list div{padding:8px 11px;font-size:13px;cursor:pointer;color:var(--text,#eee);border-bottom:1px solid rgba(255,255,255,.04)}
.rpac-list div.on,.rpac-list div:hover{background:rgba(200,169,110,.18)}.rpac-list .rpac-none{color:var(--muted,#999);cursor:default;font-size:12px}
.rpac-list .rpac-manual{color:var(--accent,#c8a96e);font-size:12px}
.rpac input:disabled{opacity:.5;cursor:not-allowed}.rpac.bad input{border-color:#e63946!important}
.rpaddr-hint{font-size:11px;color:var(--muted,#999);margin-top:4px}`;
    document.head.appendChild(st);
  }

  // Aranabilir liste kutusu
  function combo(input, opts) {
    const wrap = input.parentElement; wrap.classList.add('rpac');
    const list = document.createElement('div'); list.className = 'rpac-list'; wrap.appendChild(list);
    let items = [], value = '', active = -1, manual = false;
    const render = () => {
      const q = norm(input.value), sel = norm(value);
      const f = (q && q !== sel ? items.filter(x => norm(x).includes(q)) : items).slice(0, 150);
      list.innerHTML = f.map((x, i) => `<div data-i="${i}" class="${i === active ? 'on' : ''}">${esc(x)}</div>`).join('') +
        (!f.length ? `<div class="rpac-none">Bulunamadı</div>` : '') +
        (opts.allowManual && input.value.trim() && !items.some(x => norm(x) === q) ? `<div class="rpac-manual" data-m="1">“${esc(input.value.trim())}” olarak yaz (listede yok)</div>` : '');
      list._f = f;
    };
    const pick = (x, isManual) => { value = x; manual = !!isManual; input.value = x; wrap.classList.remove('open', 'bad'); opts.onPick && opts.onPick(x, manual); };
    input.addEventListener('focus', () => { if (input.disabled) return; active = -1; render(); wrap.classList.add('open'); });
    input.addEventListener('input', () => { active = -1; render(); wrap.classList.add('open'); if (norm(input.value) !== norm(value)) { const ov = value; value = ''; manual = false; if (ov) opts.onPick && opts.onPick('', false); } });
    input.addEventListener('keydown', e => {
      const f = list._f || [];
      if (e.key === 'ArrowDown') { active = Math.min(f.length - 1, active + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter') { if (active >= 0 && f[active]) { pick(f[active]); e.preventDefault(); } else if (f.length === 1) { pick(f[0]); e.preventDefault(); } }
      else if (e.key === 'Escape') wrap.classList.remove('open');
    });
    list.addEventListener('mousedown', e => {
      const d = e.target.closest('div'); if (!d) return; e.preventDefault();
      if (d.dataset.m) pick(input.value.trim(), true); else if (d.dataset.i != null) pick(list._f[+d.dataset.i]);
    });
    input.addEventListener('blur', () => setTimeout(() => {
      wrap.classList.remove('open');
      if (!value && input.value.trim()) { const q = norm(input.value), m = items.find(x => norm(x) === q); if (m) pick(m); }
      else if (value && norm(input.value) !== norm(value)) input.value = value;
    }, 120));
    return {
      setItems(a) { items = a || []; render(); },
      setValue(x, isManual) { value = x || ''; manual = !!isManual; input.value = value; },
      get value() { return value; }, get manual() { return manual; }, get items() { return items; },
      enable(on) { input.disabled = !on; if (!on) { input.value = ''; value = ''; } },
      bad(on) { wrap.classList.toggle('bad', !!on); }
    };
  }

  function mount(root, cfg) {
    const c = Object.assign({ row: 'fg-row', fg: 'fg' }, cfg.cls || {});
    const id = 'rpa' + Math.random().toString(36).slice(2, 7);
    root.innerHTML = `
      <div class="${c.row}">
        <div class="${c.fg}"><label>İl *</label><div><input type="text" id="${id}il" placeholder="İl seçin" autocomplete="off"></div></div>
        <div class="${c.fg}"><label>İlçe *</label><div><input type="text" id="${id}ilce" placeholder="Önce il seçin" autocomplete="off" disabled></div></div>
      </div>
      <div class="${c.fg}"><label>Mahalle *</label><div><input type="text" id="${id}mah" placeholder="Önce ilçe seçin" autocomplete="off" disabled></div></div>
      <div class="${c.row}" style="grid-template-columns:2fr 1fr">
        <div class="${c.fg}"><label>Cadde / Sokak *</label><input type="text" id="${id}sok" placeholder="Örn: 2401. Sokak, Atatürk Caddesi" maxlength="80" autocomplete="off"></div>
        <div class="${c.fg}"><label>Kapı No *</label><input type="text" id="${id}no" placeholder="Örn: 10" maxlength="15" autocomplete="off"></div>
      </div>
      <div class="${c.fg}"><label>Daire / Kat / Adres tarifi</label><input type="text" id="${id}tarif" placeholder="Örn: Kat 3 Daire 5, Gül Apartmanı, okulun karşısı" maxlength="150" autocomplete="off"></div>`;
    const $ = s => document.getElementById(id + s);
    const H = k => cfg.hidden && cfg.hidden[k] ? document.getElementById(cfg.hidden[k]) : null;
    let cityCode = '';
    const sync = () => {
      const g = api.get();
      if (H('line')) H('line').value = g.line;
      if (H('district')) H('district').value = g.district;
      if (H('city')) H('city').value = g.city;
      cfg.onChange && cfg.onChange(g);
    };
    const cIl = combo($('il'), { onPick: async (x) => { await setCity(x); sync(); } });
    const cIlce = combo($('ilce'), { onPick: async (x) => { await setDistrict(x); sync(); } });
    const cMah = combo($('mah'), { allowManual: true, onPick: () => sync() });
    ['sok', 'no', 'tarif'].forEach(k => $(k).addEventListener('input', sync));

    async function setCity(name) {
      const L = await iller(); const it = L.find(x => norm(x.n) === norm(name));
      cityCode = it ? it.c : '';
      cIlce.enable(!!it); cIlce.setItems(it ? it.d : []); cIlce.setValue('');
      cMah.enable(false); cMah.setItems([]);
      $('ilce').placeholder = it ? 'İlçe seçin' : 'Önce il seçin'; $('mah').placeholder = 'Önce ilçe seçin';
      if (it) ilData(it.c); // önden yükle
    }
    async function setDistrict(name) {
      cMah.setValue('');
      if (!cityCode || !name) { cMah.enable(false); cMah.setItems([]); return; }
      const D = await ilData(cityCode); const key = Object.keys(D).find(k => norm(k) === norm(name));
      cMah.enable(true); cMah.setItems(key ? D[key] : []); $('mah').placeholder = 'Mahalle seçin veya yazın';
    }
    iller().then(L => cIl.setItems(L.map(x => x.n)));

    const api = {
      get() {
        const mah = cMah.value || $('mah').value.trim(), sok = $('sok').value.trim(), no = $('no').value.trim(), tarif = $('tarif').value.trim();
        const line = [mah, sok, no ? 'No:' + no : '', tarif].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
        return { city: cIl.value, district: cIlce.value, neighbourhood: mah, street: sok, doorNo: no, desc: tarif, line };
      },
      async set(a) {
        a = a || {};
        const L = await iller();
        const city = (L.find(x => norm(x.n) === norm(a.city)) || {}).n || '';
        cIl.setValue(city); await setCity(city);
        const it = L.find(x => x.n === city);
        const dist = it ? (it.d.find(x => norm(x) === norm(a.district)) || '') : '';
        cIlce.setValue(dist); await setDistrict(dist);
        const legacy = String(a.line ?? a.address ?? '');
        let mah = a.neighbourhood || '', sok = a.street || '', no = a.doorNo || '', tarif = a.desc || '';
        if (!a.neighbourhood && legacy) {
          // Eski tek satır adresi parçalara ayırmayı dene
          let rest = ' ' + legacy + ' ';
          const A = ' ' + norm(legacy) + ' ';
          const hit = cMah.items.filter(x => { const k = norm(x); return k && A.includes(' ' + k + ' '); }).sort((x, y) => norm(y).length - norm(x).length)[0];
          if (hit) { mah = hit; rest = rest.replace(new RegExp(norm(hit).split(' ').map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^a-zA-ZçğıöşüÇĞİÖŞÜ0-9]+') + '\\s*(mah(alle(si)?)?|mh)?\\.?', 'i'), ' '); }
          else { const mm = rest.match(/((?:[0-9]+\.?\s*)?(?:[A-Za-zÇĞİÖŞÜçğıöşü]+\s+){0,3}[A-Za-zÇĞİÖŞÜçğıöşü0-9.]+)\s+(mahallesi|mah|mh)\b\.?/i); if (mm) { mah = mm[1].trim() + ' Mah.'; rest = rest.replace(mm[0], ' '); } }
          const nm = rest.match(/\bno\s*[:.]?\s*(\d+[a-zA-Z]?(?:\s*\/\s*\d+)?)/i);
          if (nm) { no = nm[1].replace(/\s/g, ''); rest = rest.replace(nm[0], ' '); }
          const sm = rest.match(/[^,]*?\b(cad(desi)?|cd|sok(ak|ağı)?|sk|bulvar(ı)?|blv|küme evler(i)?|yolu)\b\.?/i);
          if (sm) { sok = sm[0].trim(); rest = rest.replace(sm[0], ' '); }
          tarif = rest.replace(/\s*,\s*/g, ', ').replace(/^[\s,]+|[\s,]+$/g, '').replace(/\s+/g, ' ');
        }
        if (mah) { const m = cMah.items.find(x => norm(x) === norm(mah)); cMah.setValue(m || mah, !m); }
        $('sok').value = sok; $('no').value = no; $('tarif').value = tarif;
        sync();
      },
      validate() {
        const g = api.get(), miss = [];
        cIl.bad(!g.city); cIlce.bad(!g.district); cMah.bad(!g.neighbourhood);
        if (!g.city) miss.push('il'); if (!g.district) miss.push('ilçe'); if (!g.neighbourhood) miss.push('mahalle');
        if (!g.street) miss.push('cadde/sokak'); if (!/\d/.test(g.doorNo)) miss.push('bina/kapı no');
        $('sok').style.borderColor = g.street ? '' : '#e63946'; $('no').style.borderColor = /\d/.test(g.doorNo) ? '' : '#e63946';
        return miss.length ? 'Adreste eksik: ' + miss.join(', ') : '';
      },
      reset() { api.set({}); }
    };
    return api;
  }
  window.RPAddr = { mount, iller, ilData };
})();
