// PayX (payx.uz) to'lov tizimi integratsiyasi
//
// Usul: PayX "Pay Link" widget'i asosida — https://payx.uz/l/{slug}?amount={summa}
// (bu havola PayX'ning rasmiy embed.js skriptida ishlatiladigan format).
// Telegram Mini App WebView ichida window.open popup'lari ko'pincha bloklanadi,
// shuning uchun widget skriptini frontendga qo'ymasdan, shu havolani to'g'ridan-to'g'ri
// backendda yasab, so'ng Telegram tg.openLink() orqali ochamiz (bot.js/app.js'da emas,
// frontend app.js allaqachon shunday ishlaydi — createPayment shu URL'ni qaytaradi).
//
// PAYX_PAY_SLUG — PayX kabinetingizda yaratilgan to'lov sahifasi slug'i (masalan "dokon-tolov").

const crypto = require('crypto');
const Order = require('./order.model');

const PAYX_BASE = 'https://payx.uz';

// 1) Buyurtma uchun PayX to'lov havolasini (dinamik summa bilan) yaratish
async function createPayment(order) {
  try {
    const slug = process.env.PAYX_PAY_SLUG;
    if (!slug) throw new Error('PAYX_PAY_SLUG .env faylida ko\u2019rsatilmagan');

    const payUrl = `${PAYX_BASE}/l/${encodeURIComponent(slug)}?amount=${encodeURIComponent(order.totalAmount)}`;

    order.status = 'awaiting_payment';
    await order.save();

    return payUrl;
  } catch (err) {
    console.error('PayX to\u2019lov havolasi yaratishda xato:', err.message);
    throw new Error('To\u2019lov havolasini yaratib bo\u2019lmadi');
  }
}

// 2) Webhook imzosini tekshirish (HMAC-SHA256, PayX kabinetidagi maxfiy kalit bilan)
// ESLATMA: PayX webhook formati/imzo usuli hali tasdiqlanmagan — kabinetdagi
// "Callback/Webhook" bo'limidan aniq formatni oling va shu funksiyani moslang.
function verifyWebhookSignature(req) {
  const signature = req.headers['x-payx-signature'];
  if (!signature || !process.env.PAYX_WEBHOOK_SECRET) return false;

  const expected = crypto
    .createHmac('sha256', process.env.PAYX_WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');

  return signature === expected;
}

// 3) Webhook handler — PayX to'lov holatini shu yerga yuboradi
async function handleWebhook(req, res) {
  if (!verifyWebhookSignature(req)) {
    return res.status(401).json({ error: 'Imzo noto\u2019g\u2019ri' });
  }

  const { payment_id, order_id, status } = req.body;

  try {
    const order = await Order.findById(order_id) || await Order.findOne({ payxPaymentId: payment_id });
    if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi' });

    if (status === 'paid' || status === 'success') {
      order.status = 'paid';
    } else if (status === 'cancelled' || status === 'failed') {
      order.status = 'cancelled';
    }
    await order.save();

    return res.json({ ok: true });
  } catch (err) {
    console.error('PayX webhook xato:', err.message);
    return res.status(500).json({ error: 'Server xatosi' });
  }
}

module.exports = { createPayment, handleWebhook };
