# Shop Bot — Telegram Mini App do'kon (PayX to'lov tizimi bilan)

Barcha fayllar bitta papkada, subfolder yo'q.

## Fayllar

| Fayl | Vazifasi |
|---|---|
| `server.js` | Express server, API, Telegram va PayX webhooklari |
| `bot.js` | Telegraf bot (Mini App tugmasi, admin xabarnoma) |
| `payx.js` | PayX to'lov tizimi integratsiyasi (havola yaratish + webhook) |
| `product.model.js` | Mahsulot MongoDB modeli |
| `order.model.js` | Buyurtma MongoDB modeli |
| `index.html`, `app.js`, `style.css` | Telegram Mini App (frontend) |
| `.env.example` | Muhit o'zgaruvchilari namunasi |

## O'rnatish

```bash
npm install
cp .env.example .env
# .env faylini to'ldiring
npm run dev
```

## ⚠️ PayX haqida muhim eslatma

PayX (payx.uz) saytining ochiq API hujjatlari internetda topilmadi — sayt login talab qiladi va JavaScript orqali render bo'ladi. `payx.js` fayli **odatiy agregator patterni** asosida yozilgan (API key bilan to'lov havolasi yaratish + webhook orqali holat qabul qilish), lekin quyidagilarni albatta PayX shaxsiy kabinetingizdagi "API hujjatlar" bo'limidan tekshirib, moslashtiring:

1. **`PAYX_API_URL`** — to'g'ri bazaviy manzil (`https://api.payx.uz/v1` — bu taxminiy, o'zgarishi mumkin)
2. **So'rov formati** — `payx.js` dagi `createPayment` funksiyasidagi maydon nomlari (`amount`, `order_id`, `return_url`...) PayX kutgan nomlar bilan bir xil bo'lishi kerak
3. **Webhook imzosi** — `verifyWebhookSignature` funksiyasi HMAC-SHA256 va `x-payx-signature` header nomini taxmin qilmoqda; PayX boshqacha usul ishlatishi mumkin
4. **Javob maydonlari** — `data.payment_url`, `data.payment_id` kabi nomlar ham tekshirilishi kerak

Aniq hujjatni PayX kabinetiga kirib, "API hujjatlar" tugmasidan oling — shundan keyin men `payx.js`ni sizga aniq moslashtirib beraman (agar hujjat matnini yoki skrinshotlarini yuborsangiz).

## Kerakli qadamlar

1. **Bot** — @BotFather orqali yarating, tokenni `.env`ga yozing
2. **Mini App URL** — BotFather'da web app URL sozlang (deploydan keyin)
3. **MongoDB Atlas** — cluster yarating, `MONGO_URI`ga qo'ying
4. **PayX** — kabinetdan API key, merchant ID va webhook maxfiy kalitini oling

## Deploy (Render)

1. Yangi Web Service, shu papkani ulang
2. Build: `npm install`
3. Start: `npm start`
4. Barcha `.env` qiymatlarini Environment Variables'ga kiriting (`API_URL` — Render domeni)
5. PayX kabinetida webhook (callback) URL sifatida `https://sizning-domen/payx/webhook` ni ko'rsating

## 🛠 Admin panel (botda, `/admin`)

Endi mahsulot qo'shish, majburiy obuna kanallarini boshqarish va buyurtmalarni ko'rish uchun alohida veb-panel emas, **botning o'zida** to'liq admin panel bor — chunki bu variant tezroq ishlaydi, alohida login/parol tizimi kerak qilmaydi va Telegram ichida qulay ishlaydi. Xohlasangiz, keyinchalik web-app ichiga alohida "Admin" tab sifatida ham qo'shish mumkin (pastga qarang).

`.env` faylida `ADMIN_IDS` ga o'zingizning Telegram ID(lar)ingizni yozing (vergul bilan bir nechtasi bo'lishi mumkin), so'ng botga `/admin` yuboring:

- **📦 Mahsulotlar** — ➕ qo'shish (nom → tavsif → narx → kategoriya → rasm, bosqichma-bosqich so'raladi), ro'yxat, sotuvdan olish/qaytarish, o'chirish
- **📢 Majburiy kanallar** — ➕ qo'shish (kanaldan post forward qiling yoki @username yuboring — bot kanalda **admin** bo'lishi shart), har bir kanalni "majburiy obuna" va/yoki "mahsulotlar shu yerga postlansin" qilib belgilash, o'chirish
- **🧾 Buyurtmalar** — so'nggi 10 ta buyurtma va holati
- **📊 Statistika** — mahsulotlar/buyurtmalar soni va to'langan savdo summasi

### Mahsulot → kanalga avtomatik post
"Mahsulotlar shu yerga postlansin" belgilangan kanal(lar) bo'lsa, admin panelda yangi mahsulot qo'shilganda bot **rasm + tavsif + narx** bilan postni avtomatik yuboradi, tagida **"🛒 Buyurtma berish"** tugmasi bo'ladi. Foydalanuvchi bosganda bot bilan chat ochiladi, obuna tekshiriladi, so'ng **to'g'ridan-to'g'ri o'sha mahsulot ochiq holda** Mini App ochiladi.

### Majburiy obuna
`/start` bosilganda bot barcha "majburiy obuna" kanallariga a'zolikni tekshiradi; a'zo bo'lmasa kanal havolalari va "✅ Tekshirish" tugmasi bilan xabar chiqadi. Bundan tashqari, Mini App ochilganda ham (`/api/check-subscription/:userId`) qo'shimcha tekshiruv ishlaydi — ikkala joyda ham himoya bor.

### Web-app ichida admin panel haqida
Savolingizga javoban: ha, admin panelni web appga (Mini App frontendiga) ham qo'shish **mumkin**, lekin bu uchun web tomonda login qilish/tasdiqlash tizimi (masalan, faqat admin Telegram ID kirganda ko'rinadigan "Admin" tab, `initData` orqali serverda tekshirish) kerak bo'ladi — bu xavfsizlik uchun muhim, aks holda har kim mahsulot qo'sha oladi. Hozircha botdagi `/admin` tezroq va xavfsizroq variant sifatida tanlandi. Agar buni ham xohlasangiz, alohida "Admin" tab qo'shib beraman — shunda mahsulot qo'shish/kanal boshqarish web appning o'zidan ham qilinadi.

## Mahsulot qo'shish (API orqali, ixtiyoriy)

```bash
curl -X POST https://sizning-domen/api/products \
  -H "Content-Type: application/json" \
  -H "x-admin-key: SIZNING_ADMIN_API_KEY" \
  -d '{"name":"Krossovka","price":250000,"image":"https://...","category":"kiyim"}'
```

Bu endpoint endi `x-admin-key` header (`.env` dagi `ADMIN_API_KEY`) to'g'ri kelmasa ishlamaydi. Odatiy holatda mahsulot qo'shish uchun botdagi `/admin` panelidan foydalaning.
