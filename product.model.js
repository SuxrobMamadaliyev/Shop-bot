const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true }, // so'mda
  image: { type: String, default: '' },     // to'g'ridan-to'g'ri URL (ixtiyoriy)
  fileId: { type: String, default: '' },    // Telegram file_id (admin panel orqali yuklangan rasm)
  category: { type: String, default: 'umumiy' },
  inStock: { type: Boolean, default: true },
  channelMessageId: { type: Number, default: null }, // kanaldagi post ID (keyin yangilash/o'chirish uchun)
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);
