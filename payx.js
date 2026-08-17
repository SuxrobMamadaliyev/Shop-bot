// PayX (payx.uz) to'lov tizimi integratsiyasi
//
// ESLATMA: PayX'ning ochiq, umumga ma'lum API hujjatlari topilmadi (sayt JS orqali
// render bo'ladi va login talab qiladi). Quyidagi kod PayX kabinetiga kirib,
// "API hujjatlar" bo'limidan olinadigan odatiy agregator patterniga asoslangan
// (Stripe/Payme-uslubidagi: API key bilan to'lov yaratish + webhook orqali tasdiqlash).
//
// PayX kabinetingizdan quyidagilarni tekshirib, kerak bo'lsa moslang:
//   - PAYX_API_URL to'g'ri bazaviy manzilmi
//   - so'rov/javob maydon nomlari (masalan amount, order_id, return_url va h.k.)
//   - webhook imzosini tekshirish usuli (HMAC sarlavha nomi)

const axios = require('axios');
const crypto = require('crypto');
const Order = require('./order.model');

const payxClient = axios.create({
  baseURL: process.env.PAYX_API_URL,
  headers: {
    Authorization: `Bearer ${process.env.PAYX_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

// 1) Buyurtma uchun PayX orqali to'lov (havola) yaratish
async function createPayment(order) {
  try {
    const { data } = await payxClient.post('/payments', {
      merchant_id: process.env.PAYX_MERCHANT_ID,
      order_id: order._id.toString(),
      amount: order.totalAmount, // so'mda; PayX tiyinda kutsa order.totalAmount * 100 qiling
      currency: 'UZS',
      description: `Buyurtma #${order._id.toString().slice(-6)}`,
      return_url: `${process.env.WEBAPP_URL}/payment-success.html?order=${order._id}`,
      callback_url: `${process.env.API_URL}/payx/webhook`
    });

    order.payxPaymentId = data.payment_id || data.id;
    order.status = 'awaiting_payment';
    await order.save();

    return data.payment_url || data.url;
  } catch (err) {
    console.error('PayX to\u2019lov yaratishda xato:', err.response?.data || err.message);
    throw new Error('To\u2019lov yaratib bo\u2019lmadi');
  }
}

// 2) Webhook imzosini tekshirish (HMAC-SHA256, PayX kabinetidagi maxfiy kalit bilan)
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
