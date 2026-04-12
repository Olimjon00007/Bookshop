# Backend O'rnatish — Kitob Do'koni

## O'rnatish

**1. Node.js o'rnatish** (agar o'rnatilmagan bo'lsa):
[nodejs.org](https://nodejs.org/) dan eng so'nggi LTS versiyasini yuklab oling.

**2. Bog'liqliklarni o'rnatish:**
```bash
npm install
```

**3. `.env` fayl yaratish:**
```env
JWT_SECRET=bu_yerga_uzun_tasodifiy_kalit_yozing
PORT=3000
NODE_ENV=development
```

> ⚠️ `JWT_SECRET` bo'sh qoldirilsa server ishlamaydi. Ishlab chiqarishda kamida 32 belgili tasodifiy qator ishlating.

## Serverni ishga tushirish

```bash
# Ishlab chiqish rejimi (fayl o'zgarsa avtomatik qayta yuklaydi)
npm run dev

# Oddiy rejim
npm start
```

Server `http://localhost:3000` manzilida ishga tushadi.
Frontend va backend bir xil portda ishlaydi — statik fayllar Express tomonidan uzatiladi.

## Boshlang'ich ma'lumotlar

Birinchi ishga tushirilganda ikki admin hisobi avtomatik yaratiladi:

| Foydalanuvchi nomi | Parol     | Rol   |
|--------------------|-----------|-------|
| `owner`            | admin123  | admin |
| `admin`            | admin123  | admin |

> Ishlab chiqarishda bu parollarni darhol o'zgartiring.

## Ma'lumotlar bazasi

SQLite (`bookshop.db`) — server ishga tushganda avtomatik yaratiladi. Jadvallar:

| Jadval | Tavsif |
|--------|--------|
| `users` | Foydalanuvchilar (ism, telefon, username, parol, rol) |
| `books` | Kitoblar (sarlavha, muallif, janr, yil, muqova, holat, ko'rishlar) |
| `favorites` | Sevimlilar (user_id, book_id) |
| `reading_status` | O'qish holati (xohlayapman / oqiyapman / oqidim) |
| `ratings` | Reytinglar va sharhlar (1–5 yulduz) |

---

## API Yo'llari

Barcha himoyalangan yo'llar `Authorization: Bearer <token>` sarlavhasini talab qiladi.

### Autentifikatsiya

| Metod | Yo'l | Himoya | Tavsif |
|-------|------|--------|--------|
| POST | `/api/register` | — | Yangi hisob yaratish |
| POST | `/api/login` | — | Kirish, JWT token qaytaradi |
| POST | `/api/logout` | — | Faqat client tomonida (stateless) |
| POST | `/api/change-password` | ✓ | Parol o'zgartirish |

**Ro'yxatdan o'tish — so'rov tanasi:**
```json
{
  "fullname": "Ism Familiya",
  "phone": "+998901234567",
  "username": "username",
  "password": "kamida8belgi"
}
```

**Kirish — javob:**
```json
{
  "token": "eyJ...",
  "user": { "id": 1, "fullname": "...", "username": "...", "role": "user" }
}
```

**Parol o'zgartirish — so'rov tanasi:**
```json
{
  "currentPassword": "joriyParol",
  "newPassword": "yangiParol"
}
```

---

### Kitoblar

| Metod | Yo'l | Himoya | Tavsif |
|-------|------|--------|--------|
| GET | `/api/books` | — | Kitoblar ro'yxati (filtr + sahifalash + saralash) |
| GET | `/api/books/:id` | — | Bitta kitob (ko'rishlar sonini oshiradi) |
| POST | `/api/books` | ✓ | Kitob qo'shish |
| PUT | `/api/books/:id` | ✓ | Kitobni yangilash (egasi yoki admin) |
| DELETE | `/api/books/:id` | ✓ | Kitobni o'chirish (egasi yoki admin) |
| GET | `/api/search` | — | Autocomplete qidiruv (`?q=`, `?limit=`) |

**GET /api/books — so'rov parametrlari:**

| Parametr | Tavsif | Misol |
|----------|--------|-------|
| `genre` | Janr bo'yicha filtr | `genre=Roman` |
| `author` | Muallif bo'yicha qidirish | `author=Qodiriy` |
| `year` | Yil bo'yicha filtr | `year=1926` |
| `search` | Sarlavha yoki muallif bo'yicha qidirish | `search=o'tkan` |
| `sort` | Saralash tartibi | `sort=rating` |
| `page` | Sahifa raqami (standart: 1) | `page=2` |
| `limit` | Sahifadagi kitoblar soni (standart: 20, max: 50) | `limit=10` |

**`sort` parametri qiymatlari:**
- `newest` — yangi qo'shilgan (standart)
- `oldest` — eski qo'shilgan
- `rating` — yuqori baholangan
- `views` — ko'p ko'rilgan
- `title` — nomi bo'yicha (A–Z)

**Javob formati:**
```json
{
  "books": [...],
  "total": 42,
  "page": 1,
  "pages": 3
}
```

**Kitob ob'ekti:**
```json
{
  "id": 1,
  "title": "O'tkan kunlar",
  "author": "Abdulla Qodiriy",
  "genre": "Tarixiy",
  "year": 1926,
  "cover": "default-book.png",
  "status": "Mavjud",
  "views": 15,
  "avg_rating": 4.5,
  "rating_count": 8,
  "addedBy": { "id": 1, "fullname": "Egasi", "username": "owner" }
}
```

---

### Sevimlilar

| Metod | Yo'l | Himoya | Tavsif |
|-------|------|--------|--------|
| GET | `/api/favorites` | ✓ | Sevimli kitoblar ro'yxati |
| POST | `/api/favorites/:bookId` | ✓ | Sevimlilarga qo'shish |
| DELETE | `/api/favorites/:bookId` | ✓ | Sevimlilardan olib tashlash |

---

### O'qish holati va Reytinglar

| Metod | Yo'l | Himoya | Tavsif |
|-------|------|--------|--------|
| GET | `/api/books/:id/reading-status` | ✓ | O'qish holatini olish |
| POST | `/api/books/:id/reading-status` | ✓ | O'qish holatini o'rnatish |
| GET | `/api/books/:id/ratings` | — | Reytinglar va sharhlar |
| POST | `/api/books/:id/ratings` | ✓ | Reyting qo'shish yoki yangilash |

**O'qish holati qiymatlari:** `xohlayapman` · `oqiyapman` · `oqidim`

**Reyting qo'shish — so'rov tanasi:**
```json
{
  "rating": 5,
  "review": "Ajoyib kitob!"
}
```

**Reytinglar javobi:**
```json
{
  "avg": 4.5,
  "count": 8,
  "reviews": [
    { "user": "username", "rating": 5, "review": "...", "date": "2026-03-28" }
  ]
}
```

---

### Foydalanuvchilar va Statistika

| Metod | Yo'l | Himoya | Tavsif |
|-------|------|--------|--------|
| GET | `/api/profile/:userId` | — | Ommaviy foydalanuvchi profili |
| PUT | `/api/profile` | ✓ | O'z profilini yangilash (ism, telefon) |
| GET | `/api/analytics` | ✓ | Shaxsiy statistika |
| GET | `/api/genres` | — | Barcha janrlar ro'yxati |
| GET | `/api/users` | admin | Barcha foydalanuvchilar (faqat admin) |

**Analitika javobi:**
```json
{
  "totalBooks": 42,
  "readBooks": 15,
  "favorites": 7,
  "newBooks": 3
}
```

---

## Xavfsizlik

- Parollar `bcrypt` (12 tur) bilan hashlanadi
- JWT tokenlari 7 kun amal qiladi
- Login uchun so'rovlar cheklovi: 15 daqiqada 10 ta urinish
- `helmet` middleware HTTP sarlavhalarini himoyalaydi
- Barcha foydalanuvchi ma'lumotlari frontend da `esc()` yordamida XSS dan himoyalanadi
- Kitob saralash uchun oq ro'yxat ishlatiladi (SQL in'ektsiyasidan himoya)
