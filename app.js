const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const API_URL = window.location.origin;

let products = [];
let cart = {};

async function loadProducts() {
  const res = await fetch(`${API_URL}/api/products`);
  products = await res.json();
  renderProducts();
}

function renderProducts() {
  const list = document.getElementById('productList');
  list.innerHTML = products.map(p => `
    <div class="product-card">
      <img src="${p.image || 'https://placehold.co/200x150?text=Rasm'}" alt="${p.name}" />
      <h3>${p.name}</h3>
      <div class="price">${p.price.toLocaleString()} so'm</div>
      <button onclick="addToCart('${p._id}')">Qo'shish</button>
    </div>
  `).join('');
}

window.addToCart = function (id) {
  const product = products.find(p => p._id === id);
  if (!product) return;
  if (!cart[id]) cart[id] = { product, qty: 0 };
  cart[id].qty += 1;
  updateCartBar();
  tg.HapticFeedback?.impactOccurred('light');
};

function updateCartBar() {
  const items = Object.values(cart);
  const count = items.reduce((s, i) => s + i.qty, 0);
  const total = items.reduce((s, i) => s + i.qty * i.product.price, 0);
  const bar = document.getElementById('cartBar');
  if (count === 0) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');
  document.getElementById('cartInfo').textContent = `${count} ta mahsulot — ${total.toLocaleString()} so'm`;
}

function renderCartModal() {
  const container = document.getElementById('cartItems');
  const items = Object.values(cart);
  container.innerHTML = items.map(i => `
    <div class="cart-item">
      <span>${i.product.name} x${i.qty}</span>
      <span>${(i.product.price * i.qty).toLocaleString()} so'm</span>
    </div>
  `).join('') || '<p>Savat bo\'sh</p>';
}

document.getElementById('cartBtn').onclick = () => {
  renderCartModal();
  document.getElementById('cartModal').classList.remove('hidden');
};
document.getElementById('closeCart').onclick = () => {
  document.getElementById('cartModal').classList.add('hidden');
};

document.getElementById('checkoutBtn').onclick = async () => {
  const fullName = document.getElementById('fullName').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const address = document.getElementById('address').value.trim();

  if (!fullName || !phone || !address) {
    tg.showAlert('Iltimos, barcha maydonlarni to\'ldiring');
    return;
  }

  const items = Object.values(cart).map(i => ({
    productId: i.product._id,
    name: i.product.name,
    price: i.product.price,
    qty: i.qty
  }));

  const user = tg.initDataUnsafe?.user || {};

  try {
    const res = await fetch(`${API_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramUserId: String(user.id || ''),
        telegramUsername: user.username || '',
        fullName, phone, address, items
      })
    });
    const data = await res.json();

    if (data.paymentUrl) {
      tg.sendData(JSON.stringify({ orderId: data.orderId }));
      tg.openLink(data.paymentUrl);
      cart = {};
      updateCartBar();
      document.getElementById('cartModal').classList.add('hidden');
    }
  } catch (e) {
    tg.showAlert('Xatolik yuz berdi, qaytadan urinib ko\'ring');
  }
};

loadProducts();
