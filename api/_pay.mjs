// api/_pay.js — Kart ödemesi ortak mantığı (PayTR + NestPay tabanlı banka sanal POS)
// Gizli anahtarlar yalnızca Firestore "payment_secrets" koleksiyonunda (kurallarla sadece admin okuyabilir) tutulur
// ve bu dosya yalnızca sunucuda çalışır; tarayıcıya hiçbir zaman gönderilmez.
import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const GROUP_RE = /^PG[A-Za-z0-9]{16,32}$/;
export const r2 = n => Math.round(Number(n) * 100) / 100;
export const toKurus = n => Math.round(Number(n) * 100);

function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ───────────── PayTR ─────────────
export function paytrTokenHash(p, salt, key) {
  const s = `${p.merchant_id}${p.user_ip}${p.merchant_oid}${p.email}${p.payment_amount}${p.user_basket}${p.no_installment}${p.max_installment}${p.currency}${p.test_mode}`;
  return crypto.createHmac('sha256', key).update(s + salt).digest('base64');
}
export function paytrCallbackHash(p, salt, key) {
  return crypto.createHmac('sha256', key).update(String(p.merchant_oid) + salt + String(p.status) + String(p.total_amount)).digest('base64');
}
export const paytrVerify = (p, salt, key) => !!p.hash && safeEq(p.hash, paytrCallbackHash(p, salt, key));

// ───────────── NestPay (Ziraat, İş Bankası, Akbank, Halkbank, TEB… "est3Dgate" 3D Pay Hosting, ver3) ─────────────
const nEsc = v => String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
export function nestpayHash(params, storeKey) {
  const keys = Object.keys(params)
    .filter(k => !['hash', 'encoding'].includes(k.toLowerCase()))
    .sort((a, b) => { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; });
  const plain = keys.map(k => nEsc(params[k])).join('|') + '|' + nEsc(storeKey);
  return crypto.createHash('sha512').update(plain, 'utf8').digest('base64');
}
export function nestpayVerify(params, storeKey) {
  const got = params.HASH || params.hash;
  return !!got && safeEq(got, nestpayHash(params, storeKey));
}
export function nestpayApproved(p) {
  return String(p.Response) === 'Approved' && String(p.ProcReturnCode) === '00' && ['1', '2', '3', '4'].includes(String(p.mdStatus));
}

// ───────────── Ayarlar ─────────────
export async function loadPaySettings(db) {
  const pub = (await db.collection('settings').doc('payments').get()).data() || {};
  const provider = pub.provider === 'nestpay' ? 'nestpay' : 'paytr';
  const sec = (await db.collection('payment_secrets').doc(provider).get()).data() || {};
  return { pub, provider, sec };
}

// ───────────── Kargo / kupon / ürün doğrulama (müşterinin tarayıcıdaki hesabına güvenilmez) ─────────────
const CARGO_FALLBACK = [{ key: 'mng', price: 49 }, { key: 'yurtici', price: 44 }, { key: 'ptt', price: 35 }, { key: 'surat', price: 52 }];

function cargoRule(kargo, key) {
  const d = kargo || {};
  let list = (Array.isArray(d.companies) && d.companies.length)
    ? d.companies.filter(c => c && c.key && c.name && c.active !== false)
    : CARGO_FALLBACK.map(c => ({ ...c, price: d[c.key] !== undefined ? d[c.key] : c.price }));
  if (!list.length) list = CARGO_FALLBACK;
  const f = list.find(c => c.key === key);
  const price = f && typeof Number(f.price) === 'number' && !isNaN(Number(f.price)) ? Number(f.price) : 49;
  const limit = d.limit !== undefined ? Number(d.limit) : 500;
  return { price, limit };
}

async function couponMaxDiscount(db, code, sub) {
  if (!code) return 0;
  const doc = await db.collection('coupons').doc(String(code)).get();
  if (!doc.exists) return 0;
  const c = doc.data();
  if (c.active === false) return 0;
  if (c.expiry && new Date(c.expiry + 'T23:59:59') < new Date()) return 0;
  // Sipariş verildiği an kupon sayacı zaten artmış olabilir; "tükendi" kontrolü client'ta yapıldı, burada yalnızca değer sınırı doğrulanır.
  if (c.minCart && sub < Number(c.minCart)) return 0;
  const v = Number(c.value) || 0;
  return Math.min(sub, c.type === 'percent' ? Math.round(sub * v / 100) : v);
}

// ───────────── Grup hazırlama + doğrulama ─────────────
export async function prepareGroup(db, group, uid) {
  if (!GROUP_RE.test(String(group || ''))) throw new HttpError(400, 'Geçersiz ödeme grubu');
  const [os, ds] = await Promise.all([
    db.collection('orders').where('payGroup', '==', group).get(),
    db.collection('digital_orders').where('payGroup', '==', group).get()
  ]);
  const orders = os.docs.map(d => ({ id: d.id, ref: d.ref, data: d.data() }));
  const digs = ds.docs.map(d => ({ id: d.id, ref: d.ref, data: d.data() }));
  if (!orders.length && !digs.length) throw new HttpError(404, 'Sipariş bulunamadı');
  for (const o of [...orders, ...digs]) {
    if (uid && o.data.userId !== uid) throw new HttpError(403, 'Bu sipariş size ait değil');
    const pay = o.data.payment || {};
    if (pay.method !== 'card') throw new HttpError(400, 'Sipariş kartla ödeme için oluşturulmamış');
    if (pay.status === 'paid') throw new HttpError(409, 'Bu sipariş zaten ödendi');
    if (pay.status !== 'awaiting_card') throw new HttpError(409, 'Sipariş ödeme beklemiyor (' + pay.status + ')');
  }

  const kargo = (await db.collection('settings').doc('kargo').get()).data() || {};
  let total = 0;
  const basket = [];
  const codes = [];

  for (const o of orders) {
    const d = o.data, items = Array.isArray(d.items) ? d.items : [];
    if (!items.length) throw new HttpError(400, 'Sipariş boş');
    let sub = 0;
    for (const it of items) {
      const qty = parseInt(it.qty, 10), price = Number(it.price);
      if (!(qty >= 1 && qty <= 99) || !(price >= 0)) throw new HttpError(400, 'Ürün bilgisi geçersiz');
      const pd = await db.collection('products').doc(String(it.id)).get();
      if (!pd.exists) throw new HttpError(400, 'Ürün artık satışta değil: ' + (it.name || it.id));
      const real = Number(pd.data().price) || 0;
      if (price < real - 0.001) throw new HttpError(400, 'Fiyat doğrulanamadı: ' + (it.name || it.id));
      sub += price * qty;
      basket.push([String(it.name || 'Ürün').slice(0, 80), price.toFixed(2), qty]);
    }
    sub = r2(sub);
    if (Math.abs(sub - Number(d.subtotal)) > 0.01) throw new HttpError(400, 'Ara toplam tutarsız');
    const c = cargoRule(kargo, d.cargo && d.cargo.company);
    const expCargo = (c.limit > 0 && sub >= c.limit) ? 0 : c.price;
    const cargoPrice = Number((d.cargo && d.cargo.price) != null ? d.cargo.price : d.cargoPrice) || 0;
    if (cargoPrice < expCargo - 0.01) throw new HttpError(400, 'Kargo ücreti doğrulanamadı');
    const maxDisc = await couponMaxDiscount(db, d.coupon, sub);
    const disc = Number(d.discount) || 0;
    if (disc > maxDisc + 0.01) throw new HttpError(400, 'İndirim doğrulanamadı');
    if (Math.abs(Number(d.total) - r2(sub + cargoPrice - disc)) > 0.01) throw new HttpError(400, 'Toplam tutarsız');
    total += Number(d.total);
    codes.push(d.orderCode || o.id);
    if (cargoPrice > 0) basket.push(['Kargo', cargoPrice.toFixed(2), 1]);
    if (disc > 0) basket.push(['İndirim', (-disc).toFixed(2), 1]);
  }

  for (const o of digs) {
    const d = o.data, items = Array.isArray(d.items) ? d.items : [];
    if (!items.length) throw new HttpError(400, 'Dijital sipariş boş');
    let sub = 0;
    for (const it of items) {
      const fd = await db.collection('digital_files').doc(String(it.id)).get();
      if (!fd.exists || fd.data().active === false) throw new HttpError(400, 'Dijital dosya artık satışta değil: ' + (it.title || it.id));
      const live = Number(fd.data().price) || 0;
      if (Math.abs(Number(it.price) - live) > 0.01) throw new HttpError(400, 'Dijital dosya fiyatı değişmiş: ' + (it.title || it.id));
      const owned = await db.collection('users').doc(o.data.userId).collection('downloads').doc(String(it.id)).get();
      if (owned.exists) throw new HttpError(400, 'Bu dosyaya zaten sahipsiniz: ' + (it.title || it.id));
      sub += live;
      basket.push([String(it.title || 'Dijital dosya').slice(0, 80), live.toFixed(2), 1]);
    }
    if (Math.abs(r2(sub) - Number(d.total)) > 0.01) throw new HttpError(400, 'Dijital sipariş tutarı tutarsız');
    total += Number(d.total);
    codes.push(d.code || o.id);
  }

  total = r2(total);
  if (!(total > 0)) throw new HttpError(400, 'Ödenecek tutar geçersiz');
  // PayTR sepet toplamı ile tutar uyuşmuyorsa tek satıra indir
  const bsum = r2(basket.reduce((s, b) => s + Number(b[1]) * b[2], 0));
  const first = orders[0] || digs[0];
  const addr = (orders[0] && orders[0].data.address) || {};
  return {
    group, orders, digs, total, kurus: toKurus(total), codes,
    basket: Math.abs(bsum - total) < 0.01 ? basket : [['Sipariş ' + codes.join(' + '), total.toFixed(2), 1]],
    buyer: {
      uid: first.data.userId,
      name: addr.name || first.data.userName || first.data.name || 'Müşteri',
      email: first.data.userEmail || first.data.email || '',
      phone: addr.phone || '',
      address: [addr.address, addr.district, addr.city].filter(Boolean).join(', ') || 'Dijital teslimat'
    }
  };
}

// ───────────── Ödeme sonucu ─────────────
export async function markPaid(db, FieldValue, group, provider, paidKurus) {
  const [os, ds] = await Promise.all([
    db.collection('orders').where('payGroup', '==', group).get(),
    db.collection('digital_orders').where('payGroup', '==', group).get()
  ]);
  const now = FieldValue.serverTimestamp();
  const emails = [];
  let changed = 0;
  for (const d of os.docs) {
    const o = d.data();
    if (o.payment && o.payment.status === 'paid') continue;          // tekrar gelen bildirim: işlem yapma
    const batch = db.batch();
    batch.update(d.ref, { 'payment.status': 'paid', 'payment.paidAt': now, 'payment.provider': provider, 'payment.paidKurus': paidKurus, status: 'yeni' });
    (o.items || []).forEach(i => {
      if (i.id) batch.set(db.collection('products').doc(String(i.id)), { sales: FieldValue.increment(parseInt(i.qty, 10) || 1) }, { merge: true });
    });
    if (o.coupon) batch.set(db.collection('coupons').doc(String(o.coupon)), { used: FieldValue.increment(1) }, { merge: true });
    await batch.commit();
    emails.push({ orderCode: o.orderCode, data: o });
    changed++;
  }
  for (const d of ds.docs) {
    const o = d.data();
    if (o.payment && o.payment.status === 'paid') continue;
    const batch = db.batch();
    (o.items || []).forEach(i => {
      batch.set(db.collection('users').doc(o.userId).collection('downloads').doc(String(i.id)), {
        title: i.title, orderId: d.id, orderCode: o.code, grantedAt: now
      });
      batch.set(db.collection('digital_files').doc(String(i.id)), { sold: FieldValue.increment(1) }, { merge: true });
    });
    batch.update(d.ref, { status: 'onaylandı', approvedAt: now, 'payment.status': 'paid', 'payment.paidAt': now, 'payment.provider': provider, 'payment.paidKurus': paidKurus });
    await batch.commit();
    changed++;
  }
  return { changed, emails };
}

export async function markFailed(db, FieldValue, group, reason) {
  const [os, ds] = await Promise.all([
    db.collection('orders').where('payGroup', '==', group).get(),
    db.collection('digital_orders').where('payGroup', '==', group).get()
  ]);
  const upd = { 'payment.status': 'failed', 'payment.failReason': String(reason || '').slice(0, 200), status: 'iptal' };
  for (const d of [...os.docs, ...ds.docs]) {
    const p = (d.data().payment || {}).status;
    if (p === 'paid') continue;                                       // ödenmiş siparişi asla iptal etme
    await d.ref.update(upd);
  }
}

export function siteOrigin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  return proto + '://' + req.headers.host;
}

// ───────────── Ödeme sonrası bildirim (mevcut /api/send-email ve /api/send-whatsapp uçları) ─────────────
export async function notifyPaid(origin, emails) {
  for (const { orderCode, data: o } of emails || []) {
    try {
      const items = (o.items || []).map(i => ({ name: i.name, qty: i.qty || 1, price: (i.price || 0) * (i.qty || 1) }));
      const a = o.address || {};
      const common = { orderCode, customerName: o.userName || a.name || 'Müşteri', items, total: o.total, paymentMethod: 'Kredi/Banka Kartı (ödendi)' };
      const post = (path, data) => fetch(origin + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'order_confirmed', data }), signal: AbortSignal.timeout(8000)
      }).catch(e => console.warn('[notify]', path, e.message));
      await Promise.all([
        o.userEmail ? post('/api/send-email', { ...common, customerEmail: o.userEmail, customerPhone: a.phone || '',
          address: [a.name, a.phone, a.address, a.district, a.city].filter(Boolean).join(', '), whatsapp: '905375295290' }) : null,
        a.phone ? post('/api/send-whatsapp', { ...common, customerPhone: a.phone }) : null
      ]);
    } catch (e) { console.warn('[notify]', e.message); }
  }
}
