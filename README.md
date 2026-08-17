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

## Mahsulot qo'shish

```bash
curl -X POST https://sizning-domen/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Krossovka","price":250000,"image":"https://...","category":"kiyim"}'
```

⚠️ Bu endpoint hozir ochiq — productionga chiqarishdan oldin admin autentifikatsiya qo'shing.
