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

// ================== YORDAMCHI: XABAR KO'RSATISH ==================
function showAlert(message) {
  if (tg?.showAlert) {
    tg.showAlert(message);
  } else {
    alert(message);
  }
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, 2200);
}

// ================== SAVAT ==================
window.addToCart = function (id) {
  const product = products.find(p => p._id === id);
  if (!product) return;
  if (!cart[id]) cart[id] = { product, qty: 0 };
  cart[id].qty += 1;
  updateCartBar();
  if (!document.getElementById('cartModal').classList.contains('hidden')) renderCartModal();
  tg.HapticFeedback?.impactOccurred('light');
  showToast(`✅ ${product.name} savatga qo'shildi`);
};

window.increaseQty = function (id) {
  if (!cart[id]) return;
  cart[id].qty += 1;
  updateCartBar();
  renderCartModal();
  tg.HapticFeedback?.impactOccurred('light');
};

window.decreaseQty = function (id) {
  if (!cart[id]) return;
  cart[id].qty -= 1;
  if (cart[id].qty <= 0) delete cart[id];
  updateCartBar();
  renderCartModal();
  tg.HapticFeedback?.impactOccurred('light');
};

window.removeFromCart = function (id) {
  delete cart[id];
  updateCartBar();
  renderCartModal();
  tg.HapticFeedback?.impactOccurred('medium');
};

function cartTotals() {
  const items = Object.values(cart);
  const count = items.reduce((s, i) => s + i.qty, 0);
  const total = items.reduce((s, i) => s + i.qty * i.product.price, 0);
  return { count, total };
}

function updateCartBar() {
  const { count, total } = cartTotals();

  const bar = document.getElementById('cartBar');
  bar.classList.toggle('hidden', count === 0);
  document.getElementById('cartInfo').textContent = `${count} ta mahsulot — ${total.toLocaleString()} so'm`;

  const badge = document.getElementById('navCartBadge');
  badge.textContent = count;
  badge.classList.toggle('hidden', count === 0);
}

function renderCartModal() {
  const container = document.getElementById('cartItems');
  const summary = document.getElementById('cartSummary');
  const form = document.getElementById('checkoutForm');
  const items = Object.entries(cart);

  if (!items.length) {
    container.innerHTML = '<p class="empty-state">Savat bo\'sh. Mahsulot qo\'shib ko\'ring 🛍</p>';
    summary.classList.add('hidden');
    form.classList.add('hidden');
    return;
  }

  container.innerHTML = items.map(([id, i]) => `
    <div class="cart-item">
      <img src="${productImage(i.product)}" alt="${i.product.name}" class="cart-item-img" />
      <div class="cart-item-info">
        <span class="cart-item-name">${i.product.name}</span>
        <span class="cart-item-price">${(i.product.price * i.qty).toLocaleString()} so'm</span>
      </div>
      <div class="qty-stepper">
        <button type="button" onclick="decreaseQty('${id}')" aria-label="Kamaytirish">−</button>
        <span>${i.qty}</span>
        <button type="button" onclick="increaseQty('${id}')" aria-label="Ko'paytirish">+</button>
      </div>
      <button type="button" class="remove-btn" onclick="removeFromCart('${id}')" aria-label="O'chirish">🗑</button>
    </div>
  `).join('');

  const { count, total } = cartTotals();
  document.getElementById('summaryCount').textContent = `${count} ta`;
  document.getElementById('summaryTotal').textContent = `${total.toLocaleString()} so'm`;
  summary.classList.remove('hidden');
  form.classList.remove('hidden');
}

document.getElementById('cartBtn').onclick = () => {
  renderCartModal();
  document.getElementById('cartModal').classList.remove('hidden');
};
document.getElementById('closeCart').onclick = () => {
  document.getElementById('cartModal').classList.add('hidden');
};

function setCheckoutLoading(loading) {
  const btn = document.getElementById('checkoutBtn');
  btn.disabled = loading;
  btn.querySelector('.btn-label').classList.toggle('hidden', loading);
  btn.querySelector('.btn-spinner').classList.toggle('hidden', !loading);
}

function isValidPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 9;
}

document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const { count } = cartTotals();
  if (!count) {
    showAlert('Savat bo\'sh. Avval mahsulot qo\'shing.');
    return;
  }

  const fullName = document.getElementById('fullName').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const address = document.getElementById('address').value.trim();

  if (!fullName || fullName.length < 3) {
    showAlert('Iltimos, ism familiyangizni to\'liq kiriting');
    return;
  }
  if (!phone || !isValidPhone(phone)) {
    showAlert('Iltimos, to\'g\'ri telefon raqam kiriting');
    return;
  }
  if (!address || address.length < 5) {
    showAlert('Iltimos, yetkazib berish manzilini to\'liq kiriting');
    return;
  }

  const items = Object.values(cart).map(i => ({
    productId: i.product._id,
    name: i.product.name,
    price: i.product.price,
    qty: i.qty
  }));

  setCheckoutLoading(true);
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

    if (!res.ok) {
      showAlert(data.error || 'Buyurtmani yaratib bo\'lmadi, qaytadan urinib ko\'ring');
      setCheckoutLoading(false);
      return;
    }

    document.getElementById('cartModal').classList.add('hidden');
    showOrderSuccess(data);

    cart = {};
    updateCartBar();
    document.getElementById('checkoutForm').reset();
  } catch (e) {
    showAlert('Internet aloqasida xatolik, qaytadan urinib ko\'ring');
  } finally {
    setCheckoutLoading(false);
  }
});

function showOrderSuccess(order) {
  const overlay = document.createElement('div');
  overlay.className = 'sub-gate';
  overlay.innerHTML = `
    <div class="sub-gate-card success-card">
      <div class="success-icon">✅</div>
      <h2>Buyurtma qabul qilindi!</h2>
      <p>Buyurtma raqami: <b>#${(order.orderId || '').toString().slice(-6)}</b></p>
      <p>Jami: <b>${(order.totalAmount || 0).toLocaleString()} so'm</b></p>
      ${order.paymentUrl
        ? `<button id="goPay">💳 To'lovni amalga oshirish</button>`
        : `<p class="hint">To'lov havolasini olishda muammo bo'ldi — admin siz bilan bog'lanadi.</p>`}
      <button id="goOrders" class="secondary-btn">📦 Buyurtmalarimni ko'rish</button>
    </div>
  `;
  document.body.appendChild(overlay);

  if (order.paymentUrl) {
    document.getElementById('goPay').onclick = () => {
      tg.openLink(order.paymentUrl);
    };
  }
  document.getElementById('goOrders').onclick = () => {
    overlay.remove();
    switchPage('orders');
  };
}

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
