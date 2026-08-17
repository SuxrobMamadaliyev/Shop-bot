require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const { bot, notifyAdmin, getUnjoinedChannels } = require('./bot');
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
  // Mahsulotlar endi asosan admin panel (bot, /admin) orqali qo'shiladi.
  // Bu endpoint faqat ADMIN_API_KEY header to'g'ri kelsa ishlaydi.
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Ruxsat yo\u2019q' });
  }
  const product = await Product.create(req.body);
  res.json(product);
});

// Telegram file_id orqali yuklangan mahsulot rasmini ko'rsatish (redirect)
app.get('/image/:fileId', async (req, res) => {
  try {
    const link = await bot.telegram.getFileLink(req.params.fileId);
    res.redirect(link.href || link.toString());
  } catch (e) {
    res.status(404).send('Rasm topilmadi');
  }
});

// Mini App ochilishidan oldin frontend shu orqali obuna holatini tekshirishi mumkin
app.get('/api/check-subscription/:userId', async (req, res) => {
  try {
    const unjoined = await getUnjoinedChannels(req.params.userId);
    res.json({
      subscribed: unjoined.length === 0,
      channels: unjoined.map(ch => ({
        title: ch.title,
        username: ch.username,
        url: ch.username ? `https://t.me/${ch.username.replace('@', '')}` : `https://t.me/${ch.chatId}`
      }))
    });
  } catch (e) {
    res.status(500).json({ error: 'Server xatosi' });
  }
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

// Foydalanuvchining barcha buyurtmalari ("Buyurtmalarim" tab uchun)
app.get('/api/orders/user/:telegramUserId', async (req, res) => {
  const orders = await Order.find({ telegramUserId: req.params.telegramUserId }).sort({ createdAt: -1 });
  res.json(orders);
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
