const { Telegraf, Markup } = require('telegraf');
const Order = require('./order.model');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
  ctx.reply(
    `Assalomu alaykum, ${ctx.from.first_name}! 👋\n\nDo'konimizga xush kelibsiz. Xarid qilish uchun quyidagi tugmani bosing:`,
    Markup.inlineKeyboard([
      Markup.button.webApp('🛍 Do\u2019konni ochish', process.env.WEBAPP_URL)
    ])
  );
});

bot.command('orders', async (ctx) => {
  const orders = await Order.find({ telegramUserId: String(ctx.from.id) }).sort({ createdAt: -1 }).limit(5);
  if (!orders.length) return ctx.reply('Sizda hali buyurtmalar yo\u2019q.');
  const text = orders.map(o =>
    `#${o._id.toString().slice(-6)} — ${o.totalAmount.toLocaleString()} so'm — ${statusText(o.status)}`
  ).join('\n');
  ctx.reply(`So\u2019nggi buyurtmalaringiz:\n\n${text}`);
});

function statusText(status) {
  const map = {
    pending: '⏳ Kutilmoqda',
    awaiting_payment: '💳 To\u2019lov kutilmoqda',
    paid: '✅ To\u2019landi',
    processing: '📦 Tayyorlanmoqda',
    delivered: '🚚 Yetkazildi',
    cancelled: '❌ Bekor qilindi'
  };
  return map[status] || status;
}

bot.on('web_app_data', async (ctx) => {
  try {
    const data = JSON.parse(ctx.webAppData.data);
    ctx.reply(`Buyurtmangiz qabul qilindi! Raqami: #${data.orderId?.slice(-6) || ''}`);
  } catch (e) {
    console.error('web_app_data xato:', e);
  }
});

async function notifyAdmin(order) {
  if (!process.env.ADMIN_CHAT_ID) return;
  const itemsText = order.items.map(i => `• ${i.name} x${i.qty} — ${(i.price * i.qty).toLocaleString()} so'm`).join('\n');
  const text =
    `🆕 Yangi buyurtma #${order._id.toString().slice(-6)}\n\n` +
    `👤 ${order.fullName || order.telegramUsername || order.telegramUserId}\n` +
    `📞 ${order.phone || '-'}\n` +
    `📍 ${order.address || '-'}\n\n` +
    `${itemsText}\n\n` +
    `💰 Jami: ${order.totalAmount.toLocaleString()} so'm\n` +
    `Holat: ${statusText(order.status)}`;
  try {
    await bot.telegram.sendMessage(process.env.ADMIN_CHAT_ID, text);
  } catch (e) {
    console.error('Admin xabarini yuborishda xato:', e.message);
  }
}

module.exports = { bot, notifyAdmin, statusText };
