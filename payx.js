// PayX (payx.uz) to'lov tizimi integratsiyasi
// Rasmiy va tasdiqlangan endpoint: POST https://backend.payx.uz/api/v1/invoice
// So'rov: { amount, description } | Javob: { pay_url }
//
// ESLATMA: PayX kabinetida alohida "webhook secret" ko'rsatilmagan — demak hozircha
// webhook imzosini tasdiqlash funksiyasi yo'q yoki ochiq emas. Shu sababli quyida
// webhook imzosiz qabul qilinadi (faqat order_id/payment holatiga ishoniladi).
// Bu xavfsizlik jihatidan yetarli emas — soxta so'rov yuborilishi mumkin.
// Ishonchli yechim: PayX support'dan "to'lov holatini serverdan tekshirish"
// (GET /api/v1/invoice/:id kabi) endpointi bor-yo'qligini so'rang va webhookka
// ishonish o'rniga shu orqali holatni serverdan tasdiqlang.

const axios = require('axios');
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

    order.status = 'awaiting_payment';
    await order.save();

    return data.pay_url;
  } catch (err) {
    console.error('PayX to\u2019lov yaratishda xato:', err.response?.data || err.message);
    throw new Error('To\u2019lov yaratib bo\u2019lmadi');
  }
}

// 2) Webhook handler — PayX to'lov holatini shu yerga yuboradi
// ESLATMA: PayX hozircha alohida "webhook secret" ko'rsatmagani uchun imzo
// tekshirilmayapti. Bu vaqtinchalik yechim — production'da xavfsizlik uchun
// PayX support'dan webhook imzosi bormi, yoki to'lov holatini serverdan
// tekshiradigan GET endpoint bormi, deb so'rab, shu funksiyani mustahkamlang.
async function handleWebhook(req, res) {
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
