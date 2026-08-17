const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
  chatId: { type: String, required: true },      // -100xxxxxxxxxx yoki @username
  title: { type: String, default: '' },
  username: { type: String, default: '' },        // @siz — havola yasash uchun
  isMandatory: { type: Boolean, default: true },   // majburiy obuna sifatida tekshiriladimi
  postProducts: { type: Boolean, default: false }, // yangi mahsulotlar shu kanalga joylansinmi
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Channel', channelSchema);
