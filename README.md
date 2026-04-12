# Kitob Do'koni

Shaxsiy kitob katalogi dasturi — kitob qo'shish, ko'rish, baholash va o'qishni kuzatish. Frontend vanilla HTML/CSS/JS, backend Express + SQLite asosida qurilgan.

## Xususiyatlar

- Janr bo'yicha ko'rish, sarlavha yoki muallif bo'yicha qidirish
- Kitob qo'shish (ixtiyoriy muqova rasm bilan, base64 formatda saqlanadi)
- Kitobni tahrirlash va o'chirish (egasi yoki admin)
- 1–5 yulduz reyting va sharh yozish
- O'qish holati: "O'qimoqchiman", "O'qiyapman", "O'qidim"
- Sevimlilar ro'yxati
- Analitika kartasi (jami, o'qilgan, sevimlilar, bu oy qo'shilgan)
- Saralash: yangi / eski / yuqori baholangan / ko'p ko'rilgan / nomi bo'yicha
- Parol o'zgartirish
- JWT asosidagi autentifikatsiya (7 kunlik token)
- Login uchun so'rovlar cheklovi (15 daqiqada 10 ta urinish)

## Texnologiyalar

| Qatlam    | Texnologiya                        |
|-----------|------------------------------------|
| Frontend  | HTML5, CSS3, Vanilla JS (ES6+)     |
| Backend   | Node.js, Express 4                 |
| Ma'lumotlar bazasi | SQLite (`better-sqlite3`) |
| Autentifikatsiya | JWT + bcrypt                |

## Ishga tushirish

Batafsil o'rnatish bo'yicha [BACKEND_SETUP.md](BACKEND_SETUP.md) faylini ko'ring.

```bash
npm install
npm run dev        # ishlab chiqish rejimi (auto-qayta yuklash)
npm start          # oddiy rejim
```

Brauzerda [http://localhost:3000](http://localhost:3000) manzilini oching.

## Fayl tuzilmasi

```
kitob-dokoni/
├── server.js          # Express ilovasi + SQLite + barcha API yo'llari
├── index.html         # Bir sahifali dashboard
├── script.js          # Frontend mantiqi (fetch, UI, holat)
├── styles.css         # Barcha uslublar (och tema, moslashuvchan)
├── BACKEND_SETUP.md   # Backend o'rnatish va API hujjati
├── package.json
└── .env               # JWT_SECRET, PORT (git ga yuklanmaydi)
```
