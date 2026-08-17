const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: String,
  price: Number,
  qty: Number
}, { _id: false });

const orderSchema = new mongoose.Schema({
  telegramUserId: { type: String, required: true },
  telegramUsername: String,
  fullName: String,
  phone: String,
  address: String,
  items: [orderItemSchema],
  totalAmount: { type: Number, required: true }, // so'mda
  status: {
    type: String,
    enum: ['pending', 'awaiting_payment', 'paid', 'processing', 'delivered', 'cancelled'],
    default: 'pending'
  },
  payxPaymentId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);
