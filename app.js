const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const API_URL = window.location.origin;
const user = tg.initDataUnsafe?.user || {};

let products = [];
let cart = {};

// ================== NAVBAR ==================
const pages = { shop: 'page-shop', orders: 'page-orders', profile: 'page-profile' };

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.page;
    if (target === 'cart') {
      renderCartModal();
      document.getElementById('cartModal').classList.remove('hidden');
      return; // "Savat" alohida sahifa emas, modal ochadi
    }
    switchPage(target);
  });
});

function switchPage(target) {
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.page === target);
  });
  Object.entries(pages).forEach(([key, id]) => {
    document.getElementById(id).classList.toggle('hidden', key !== target);
  });
  if (target === 'orders') loadOrders();
  if (target === 'profile') renderProfile();
}

// ================== DO'KON / MAHSULOTLAR ==================
async function loadProducts() {
  try {
    const res = await fetch(`${API_URL}/api/products`);
    if (!res.ok) throw new Error(`Server xatosi: ${res.status}`);
    products = await res.json();
    if (!products.length) {
      document.getElementById('productList').innerHTML =
        '<p class="empty-state">Hozircha mahsulot yo\'q.</p>';
      return;
    }
    renderProducts();
  } catch (e) {
    document.getElementById('productList').innerHTML =
      `<p class="empty-state" style="color:#ff6b6b">Xatolik: mahsulotlarni yuklab bo'lmadi.<br><small>${e.message}</small></p>`;
    console.error('loadProducts xato:', e);
  }
}

function productImage(p) {
  if (p.image) return p.image;
  if (p.fileId) return `${API_URL}/image/${p.fileId}`;
  return 'https://placehold.co/200x150?text=Rasm';
}

function renderProducts() {
  const list = document.getElementById('productList');
  const highlightId = new URLSearchParams(window.location.search).get('product');
  list.innerHTML = products.map(p => `
    <div class="product-card${p._id === highlightId ? ' highlight' : ''}" id="product-${p._id}">
      <img src="${productImage(p)}" alt="${p.name}" />
      <h3>${p.name}</h3>
      <div class="price">${p.price.toLocaleString()} so'm</div>
      <button onclick="addToCart('${p._id}')">Qo'shish</button>
    </div>
  `).join('');

  if (highlightId) {
    const el = document.getElementById(`product-${highlightId}`);
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
    }
  }
}

// ================== SAVAT ==================
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
  bar.classList.toggle('hidden', count === 0);
  document.getElementById('cartInfo').textContent = `${count} ta mahsulot — ${total.toLocaleString()} so'm`;

  const badge = document.getElementById('navCartBadge');
  badge.textContent = count;
  badge.classList.toggle('hidden', count === 0);
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

// ================== BUYURTMALARIM ==================
const statusLabels = {
  pending: '⏳ Kutilmoqda',
  awaiting_payment: '💳 To\'lov kutilmoqda',
  paid: '✅ To\'landi',
  processing: '📦 Tayyorlanmoqda',
  delivered: '🚚 Yetkazildi',
  cancelled: '❌ Bekor qilindi'
};

async function loadOrders() {
  const list = document.getElementById('ordersList');
  if (!user.id) {
    list.innerHTML = '<p class="empty-state">Foydalanuvchi aniqlanmadi.</p>';
    return;
  }
  list.innerHTML = '<p class="empty-state">Yuklanmoqda...</p>';
  try {
    const res = await fetch(`${API_URL}/api/orders/user/${user.id}`);
    const orders = await res.json();
    if (!orders.length) {
      list.innerHTML = '<p class="empty-state">Sizda hali buyurtmalar yo\'q.</p>';
      return;
    }
    list.innerHTML = orders.map(o => `
      <div class="order-card">
        <div class="order-top">
          <span>#${o._id.slice(-6)}</span>
          <span>${o.totalAmount.toLocaleString()} so'm</span>
        </div>
        <div class="order-status">${statusLabels[o.status] || o.status}</div>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = '<p class="empty-state" style="color:#ff6b6b">Buyurtmalarni yuklab bo\'lmadi.</p>';
  }
}

// ================== PROFIL ==================
async function renderProfile() {
  const container = document.getElementById('profileInfo');
  const initial = (user.first_name || 'U')[0].toUpperCase();
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Foydalanuvchi';

  container.innerHTML = `
    <div class="avatar-wrap">
      ${user.photo_url ? `<img class="avatar-img" src="${user.photo_url}" alt="${fullName}" />` : `<div class="avatar">${initial}</div>`}
      ${user.is_premium ? '<span class="premium-badge" title="Telegram Premium">⭐</span>' : ''}
    </div>
    <h3>${fullName}</h3>
    <p>${user.username ? '@' + user.username : ''}</p>
    <div class="profile-stats">
      <div class="stat"><span class="stat-icon">🆔</span><span class="stat-label">ID</span><span class="stat-value">${user.id || '-'}</span></div>
      <div class="stat"><span class="stat-icon">📦</span><span class="stat-label">Buyurtmalar</span><span class="stat-value" id="statOrders">…</span></div>
      <div class="stat"><span class="stat-icon">💰</span><span class="stat-label">Jami xarid</span><span class="stat-value" id="statSpent">…</span></div>
    </div>
  `;

  if (!user.id) return;
  try {
    const res = await fetch(`${API_URL}/api/orders/user/${user.id}`);
    const orders = await res.json();
    document.getElementById('statOrders').textContent = orders.length;
    const spent = orders.filter(o => ['paid', 'delivered'].includes(o.status)).reduce((s, o) => s + o.totalAmount, 0);
    document.getElementById('statSpent').textContent = spent.toLocaleString() + " so'm";
  } catch (e) {
    // jim turadi — profil asosiy ma'lumotlari baribir ko'rinadi
  }
}

// ================== MAJBURIY OBUNA TEKSHIRUVI (himoya qatlami) ==================
async function checkSubscriptionGate() {
  if (!user.id) return;
  try {
    const res = await fetch(`${API_URL}/api/check-subscription/${user.id}`);
    const data = await res.json();
    if (!data.subscribed && data.channels.length) {
      const overlay = document.createElement('div');
      overlay.className = 'sub-gate';
      overlay.innerHTML = `
        <div class="sub-gate-card">
          <h2>📢 Obuna talab qilinadi</h2>
          <p>Do'kondan foydalanish uchun quyidagi kanallarga obuna bo'ling:</p>
          <div class="sub-gate-list">
            ${data.channels.map(ch => `<a href="${ch.url}" target="_blank" class="sub-gate-link">📢 ${ch.title || ch.username}</a>`).join('')}
          </div>
          <button id="subGateCheck">✅ Tekshirish</button>
        </div>
      `;
      document.body.appendChild(overlay);
      document.getElementById('subGateCheck').onclick = () => window.location.reload();
    }
  } catch (e) {
    // API mavjud bo'lmasa jim o'tkazib yuboriladi — bot tomonidagi tekshiruv baribir ishlaydi
  }
}

checkSubscriptionGate();
loadProducts();
