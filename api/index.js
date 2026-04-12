require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const supabase = require('../lib/supabase');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "data:"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://tkqaimdcolbqtwzclmna.supabase.co"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    }
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*'
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


// Login uchun rate limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Juda ko'p urinish. 15 daqiqadan so'ng qayta urinib ko'ring" }
});

// ─── JWT Auth middleware ──────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ message: 'Token kerak' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Token yaroqsiz' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ message: "Ruxsat yo'q" });
    }
    next();
  };
}

// ─── Yordamchi funksiya ───────────────────────────────────────────────────────

const ALLOWED_GENRES = ["Fantastika", "Ilmiy fantastika", "Roman", "Detektiv", "Sarguzasht", "Romantika", "Dahshat", "Tarixiy", "Triller"];
const CURRENT_YEAR = new Date().getFullYear();

function sanitizeBookInput(data, requireAll = false) {
  const errors = [];
  const out = {};

  if (data.title !== undefined || requireAll) {
    const title = (data.title || '').trim();
    if (!title) errors.push("Kitob nomi majburiy");
    else if (title.length > 200) errors.push("Kitob nomi 200 belgidan oshmasligi kerak");
    else out.title = title;
  }

  if (data.author !== undefined || requireAll) {
    const author = (data.author || '').trim();
    if (!author) errors.push("Muallif majburiy");
    else if (author.length > 100) errors.push("Muallif 100 belgidan oshmasligi kerak");
    else out.author = author;
  }

  if (data.genre !== undefined || requireAll) {
    const genre = (data.genre || '').trim();
    if (!genre) errors.push("Janr majburiy");
    else if (!ALLOWED_GENRES.includes(genre)) errors.push(`Janr quyidagilardan biri bo'lishi kerak: ${ALLOWED_GENRES.join(', ')}`);
    else out.genre = genre;
  }

  if (data.year !== undefined && data.year !== '' && data.year !== null) {
    const year = parseInt(data.year);
    if (isNaN(year) || !Number.isInteger(year) || year < 1000 || year > CURRENT_YEAR) {
      errors.push(`Yil 1000 va ${CURRENT_YEAR} orasida bo'lishi kerak`);
    } else {
      out.year = year;
    }
  }

  if (data.phone !== undefined) {
    out.phone = (data.phone || '').trim();
  }

  return { errors, data: out };
}

function formatBook(row) {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    genre: row.genre,
    year: row.year,
    cover: row.cover,
    status: row.status,
    phone: row.phone,
    created_at: row.created_at,
    views: row.views || 0,
    avg_rating: row.avg_rating || null,
    rating_count: row.rating_count || 0,
    addedBy: row.adder_id ? {
      id: row.adder_id,
      fullname: row.adder_fullname,
      username: row.adder_username
    } : null
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Ro'yxatdan o'tish
app.post('/api/register', [
  body('username')
    .isAlphanumeric().withMessage("Username faqat harf va raqamlardan iborat bo'lishi kerak")
    .isLength({ min: 3, max: 20 }).withMessage("Username 3-20 belgi bo'lishi kerak"),
  body('password')
    .isLength({ min: 8 }).withMessage("Parol kamida 8 belgidan iborat bo'lishi kerak"),
  body('phone')
    .matches(/^\+998\d{9}$/).withMessage("Telefon raqami +998XXXXXXXXX formatida bo'lishi kerak"),
  body('fullname')
    .notEmpty().withMessage("Ism majburiy")
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
    }

    const { fullname, phone, username, password } = req.body;

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (existing) {
      return res.status(400).json({ message: "Bu username allaqachon ro'yxatdan o'tgan" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const { data: newUser, error } = await supabase
      .from('users')
      .insert({ fullname, phone, username, password: hashedPassword })
      .select('id, fullname, username')
      .single();

    if (error) throw error;

    res.status(201).json({
      message: "Ro'yxatdan o'tildi!",
      user: newUser
    });
  } catch (err) {
    next(err);
  }
});

// Kirish
app.post('/api/login', loginLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Username va parolni kiriting" });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !user) {
      return res.status(401).json({ message: "Username yoki parol xato" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Username yoki parol xato" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, fullname: user.fullname, username: user.username, role: user.role }
    });
  } catch (err) {
    next(err);
  }
});

// Chiqish
app.post('/api/logout', (req, res) => {
  res.json({ message: "Chiqish muvaffaqiyatli" });
});

// Barcha kitoblarni olish (filtr va sahifalash bilan)
app.get('/api/books', async (req, res, next) => {
  try {
    const { genre, author, year, search, sort, page = 1, limit = 20, added_by } = req.query;

    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const offset = (safePage - 1) * safeLimit;

    let query = supabase
      .from('books')
      .select(`
        id, title, author, genre, year, cover, status, phone, created_at, views,
        users!books_added_by_fkey(id, fullname, username),
        ratings(rating)
      `, { count: 'exact' });

    if (genre && genre !== 'Barchasi') query = query.eq('genre', genre);
    if (author) query = query.ilike('author', `%${author}%`);
    if (year) query = query.eq('year', parseInt(year));
    if (added_by) query = query.eq('added_by', added_by);
    if (search) {
      query = query.or(`title.ilike.%${search}%,author.ilike.%${search}%,genre.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const sortMap = {
      newest: { column: 'id', ascending: false },
      oldest: { column: 'id', ascending: true },
      title: { column: 'title', ascending: true },
      views: { column: 'views', ascending: false },
    };
    const sortOpt = sortMap[sort] || sortMap.newest;
    query = query.order(sortOpt.column, { ascending: sortOpt.ascending });

    query = query.range(offset, offset + safeLimit - 1);

    const { data: rows, error, count } = await query;
    if (error) throw error;

    const books = rows.map(row => {
      const ratings = row.ratings || [];
      const avg_rating = ratings.length > 0
        ? parseFloat((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(2))
        : null;
      return {
        id: row.id,
        title: row.title,
        author: row.author,
        genre: row.genre,
        year: row.year,
        cover: row.cover,
        status: row.status,
        phone: row.phone,
        created_at: row.created_at,
        views: row.views || 0,
        avg_rating,
        rating_count: ratings.length,
        addedBy: row.users ? {
          id: row.users.id,
          fullname: row.users.fullname,
          username: row.users.username
        } : null
      };
    });

    const total = count || 0;
    const pages = Math.ceil(total / safeLimit);

    res.json({ books, total, page: safePage, pages });
  } catch (err) {
    next(err);
  }
});

// Bitta kitobni olish
app.get('/api/books/:id', async (req, res, next) => {
  try {
    const { data: book, error } = await supabase
      .from('books')
      .select(`
        id, title, author, genre, year, cover, status, phone, created_at, views,
        users!books_added_by_fkey(id, fullname, username),
        ratings(rating)
      `)
      .eq('id', req.params.id)
      .single();

    if (error || !book) return res.status(404).json({ message: 'Kitob topilmadi' });

    // Ko'rishlar hisoblagichi
    await supabase.from('books').update({ views: (book.views || 0) + 1 }).eq('id', req.params.id);

    const ratings = book.ratings || [];
    const avg_rating = ratings.length > 0
      ? parseFloat((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(2))
      : null;

    res.json({
      id: book.id,
      title: book.title,
      author: book.author,
      genre: book.genre,
      year: book.year,
      cover: book.cover,
      status: book.status,
      phone: book.phone,
      created_at: book.created_at,
      views: (book.views || 0) + 1,
      avg_rating,
      rating_count: ratings.length,
      addedBy: book.users ? {
        id: book.users.id,
        fullname: book.users.fullname,
        username: book.users.username
      } : null
    });
  } catch (err) { next(err); }
});

// Kitob qo'shish
app.post('/api/books', requireAuth, async (req, res, next) => {
  try {
    const { errors, data: sanitized } = sanitizeBookInput(req.body, true);
    if (errors.length) return res.status(400).json({ message: errors[0], errors });

    const { cover, status } = req.body;

    const { data: newBook, error } = await supabase
      .from('books')
      .insert({
        title: sanitized.title,
        author: sanitized.author,
        genre: sanitized.genre,
        year: sanitized.year ?? CURRENT_YEAR,
        cover: cover || 'default-book.png',
        status: status || 'Mavjud',
        added_by: req.user.id,
        phone: sanitized.phone || null
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ message: "Kitob saqlandi!", book: newBook });
  } catch (err) {
    next(err);
  }
});

// Kitobni yangilash
app.put('/api/books/:id', requireAuth, async (req, res, next) => {
  try {
    const { data: book, error: findErr } = await supabase
      .from('books')
      .select('id, added_by')
      .eq('id', req.params.id)
      .single();

    if (findErr || !book) return res.status(404).json({ message: "Kitob topilmadi" });
    if (book.added_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Bu kitobni o'zgartirish uchun ruxsatingiz yo'q" });
    }

    const { errors, data: sanitized } = sanitizeBookInput(req.body, false);
    if (errors.length) return res.status(400).json({ message: errors[0], errors });

    const { cover, status } = req.body;
    const updates = {};
    if (sanitized.title !== undefined) updates.title = sanitized.title;
    if (sanitized.author !== undefined) updates.author = sanitized.author;
    if (sanitized.genre !== undefined) updates.genre = sanitized.genre;
    if (sanitized.year !== undefined) updates.year = sanitized.year;
    if (sanitized.phone !== undefined) updates.phone = sanitized.phone;
    if (cover !== undefined) updates.cover = cover;
    if (status !== undefined) updates.status = status;

    const { data: updated, error } = await supabase
      .from('books')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: "Kitob yangilandi!", book: updated });
  } catch (err) {
    next(err);
  }
});

// Kitobni o'chirish
app.delete('/api/books/:id', requireAuth, async (req, res, next) => {
  try {
    const { data: book, error: findErr } = await supabase
      .from('books')
      .select('id, added_by')
      .eq('id', req.params.id)
      .single();

    if (findErr || !book) return res.status(404).json({ message: "Kitob topilmadi" });
    if (book.added_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Bu kitobni o'chirish uchun ruxsatingiz yo'q" });
    }

    // Cascade o'chirish (books jadvali bilan bog'liq barcha yozuvlar)
    await supabase.from('favorites').delete().eq('book_id', req.params.id);
    await supabase.from('reading_status').delete().eq('book_id', req.params.id);
    await supabase.from('ratings').delete().eq('book_id', req.params.id);
    await supabase.from('chat_messages').delete().eq('book_id', req.params.id);

    const { error } = await supabase.from('books').delete().eq('id', req.params.id);
    if (error) throw error;

    res.json({ message: "Kitob o'chirildi!", book });
  } catch (err) {
    next(err);
  }
});

// Foydalanuvchi profili
app.get('/api/profile/:userId', async (req, res, next) => {
  try {
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, fullname, username, role, created_at')
      .eq('id', req.params.userId)
      .single();

    if (userErr || !user) return res.status(404).json({ message: "Foydalanuvchi topilmadi" });

    const { data: bookRows } = await supabase
      .from('books')
      .select(`
        id, title, author, genre, year, cover, status, phone, created_at, views,
        users!books_added_by_fkey(id, fullname, username),
        ratings(rating)
      `)
      .eq('added_by', req.params.userId)
      .order('id', { ascending: false });

    const books = (bookRows || []).map(row => {
      const ratings = row.ratings || [];
      const avg_rating = ratings.length > 0
        ? parseFloat((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(2))
        : null;
      return {
        id: row.id, title: row.title, author: row.author, genre: row.genre,
        year: row.year, cover: row.cover, status: row.status, phone: row.phone,
        created_at: row.created_at, views: row.views || 0, avg_rating,
        rating_count: ratings.length,
        addedBy: row.users ? { id: row.users.id, fullname: row.users.fullname, username: row.users.username } : null
      };
    });

    res.json({ user, books });
  } catch (err) {
    next(err);
  }
});

// Sevimlilarni olish
app.get('/api/favorites', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('favorites')
      .select(`books(id, title, author, genre, year, cover, status, phone, created_at, views, users!books_added_by_fkey(id, fullname, username), ratings(rating))`)
      .eq('user_id', req.user.id);

    if (error) throw error;

    const books = (data || []).map(row => {
      const book = row.books;
      const ratings = book.ratings || [];
      const avg_rating = ratings.length > 0
        ? parseFloat((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(2))
        : null;
      return {
        id: book.id, title: book.title, author: book.author, genre: book.genre,
        year: book.year, cover: book.cover, status: book.status, phone: book.phone,
        created_at: book.created_at, views: book.views || 0, avg_rating,
        rating_count: ratings.length,
        addedBy: book.users ? { id: book.users.id, fullname: book.users.fullname, username: book.users.username } : null
      };
    });

    res.json(books);
  } catch (err) { next(err); }
});

// Sevimlilarga qo'shish
app.post('/api/favorites/:bookId', requireAuth, async (req, res, next) => {
  try {
    const { data: book } = await supabase.from('books').select('id').eq('id', req.params.bookId).single();
    if (!book) return res.status(404).json({ message: "Kitob topilmadi" });

    const { error } = await supabase.from('favorites').insert({ user_id: req.user.id, book_id: req.params.bookId });
    if (error) {
      if (error.code === '23505') return res.status(400).json({ message: "Kitob sevimlilar ro'yxatida bor" });
      throw error;
    }
    res.json({ message: "Sevimlilar ro'yxatiga qo'shildi!" });
  } catch (err) { next(err); }
});

// Sevimlilardan o'chirish
app.delete('/api/favorites/:bookId', requireAuth, async (req, res, next) => {
  try {
    const { error, count } = await supabase
      .from('favorites')
      .delete({ count: 'exact' })
      .eq('user_id', req.user.id)
      .eq('book_id', req.params.bookId);

    if (error) throw error;
    if (count === 0) return res.status(404).json({ message: "Kitob sevimlilar ro'yxatida yo'q" });
    res.json({ message: "Sevimlilardan o'chirildi!" });
  } catch (err) { next(err); }
});

// O'qish holatini saqlash
app.post('/api/books/:id/reading-status', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['xohlayapman', 'oqiyapman', 'oqidim'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ message: `Holat quyidagilardan biri bo'lishi kerak: ${validStatuses.join(', ')}` });
    }

    const { data: book } = await supabase.from('books').select('id').eq('id', req.params.id).single();
    if (!book) return res.status(404).json({ message: "Kitob topilmadi" });

    const { error } = await supabase
      .from('reading_status')
      .upsert({ user_id: req.user.id, book_id: parseInt(req.params.id), status }, { onConflict: 'user_id,book_id' });

    if (error) throw error;
    res.json({ message: "O'qish holati saqlandi", status });
  } catch (err) { next(err); }
});

// O'qish holatini olish
app.get('/api/books/:id/reading-status', requireAuth, async (req, res, next) => {
  try {
    const { data } = await supabase
      .from('reading_status')
      .select('status')
      .eq('user_id', req.user.id)
      .eq('book_id', req.params.id)
      .single();

    res.json({ status: data ? data.status : null });
  } catch (err) { next(err); }
});

// Reyting qo'shish yoki yangilash
app.post('/api/books/:id/ratings', requireAuth, async (req, res, next) => {
  try {
    const { rating, review } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Reyting 1 dan 5 gacha bo'lishi kerak" });
    }

    const { data: book } = await supabase.from('books').select('id').eq('id', req.params.id).single();
    if (!book) return res.status(404).json({ message: "Kitob topilmadi" });

    const { error } = await supabase
      .from('ratings')
      .upsert(
        { user_id: req.user.id, book_id: parseInt(req.params.id), rating: parseInt(rating), review: review || null },
        { onConflict: 'user_id,book_id' }
      );
    if (error) throw error;

    if (review && review.trim().length > 0) {
      await supabase.from('chat_messages').insert({
        user_id: req.user.id,
        book_id: parseInt(req.params.id),
        message: review.trim()
      });
    }

    res.json({ message: "Reyting saqlandi", rating: parseInt(rating) });
  } catch (err) { next(err); }
});

// Reytinglarni olish
app.get('/api/books/:id/ratings', async (req, res, next) => {
  try {
    const { data: ratingsData, error } = await supabase
      .from('ratings')
      .select('rating, review, created_at, users(username)')
      .eq('book_id', req.params.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const ratings = ratingsData || [];
    const avg = ratings.length > 0
      ? parseFloat((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(2))
      : null;

    const reviews = ratings.map(r => ({
      user: r.users?.username,
      rating: r.rating,
      review: r.review,
      date: r.created_at
    }));

    res.json({ avg, count: ratings.length, reviews });
  } catch (err) { next(err); }
});

// Analitika
app.get('/api/analytics', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [{ count: totalBooks }, { count: readBooks }, { count: favorites }, { count: newBooks }] = await Promise.all([
      supabase.from('books').select('*', { count: 'exact', head: true }),
      supabase.from('reading_status').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'oqidim'),
      supabase.from('favorites').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('books').select('*', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    res.json({
      totalBooks: totalBooks || 0,
      readBooks: readBooks || 0,
      favorites: favorites || 0,
      newBooks: newBooks || 0
    });
  } catch (err) { next(err); }
});

// Qidiruv
app.get('/api/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);

    const safeLimit = Math.min(10, Math.max(1, parseInt(req.query.limit) || 10));

    const { data: rows, error } = await supabase
      .from('books')
      .select(`
        id, title, author, genre, year, cover, status, phone, created_at, views,
        users!books_added_by_fkey(id, fullname, username),
        ratings(rating)
      `)
      .or(`title.ilike.%${q}%,author.ilike.%${q}%,genre.ilike.%${q}%,phone.ilike.%${q}%`)
      .order('id', { ascending: false })
      .limit(safeLimit);

    if (error) throw error;

    const books = (rows || []).map(row => {
      const ratings = row.ratings || [];
      const avg_rating = ratings.length > 0
        ? parseFloat((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(2))
        : null;
      return {
        id: row.id, title: row.title, author: row.author, genre: row.genre,
        year: row.year, cover: row.cover, status: row.status, phone: row.phone,
        created_at: row.created_at, views: row.views || 0, avg_rating,
        rating_count: ratings.length,
        addedBy: row.users ? { id: row.users.id, fullname: row.users.fullname, username: row.users.username } : null
      };
    });

    res.json(books);
  } catch (err) { next(err); }
});

// Barcha foydalanuvchilar (faqat admin)
app.get('/api/users', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, fullname, username, phone, role, created_at')
      .order('id', { ascending: true });

    if (error) throw error;

    // Har bir foydalanuvchi uchun kitob sonini hisoblash
    const withBooks = await Promise.all(users.map(async u => {
      const { count } = await supabase.from('books').select('*', { count: 'exact', head: true }).eq('added_by', u.id);
      return { ...u, book_count: count || 0 };
    }));

    res.json(withBooks);
  } catch (err) { next(err); }
});

// Janrlar ro'yxati
app.get('/api/genres', (req, res) => {
  const genres = ["Barchasi", "Fantastika", "Ilmiy fantastika", "Roman", "Detektiv", "Sarguzasht", "Romantika", "Dahshat", "Tarixiy", "Triller"];
  res.json(genres);
});

// Profilni yangilash
app.put('/api/profile', requireAuth, async (req, res, next) => {
  try {
    const { fullname, phone } = req.body;
    const updates = {};
    const errors = [];

    if (fullname !== undefined) {
      const trimmed = (fullname || '').trim();
      if (!trimmed) errors.push("Ism bo'sh bo'lishi mumkin emas");
      else updates.fullname = trimmed;
    }

    if (phone !== undefined) {
      if (!/^\+998\d{9}$/.test(phone)) {
        errors.push("Telefon raqami +998XXXXXXXXX formatida bo'lishi kerak");
      } else {
        updates.phone = phone;
      }
    }

    if (errors.length) return res.status(400).json({ message: errors[0], errors });
    if (!Object.keys(updates).length) return res.status(400).json({ message: "Yangilanadigan maydon yo'q" });

    const { data: updated, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.user.id)
      .select('id, fullname, username, phone, role, created_at')
      .single();

    if (error) throw error;
    res.json({ message: "Profil yangilandi!", user: updated });
  } catch (err) { next(err); }
});

// Parolni o'zgartirish
app.post('/api/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Joriy va yangi parolni kiriting" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: "Yangi parol kamida 8 belgidan iborat bo'lishi kerak" });
    }

    const { data: user, error } = await supabase.from('users').select('*').eq('id', req.user.id).single();
    if (error || !user) return res.status(404).json({ message: "Foydalanuvchi topilmadi" });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ message: "Joriy parol noto'g'ri" });

    const hashed = await bcrypt.hash(newPassword, 12);
    await supabase.from('users').update({ password: hashed }).eq('id', req.user.id);

    res.json({ message: "Parol muvaffaqiyatli yangilandi" });
  } catch (err) { next(err); }
});

// ─── Chat API ─────────────────────────────────────────────────────────────────

app.get('/api/chat/contacts', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, fullname, username, role')
      .neq('id', req.user.id)
      .order('fullname', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

app.get('/api/chat/messages/:id', requireAuth, async (req, res, next) => {
  try {
    const id = req.params.id;
    let messages = [];

    if (id === 'global') {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id, message, created_at, user_id, users(id, fullname, username, role), book_id, books(id, title)')
        .is('receiver_id', null)
        .order('id', { ascending: false })
        .limit(100);

      if (error) throw error;
      messages = (data || []).map(m => ({
        id: m.id, message: m.message, created_at: m.created_at,
        user_id: m.users?.id, fullname: m.users?.fullname, username: m.users?.username, role: m.users?.role,
        book_id: m.books?.id, book_title: m.books?.title
      }));
    } else {
      const recId = parseInt(id);
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id, message, created_at, user_id, users(id, fullname, username, role)')
        .or(`and(user_id.eq.${req.user.id},receiver_id.eq.${recId}),and(user_id.eq.${recId},receiver_id.eq.${req.user.id})`)
        .order('id', { ascending: false })
        .limit(100);

      if (error) throw error;
      messages = (data || []).map(m => ({
        id: m.id, message: m.message, created_at: m.created_at,
        user_id: m.users?.id, fullname: m.users?.fullname, username: m.users?.username, role: m.users?.role,
        book_id: null, book_title: null
      }));
    }

    res.json(messages.reverse());
  } catch (err) { next(err); }
});

app.post('/api/chat/messages/:id', requireAuth, async (req, res, next) => {
  try {
    const { message } = req.body;
    const id = req.params.id;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: "Xabar bo'sh bo'lishi mumkin emas" });
    }

    const recId = id === 'global' ? null : parseInt(id);

    const { data: newMsg, error } = await supabase
      .from('chat_messages')
      .insert({ user_id: req.user.id, receiver_id: recId, book_id: null, message: message.trim() })
      .select('id, message, created_at, user_id, users(id, fullname, username, role)')
      .single();

    if (error) throw error;

    res.status(201).json({
      id: newMsg.id, message: newMsg.message, created_at: newMsg.created_at,
      user_id: newMsg.users?.id, fullname: newMsg.users?.fullname,
      username: newMsg.users?.username, role: newMsg.users?.role,
      book_id: null, book_title: null
    });
  } catch (err) { next(err); }
});

// ─── Global xato ishlovchi ────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.code === '23505') {
    return res.status(409).json({ message: "Bunday ma'lumot allaqachon mavjud (masalan, username takrorlangan)" });
  }
  res.status(500).json({ message: "Xato yuz berdi" });
});

// ─── Serverni ishga tushirish ─────────────────────────────────────────────────

// Lokalda ishlaganda static fayllarni berish (Vercelda kerak emas)
if (require.main === module) {
  app.use(express.static(path.join(__dirname, '..'), {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }));
  app.listen(PORT, () => {
    console.log(`Server ${PORT} portda ishlammoqda`);
  });
}

module.exports = app;
