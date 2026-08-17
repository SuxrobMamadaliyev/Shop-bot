const { Telegraf, Markup } = require('telegraf');
const Order = require('./order.model');
const Product = require('./product.model');
const Channel = require('./channel.model');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ================== ADMIN ANIQLASH ==================
// .env da ADMIN_IDS="123456,789012" (vergul bilan) yoki bitta ADMIN_CHAT_ID ham ishlaydi
const ADMIN_IDS = (process.env.ADMIN_IDS || process.env.ADMIN_CHAT_ID || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function isAdmin(ctx) {
  return ADMIN_IDS.includes(String(ctx.from.id));
}

// ================== ADMIN "SESSION" (xotirada, oddiy holat mashinasi) ==================
const wizard = new Map(); // key: admin telegram id -> { step, data }

function resetWizard(id) { wizard.delete(id); }

// ================== YORDAMCHI: STATUS MATNI ==================
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

// ================== MAJBURIY OBUNA TEKSHIRUVI ==================
async function getUnjoinedChannels(userId) {
  const channels = await Channel.find({ isMandatory: true });
  const unjoined = [];
  for (const ch of channels) {
    try {
      const member = await bot.telegram.getChatMember(ch.chatId, userId);
      if (!['member', 'administrator', 'creator'].includes(member.status)) {
        unjoined.push(ch);
      }
    } catch (e) {
      // Bot kanalda admin bo'lmasa yoki chat topilmasa — sozlash xatosi bo'lishi mumkin, logga yozamiz.
      console.error(`Kanal tekshiruvi xato (${ch.chatId}):`, e.message);
    }
  }
  return unjoined;
}

function subscribeKeyboard(unjoined, checkPayload) {
  const rows = unjoined.map(ch => [
    Markup.button.url(`📢 ${ch.title || ch.username || ch.chatId}`,
      ch.username ? `https://t.me/${ch.username.replace('@', '')}` : `https://t.me/${ch.chatId}`)
  ]);
  rows.push([Markup.button.callback('✅ Tekshirish', `check_sub:${checkPayload || ''}`)]);
  return Markup.inlineKeyboard(rows);
}

// ================== /start ==================
bot.start(async (ctx) => {
  const payload = ctx.startPayload || '';
  await handleStart(ctx, payload);
});

async function handleStart(ctx, payload) {
  const unjoined = await getUnjoinedChannels(ctx.from.id);
  if (unjoined.length) {
    return ctx.reply(
      '📢 Botdan foydalanish uchun quyidagi kanallarga obuna bo\u2019ling, so\u2019ng "Tekshirish" tugmasini bosing:',
      subscribeKeyboard(unjoined, payload)
    );
  }

  let webAppUrl = process.env.WEBAPP_URL;
  let text = `Assalomu alaykum, ${ctx.from.first_name}! 👋\n\nDo'konimizga xush kelibsiz. Xarid qilish uchun quyidagi tugmani bosing:`;

  if (payload.startsWith('order_')) {
    const productId = payload.replace('order_', '');
    const product = await Product.findById(productId).catch(() => null);
    if (product) {
      webAppUrl = `${process.env.WEBAPP_URL}?product=${productId}`;
      text = `🛍 ${product.name}\n💰 ${product.price.toLocaleString()} so'm\n\nBuyurtma berish uchun quyidagi tugmani bosing:`;
    }
  }

  return ctx.reply(text, Markup.inlineKeyboard([
    Markup.button.webApp('🛍 Do\u2019konni ochish', webAppUrl)
  ]));
}

bot.action(/^check_sub:(.*)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const payload = ctx.match[1] || '';
  const unjoined = await getUnjoinedChannels(ctx.from.id);
  if (unjoined.length) {
    return ctx.reply('❗️ Siz hali barcha kanallarga obuna bo\u2019lmagansiz.', subscribeKeyboard(unjoined, payload));
  }
  await ctx.deleteMessage().catch(() => {});
  return handleStart(ctx, payload);
});

// ================== /orders (foydalanuvchi uchun) ==================
bot.command('orders', async (ctx) => {
  const orders = await Order.find({ telegramUserId: String(ctx.from.id) }).sort({ createdAt: -1 }).limit(5);
  if (!orders.length) return ctx.reply('Sizda hali buyurtmalar yo\u2019q.');
  const text = orders.map(o =>
    `#${o._id.toString().slice(-6)} — ${o.totalAmount.toLocaleString()} so'm — ${statusText(o.status)}`
  ).join('\n');
  ctx.reply(`So\u2019nggi buyurtmalaringiz:\n\n${text}`);
});

bot.on('web_app_data', async (ctx) => {
  try {
    const data = JSON.parse(ctx.webAppData.data);
    ctx.reply(`Buyurtmangiz qabul qilindi! Raqami: #${data.orderId?.slice(-6) || ''}`);
  } catch (e) {
    console.error('web_app_data xato:', e);
  }
});

async function notifyAdmin(order) {
  const itemsText = order.items.map(i => `• ${i.name} x${i.qty} — ${(i.price * i.qty).toLocaleString()} so'm`).join('\n');
  const text =
    `🆕 Yangi buyurtma #${order._id.toString().slice(-6)}\n\n` +
    `👤 ${order.fullName || order.telegramUsername || order.telegramUserId}\n` +
    `📞 ${order.phone || '-'}\n` +
    `📍 ${order.address || '-'}\n\n` +
    `${itemsText}\n\n` +
    `💰 Jami: ${order.totalAmount.toLocaleString()} so'm\n` +
    `Holat: ${statusText(order.status)}`;
  for (const id of ADMIN_IDS) {
    try {
      await bot.telegram.sendMessage(id, text);
    } catch (e) {
      console.error('Admin xabarini yuborishda xato:', e.message);
    }
  }
}

// ============================================================
// ==================== ADMIN PANEL ============================
// ============================================================

function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📦 Mahsulotlar', 'adm:prod:menu')],
    [Markup.button.callback('📢 Majburiy kanallar', 'adm:ch:menu')],
    [Markup.button.callback('🧾 Buyurtmalar', 'adm:orders')],
    [Markup.button.callback('📊 Statistika', 'adm:stats')]
  ]);
}

bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx)) return; // adminlarga sezdirmasdan e'tiborsiz qoldiramiz
  resetWizard(ctx.from.id);
  await ctx.reply('🛠 *Admin panel*\n\nBo\u2019limni tanlang:', {
    parse_mode: 'Markdown',
    ...mainMenu()
  });
});

bot.action('adm:menu', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  resetWizard(ctx.from.id);
  await ctx.editMessageText('🛠 *Admin panel*\n\nBo\u2019limni tanlang:', {
    parse_mode: 'Markdown',
    ...mainMenu()
  }).catch(() => {});
});

// ---------------- MAHSULOTLAR ----------------
function productMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('➕ Mahsulot qo\u2019shish', 'adm:prod:add')],
    [Markup.button.callback('📋 Ro\u2019yxat', 'adm:prod:list:0')],
    [Markup.button.callback('⬅️ Orqaga', 'adm:menu')]
  ]);
}

bot.action('adm:prod:menu', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  resetWizard(ctx.from.id);
  await ctx.editMessageText('📦 *Mahsulotlar boshqaruvi*', { parse_mode: 'Markdown', ...productMenu() }).catch(() => {});
});

bot.action('adm:prod:add', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  wizard.set(ctx.from.id, { step: 'name', data: {} });
  await ctx.editMessageText('✏️ Mahsulot nomini yuboring:').catch(() => {});
});

async function renderProductList(ctx, page) {
  const pageSize = 5;
  const total = await Product.countDocuments();
  const products = await Product.find().sort({ createdAt: -1 }).skip(page * pageSize).limit(pageSize);

  if (!products.length) {
    return ctx.editMessageText('Mahsulotlar topilmadi.', productMenu()).catch(() => {});
  }

  const rows = products.map(p => [
    Markup.button.callback(`${p.inStock ? '🟢' : '🔴'} ${p.name} — ${p.price.toLocaleString()} so'm`, `adm:prod:view:${p._id}`)
  ]);
  const navRow = [];
  if (page > 0) navRow.push(Markup.button.callback('⬅️', `adm:prod:list:${page - 1}`));
  if ((page + 1) * pageSize < total) navRow.push(Markup.button.callback('➡️', `adm:prod:list:${page + 1}`));
  if (navRow.length) rows.push(navRow);
  rows.push([Markup.button.callback('⬅️ Orqaga', 'adm:prod:menu')]);

  await ctx.editMessageText(`📋 Mahsulotlar (${total} ta):`, Markup.inlineKeyboard(rows)).catch(() => {});
}

bot.action(/^adm:prod:list:(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  await renderProductList(ctx, parseInt(ctx.match[1], 10));
});

async function renderProductView(ctx, id) {
  const p = await Product.findById(id);
  if (!p) return ctx.editMessageText('Mahsulot topilmadi.', productMenu()).catch(() => {});

  const text = `🛍 *${p.name}*\n${p.description || ''}\n\n💰 ${p.price.toLocaleString()} so'm\n🏷 ${p.category}\n${p.inStock ? '🟢 Sotuvda' : '🔴 Sotuvdan olingan'}`;
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback(p.inStock ? '🔴 Sotuvdan olish' : '🟢 Sotuvga qaytarish', `adm:prod:toggle:${p._id}`)],
    [Markup.button.callback('🗑 O\u2019chirish', `adm:prod:del:${p._id}`)],
    [Markup.button.callback('⬅️ Orqaga', 'adm:prod:list:0')]
  ]);

  await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb }).catch(() => {});
}

bot.action(/^adm:prod:view:(\w+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  await renderProductView(ctx, ctx.match[1]);
});

bot.action(/^adm:prod:toggle:(\w+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  const p = await Product.findById(ctx.match[1]);
  if (p) { p.inStock = !p.inStock; await p.save(); }
  await ctx.answerCbQuery('Yangilandi ✅');
  await renderProductView(ctx, ctx.match[1]);
});

bot.action(/^adm:prod:del:(\w+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await Product.findByIdAndDelete(ctx.match[1]);
  await ctx.answerCbQuery('O\u2019chirildi 🗑');
  await ctx.editMessageText('🗑 Mahsulot o\u2019chirildi.', productMenu()).catch(() => {});
});

// ---------------- KANALLAR ----------------
function channelMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('➕ Kanal qo\u2019shish', 'adm:ch:add')],
    [Markup.button.callback('📋 Ro\u2019yxat', 'adm:ch:list')],
    [Markup.button.callback('⬅️ Orqaga', 'adm:menu')]
  ]);
}

bot.action('adm:ch:menu', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  resetWizard(ctx.from.id);
  await ctx.editMessageText('📢 *Majburiy obuna kanallari*\n\nBu yerda foydalanuvchi botdan foydalanishdan oldin obuna bo\u2019lishi shart bo\u2019lgan kanallarni boshqarasiz.', { parse_mode: 'Markdown', ...channelMenu() }).catch(() => {});
});

bot.action('adm:ch:add', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  wizard.set(ctx.from.id, { step: 'ch_wait', data: {} });
  await ctx.editMessageText(
    '📢 Kanal qo\u2019shish uchun:\n\n' +
    '1) Botni shu kanalga *admin* qilib qo\u2019ying\n' +
    '2) Kanaldagi istalgan postni shu chatga *forward* qiling\n\n' +
    'yoki kanal usernameni yuboring: @masalan_kanal',
    { parse_mode: 'Markdown' }
  ).catch(() => {});
});

async function renderChannelList(ctx) {
  const channels = await Channel.find().sort({ createdAt: -1 });
  if (!channels.length) return ctx.editMessageText('Kanallar qo\u2019shilmagan.', channelMenu()).catch(() => {});

  const rows = channels.map(ch => [
    Markup.button.callback(
      `${ch.isMandatory ? '✅' : '⬜️'} ${ch.title || ch.username || ch.chatId}${ch.postProducts ? ' 📤' : ''}`,
      `adm:ch:view:${ch._id}`
    )
  ]);
  rows.push([Markup.button.callback('⬅️ Orqaga', 'adm:ch:menu')]);
  await ctx.editMessageText('📋 Kanallar (✅ majburiy, 📤 mahsulot postlanadi):', Markup.inlineKeyboard(rows)).catch(() => {});
}

bot.action('adm:ch:list', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  await renderChannelList(ctx);
});

async function renderChannelView(ctx, id) {
  const ch = await Channel.findById(id);
  if (!ch) return ctx.editMessageText('Kanal topilmadi.', channelMenu()).catch(() => {});
  const text = `📢 *${ch.title || ch.username || ch.chatId}*\n\nMajburiy obuna: ${ch.isMandatory ? '✅ Ha' : '⬜️ Yo\u2019q'}\nMahsulot postlash: ${ch.postProducts ? '✅ Ha' : '⬜️ Yo\u2019q'}`;
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback(ch.isMandatory ? '⬜️ Majburiylikni o\u2019chirish' : '✅ Majburiy qilish', `adm:ch:tm:${ch._id}`)],
    [Markup.button.callback(ch.postProducts ? '⬜️ Postlashni o\u2019chirish' : '📤 Postlash kanaliga aylantirish', `adm:ch:tp:${ch._id}`)],
    [Markup.button.callback('🗑 O\u2019chirish', `adm:ch:del:${ch._id}`)],
    [Markup.button.callback('⬅️ Orqaga', 'adm:ch:list')]
  ]);
  await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb }).catch(() => {});
}

bot.action(/^adm:ch:view:(\w+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  await renderChannelView(ctx, ctx.match[1]);
});

bot.action(/^adm:ch:tm:(\w+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  const ch = await Channel.findById(ctx.match[1]);
  if (ch) { ch.isMandatory = !ch.isMandatory; await ch.save(); }
  await ctx.answerCbQuery('Yangilandi ✅');
  await renderChannelView(ctx, ctx.match[1]);
});

bot.action(/^adm:ch:tp:(\w+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  const ch = await Channel.findById(ctx.match[1]);
  if (ch) { ch.postProducts = !ch.postProducts; await ch.save(); }
  await ctx.answerCbQuery('Yangilandi ✅');
  await renderChannelView(ctx, ctx.match[1]);
});

bot.action(/^adm:ch:del:(\w+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await Channel.findByIdAndDelete(ctx.match[1]);
  await ctx.answerCbQuery('O\u2019chirildi 🗑');
  await ctx.editMessageText('🗑 Kanal o\u2019chirildi.', channelMenu()).catch(() => {});
});

// ---------------- BUYURTMALAR / STATISTIKA ----------------
bot.action('adm:orders', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const orders = await Order.find().sort({ createdAt: -1 }).limit(10);
  if (!orders.length) return ctx.editMessageText('Buyurtmalar yo\u2019q.', mainMenu()).catch(() => {});
  const text = orders.map(o =>
    `#${o._id.toString().slice(-6)} — ${o.totalAmount.toLocaleString()} so'm — ${statusText(o.status)}`
  ).join('\n');
  await ctx.editMessageText(`🧾 So\u2019nggi 10 ta buyurtma:\n\n${text}`, Markup.inlineKeyboard([[Markup.button.callback('⬅️ Orqaga', 'adm:menu')]])).catch(() => {});
});

bot.action('adm:stats', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const [productCount, orderCount, paidOrders] = await Promise.all([
    Product.countDocuments(),
    Order.countDocuments(),
    Order.find({ status: { $in: ['paid', 'delivered'] } })
  ]);
  const revenue = paidOrders.reduce((s, o) => s + o.totalAmount, 0);
  const text = `📊 *Statistika*\n\n📦 Mahsulotlar: ${productCount}\n🧾 Buyurtmalar: ${orderCount}\n💰 To\u2019langan savdo: ${revenue.toLocaleString()} so'm`;
  await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Orqaga', 'adm:menu')]]) }).catch(() => {});
});

// ---------------- MATNLI QADAMLAR (mahsulot/kanal qo'shish wizard) ----------------
bot.on('text', async (ctx, next) => {
  if (!isAdmin(ctx)) return next();
  const state = wizard.get(ctx.from.id);
  if (!state) return next();

  const text = ctx.message.text.trim();

  if (state.step === 'ch_wait') {
    if (!text.startsWith('@')) return ctx.reply('Iltimos @username ko\u2019rinishida yuboring yoki kanaldan post forward qiling.');
    try {
      const chat = await bot.telegram.getChat(text);
      const exists = await Channel.findOne({ chatId: String(chat.id) });
      if (exists) { resetWizard(ctx.from.id); return ctx.reply('Bu kanal allaqachon qo\u2019shilgan.', mainMenu()); }
      await Channel.create({ chatId: String(chat.id), title: chat.title || text, username: text });
      resetWizard(ctx.from.id);
      return ctx.reply(`✅ Kanal qo\u2019shildi: ${chat.title || text}`, mainMenu());
    } catch (e) {
      return ctx.reply('❌ Kanal topilmadi. Bot kanalga admin qilib qo\u2019yilganini tekshiring.');
    }
  }

  if (state.step === 'name') {
    state.data.name = text;
    state.step = 'description';
    return ctx.reply('📝 Tavsif yuboring (bo\u2019lmasa "-" yuboring):');
  }

  if (state.step === 'description') {
    state.data.description = text === '-' ? '' : text;
    state.step = 'price';
    return ctx.reply('💰 Narxini so\u2019mda yuboring (masalan: 150000):');
  }

  if (state.step === 'price') {
    const price = Number(text.replace(/\s|,/g, ''));
    if (!price || price <= 0) return ctx.reply('❗️ Narxni faqat raqamda yuboring, masalan: 150000');
    state.data.price = price;
    state.step = 'category';
    return ctx.reply('🏷 Kategoriya yuboring (bo\u2019lmasa "-" yuboring):');
  }

  if (state.step === 'category') {
    state.data.category = text === '-' ? 'umumiy' : text;
    state.step = 'photo';
    return ctx.reply('🖼 Mahsulot rasmini yuboring:');
  }

  return next();
});

// Forward qilingan postlar orqali kanal qo'shish (rasmli yoki rasmsiz)
bot.on('message', async (ctx, next) => {
  if (!isAdmin(ctx)) return next();
  const state = wizard.get(ctx.from.id);
  if (state?.step !== 'ch_wait') return next();
  const fwdChat = ctx.message.forward_from_chat;
  if (fwdChat && fwdChat.type === 'channel') {
    const exists = await Channel.findOne({ chatId: String(fwdChat.id) });
    if (exists) { resetWizard(ctx.from.id); return ctx.reply('Bu kanal allaqachon qo\u2019shilgan.', mainMenu()); }
    await Channel.create({
      chatId: String(fwdChat.id),
      title: fwdChat.title || '',
      username: fwdChat.username ? `@${fwdChat.username}` : ''
    });
    resetWizard(ctx.from.id);
    return ctx.reply(`✅ Kanal qo\u2019shildi: ${fwdChat.title || fwdChat.id}`, mainMenu());
  }
  return next();
});

// Mahsulot rasmi (wizard oxirgi qadami)
bot.on('photo', async (ctx, next) => {
  if (!isAdmin(ctx)) return next();
  const state = wizard.get(ctx.from.id);
  if (state?.step !== 'photo') return next();

  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id; // eng katta o'lchami
  state.data.fileId = fileId;

  const product = await Product.create({ ...state.data });
  resetWizard(ctx.from.id);

  await ctx.reply(`✅ Mahsulot qo\u2019shildi: *${product.name}*`, { parse_mode: 'Markdown', ...mainMenu() });
  await postProductToChannels(product);
});

// ================== MAHSULOTNI KANALGA JOYLASH ==================
async function postProductToChannels(product) {
  const channels = await Channel.find({ postProducts: true });
  if (!channels.length) return;

  const caption =
    `🛍 *${product.name}*\n\n` +
    `${product.description ? product.description + '\n\n' : ''}` +
    `💰 *${product.price.toLocaleString()} so'm*\n🏷 ${product.category}`;

  const kb = Markup.inlineKeyboard([
    [Markup.button.url('🛒 Buyurtma berish', `https://t.me/${process.env.BOT_USERNAME}?start=order_${product._id}`)]
  ]);

  for (const ch of channels) {
    try {
      const photoSource = product.fileId || product.image;
      if (photoSource) {
        await bot.telegram.sendPhoto(ch.chatId, photoSource, { caption, parse_mode: 'Markdown', ...kb });
      } else {
        await bot.telegram.sendMessage(ch.chatId, caption, { parse_mode: 'Markdown', ...kb });
      }
    } catch (e) {
      console.error(`Kanalga postlashda xato (${ch.chatId}):`, e.message);
    }
  }
}

module.exports = { bot, notifyAdmin, statusText, isAdmin, getUnjoinedChannels };
