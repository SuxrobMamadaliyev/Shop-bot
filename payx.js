// PayX (payx.uz) to'lov tizimi integratsiyasi
// Rasmiy endpoint: POST https://backend.payx.uz/api/v1/invoice
// So'rov: { amount, description } | Javob: { pay_url }

const axios = require('axios');
const crypto = require('crypto');
const Order = require('./order.model');

const payxClient = axios.create({
  baseURL: process.env.PAYX_API_URL, // https://backend.payx.uz
  headers: {
    Authorization: `Bearer ${process.env.PAYX_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

// 1) Buyurtma uchun PayX orqali invoice (to'lov havolasi) yaratish
async function createPayment(order) {
  try {
    const { data } = await payxClient.post('/api/v1/invoice', {
      amount: order.totalAmount, // so'mda
      description: `Buyurtma #${order._id.toString().slice(-6)}`
    });

    // PayX javobida invoice/tranzaksiya ID bo'lsa shu yerga saqlang (masalan data.id).
    // Hozircha faqat pay_url qaytarilgani ma'lum, shuning uchun order_id orqali bog'laymiz.
    order.status = 'awaiting_payment';
    await order.save();

    return data.pay_url;
  } catch (err) {
    console.error('PayX to\u2019lov yaratishda xato:', err.response?.data || err.message);
    throw new Error('To\u2019lov yaratib bo\u2019lmadi');
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
