require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const { bot, notifyAdmin } = require('./bot');
const { createPayment, handleWebhook } = require('./payx');
const Product = require('./product.model');
const Order = require('./order.model');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // index.html, app.js, style.css shu papkadan xizmat qiladi

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB ulandi'))
  .catch((err) => console.error('❌ MongoDB xato:', err.message));

// ---------- Mahsulotlar API ----------
app.get('/api/products', async (req, res) => {
  const products = await Product.find({ inStock: true }).sort({ createdAt: -1 });
  res.json(products);
});

app.post('/api/products', async (req, res) => {
  // TODO: bu yerga admin tekshiruvi qo'shing
  const product = await Product.create(req.body);
  res.json(product);
});

// ---------- Buyurtma yaratish + PayX to'lov havolasi ----------
app.post('/api/orders', async (req, res) => {
  try {
    const { telegramUserId, telegramUsername, fullName, phone, address, items } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'Savat bo\u2019sh' });

    const totalAmount = items.reduce((sum, i) => sum + i.price * i.qty, 0);

    const order = await Order.create({
      telegramUserId, telegramUsername, fullName, phone, address, items, totalAmount
    });

    await notifyAdmin(order);

    const paymentUrl = await createPayment(order);
    res.json({ orderId: order._id, totalAmount, paymentUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Topilmadi' });
  res.json(order);
});

// ---------- PayX webhook ----------
app.post('/payx/webhook', handleWebhook);

// ---------- Telegram bot webhook ----------
const WEBHOOK_PATH = '/telegram-webhook';
app.use(bot.webhookCallback(WEBHOOK_PATH));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Server ${PORT} portda ishga tushdi`);
  if (process.env.API_URL) {
    try {
      await bot.telegram.setWebhook(`${process.env.API_URL}${WEBHOOK_PATH}`);
      console.log('✅ Bot webhook o\u2019rnatildi');
    } catch (e) {
      console.error('❌ Webhook xato:', e.message);
    }
  } else {
    console.log('ℹ️ API_URL berilmagan — lokal test uchun bot.launch() ishlatilmoqda');
    bot.launch();
  }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
