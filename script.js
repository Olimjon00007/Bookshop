// API manzili — bir xil Express server orqali xizmat qiladi
const API = '/api';

// ── Global holat ──────────────────────────────────────────────────────────────
let currentUser   = JSON.parse(localStorage.getItem('user'))  || null;
let currentToken  = localStorage.getItem('token') || null;
let selectedCover = null;
let currentPage   = 1;
let totalPages    = 1;
let currentGenre      = 'Barchasi';
let currentGenreLabel = 'Barchasi';
let currentSort       = 'newest';
let favoriteIds       = new Set();   // tizimga kirgan foydalanuvchi sevimlilarining ID to'plami
let editingBookId     = null;        // null = qo'shish rejimi, raqam = tahrirlash rejimi
let currentUserOnly   = false;       // faqat foydalanuvchi qo'shgan kitoblarni ko'rsatish
let searchTimeout;

// ── Auth yordamchilari ────────────────────────────────────────────────────────
function isLoggedIn() {
    return !!(currentUser && currentToken);
}

function authHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
    };
}

function clearSession() {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    currentUser  = null;
    currentToken = null;
    favoriteIds  = new Set();
    editingBookId = null;
}

// ── Fetch o'rash ──────────────────────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
    try {
        const res = await fetch(url, opts);
        if (res.status === 401) {
            clearSession();
            updateUIState();
            showToast("Sessiya tugadi. Qayta kiring.", 'error');
            throw new Error('Unauthorized');
        }
        return res;
    } catch (err) {
        if (err.message !== 'Unauthorized') showToast("Serverga ulanib bo'lmadi", 'error');
        throw err;
    }
}

// ── Toast bildirishnomalar ────────────────────────────────────────────────────
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast--hide');
        setTimeout(() => toast.remove(), 400);
    }, 3100);
}

// ── Tugma yuklanish holati ─────────────────────────────────────────────────────
function setLoading(btn, on) {
    btn.disabled = on;
    btn.dataset.orig = btn.dataset.orig || btn.textContent;
    btn.textContent = on ? 'Yuklanmoqda...' : btn.dataset.orig;
}

// ── HTML xavfsizlik (XSS) ─────────────────────────────────────────────────────
function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ── Sarlavha UI holatini yangilash ────────────────────────────────────────────
function updateUIState() {
    const btn = document.getElementById('profile-btn');
    if (!btn) return;
    if (isLoggedIn()) {
        btn.innerHTML = `<span>👤 @${esc(currentUser.username)}</span>`;
        btn.title = currentUser.fullname || currentUser.username;
        document.getElementById('hero-actions').style.display = 'none';
        document.getElementById('menu-my-books').style.display = 'block';
    } else {
        btn.innerHTML = '<span>Kirish</span>';
        btn.title = 'Kirish';
        document.getElementById('hero-actions').style.display = 'block';
        document.getElementById('menu-my-books').style.display = 'none';
        currentUserOnly = false;
    }
}

// ── Analitika ─────────────────────────────────────────────────────────────────
async function loadAnalytics() {
    const fields = ['total-books', 'read-books', 'favorites-count', 'new-books'];
    if (!isLoggedIn()) {
        fields.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
        return;
    }
    try {
        const res = await fetch(API + '/analytics', { headers: authHeaders() });
        if (!res.ok) return;
        const d = await res.json();
        document.getElementById('total-books').textContent     = d.totalBooks ?? 0;
        document.getElementById('read-books').textContent      = d.readBooks  ?? 0;
        document.getElementById('favorites-count').textContent = d.favorites  ?? 0;
        document.getElementById('new-books').textContent       = d.newBooks   ?? 0;
    } catch {}
}

// ── Sevimlilar ID to'plamini yuklash ──────────────────────────────────────────
async function loadFavoriteIds() {
    if (!isLoggedIn()) { favoriteIds = new Set(); return; }
    try {
        const res = await fetch(API + '/favorites', { headers: authHeaders() });
        if (res.ok) {
            const favs = await res.json();
            favoriteIds = new Set(favs.map(b => b.id));
        }
    } catch {}
}

// ── Sevimlilarga qo'shish / olib tashlash ─────────────────────────────────────
async function toggleFavorite(bookId) {
    if (!isLoggedIn()) { showToast("Avval tizimga kiring", 'error'); return; }
    const isFav = favoriteIds.has(bookId);
    try {
        const res = await apiFetch(`${API}/favorites/${bookId}`, {
            method: isFav ? 'DELETE' : 'POST',
            headers: authHeaders()
        });
        if (res.ok) {
            if (isFav) {
                favoriteIds.delete(bookId);
                showToast("Sevimlilardan olib tashlandi", 'info');
            } else {
                favoriteIds.add(bookId);
                showToast("Sevimlilarga qo'shildi!", 'success');
            }
            // Karta yuraklarini va detail tugmasini yangilash
            updateFavoriteButtons(bookId);
            loadAnalytics();
        } else {
            const d = await res.json();
            showToast(d.message || 'Xato yuz berdi', 'error');
        }
    } catch {}
}

function updateFavoriteButtons(bookId) {
    const isFav = favoriteIds.has(bookId);
    // Kartadagi yurak
    document.querySelectorAll(`.card-heart[data-id="${bookId}"]`).forEach(btn => {
        btn.classList.toggle('active', isFav);
        btn.innerHTML = isFav ? '❤' : '♡';
        btn.title = isFav ? "Sevimlilardan olib tashlash" : "Sevimlilarga qo'shish";
    });
    // Detail modal tugmasi
    const favBtn = document.getElementById('favorite-book-btn');
    if (favBtn && favBtn.dataset.bookId == bookId) {
        favBtn.classList.toggle('active', isFav);
        favBtn.innerHTML = isFav ? '❤ Sevimli' : '♡ Sevimli';
    }
}

// ── Qidiruv autocomplete ──────────────────────────────────────────────────────
async function showSearchSuggestions(query) {
    if (!query || query.length < 2) { hideDropdown(); return; }
    try {
        const res = await fetch(`${API}/search?q=${encodeURIComponent(query)}&limit=5`);
        if (!res.ok) return;
        const books = await res.json();
        const dd = document.getElementById('search-dropdown');
        if (!dd) return;
        if (!books.length) { hideDropdown(); return; }
        dd.innerHTML = books.map(b =>
            `<div class="search-suggestion" onclick="openBookById(${b.id})">
                ${esc(b.title)} <span>— ${esc(b.author)}</span>
            </div>`
        ).join('');
        dd.style.display = 'block';
    } catch {}
}

function hideDropdown() {
    const d = document.getElementById('search-dropdown');
    if (d) d.style.display = 'none';
}

async function openBookById(id) {
    hideDropdown();
    try {
        const res = await fetch(`${API}/books/${id}`);
        if (res.ok) showBookDetail(await res.json());
    } catch {}
}

// ── Sahifalash ────────────────────────────────────────────────────────────────
function renderPagination() {
    const pag = document.getElementById('pagination');
    if (!pag) return;
    if (totalPages <= 1) { pag.innerHTML = ''; return; }
    pag.innerHTML = `
        <button ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">&#8249;</button>
        <span class="page-info">${currentPage} / ${totalPages}</span>
        <button ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">&#8250;</button>
    `;
}

function changePage(p) {
    currentPage = p;
    displayBooks();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Kitoblar ro'yxatini ko'rsatish ────────────────────────────────────────────
async function displayBooks() {
    const grid    = document.getElementById('books-grid');
    const section = document.getElementById('books-section');
    const hero    = document.getElementById('hero-section');
    const title   = document.getElementById('section-title');
    if (!grid) return;

    // Yuklanayotgan vaqt skeleti
    grid.innerHTML = Array(8).fill(`
        <div class="book-card book-card--skeleton">
            <div class="book-cover"></div>
            <div class="book-info">
                <h3>-</h3><p class="author">-</p><button class="btn-read">-</button>
            </div>
        </div>`).join('');

    try {
        const params = new URLSearchParams({ page: currentPage, limit: 20, sort: currentSort });
        if (currentGenre && currentGenre !== 'Barchasi') params.set('genre', currentGenre);
        if (currentUserOnly && isLoggedIn()) params.set('added_by', currentUser.id);
        const searchVal = document.getElementById('search-input')?.value.trim();
        if (searchVal) params.set('search', searchVal);

        const res    = await fetch(`${API}/books?${params}`);
        const result = await res.json();
        const books  = Array.isArray(result) ? result : (result.books || []);
        totalPages   = result.pages || 1;
        currentPage  = result.page  || currentPage;

        if (title) {
            if (currentUserOnly) title.textContent = 'Mening Kitoblarim';
            else title.textContent = currentGenre === 'Barchasi' ? 'Barcha Kitoblar' : `${currentGenreLabel} Janri`;
        }

        if (!books.length) {
            if (hero)    hero.style.display    = (!searchVal && currentGenre === 'Barchasi') ? 'block' : 'none';
            if (section) section.style.display = (!searchVal && currentGenre === 'Barchasi') ? 'none'  : 'block';
            grid.innerHTML = '<p class="empty-state">Kitoblar topilmadi</p>';
            renderPagination();
            return;
        }

        if (hero)    hero.style.display    = 'none';
        if (section) section.style.display = 'block';

        grid.innerHTML = '';
        books.forEach(book => {
            const rating = book.avg_rating;
            const stars  = rating
                ? '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating))
                : '☆☆☆☆☆';
            const isFav = favoriteIds.has(book.id);

            const card = document.createElement('div');
            card.className = 'book-card';
            card.innerHTML = `
                <div class="book-cover" style="position:relative;">
                    <img src="${esc(book.cover || '')}" alt="${esc(book.title)}" onerror="this.style.opacity='0'">
                    <button class="card-heart ${isFav ? 'active' : ''}" data-id="${book.id}"
                        title="${isFav ? "Sevimlilardan olib tashlash" : "Sevimlilarga qo'shish"}">${isFav ? '❤' : '♡'}</button>
                </div>
                <div class="book-info">
                    <h3 title="${esc(book.title)}">${esc(book.title)}</h3>
                    <p class="author">${esc(book.author)}</p>
                    <div class="card-rating">${stars}${rating ? ` (${Number(rating).toFixed(1)})` : ''}</div>
                    <p class="genre"><small>${esc(book.genre)}</small></p>
                    <p class="year"><small>${book.year || ''}</small></p>
                    <button class="btn-read">Batafsil</button>
                </div>`;

            card.querySelector('.btn-read').addEventListener('click', () => showBookDetail(book));
            card.querySelector('.card-heart').addEventListener('click', e => {
                e.stopPropagation();
                toggleFavorite(book.id);
            });
            grid.appendChild(card);
        });

        renderPagination();
    } catch {
        grid.innerHTML = '<p class="empty-state">Kitoblarni yuklashda xato</p>';
        renderPagination();
    }
}

// ── Kitob tafsiloti modali ────────────────────────────────────────────────────
async function showBookDetail(book) {
    const modal = document.getElementById('book-detail-modal');
    if (!modal) return;

    // Asosiy ma'lumotlar
    document.getElementById('detail-title').textContent  = book.title;
    document.getElementById('detail-author').textContent = book.author;
    document.getElementById('detail-genre').textContent  = book.genre;
    document.getElementById('detail-year').textContent   = book.year || '—';
    document.getElementById('detail-phone').textContent  = book.phone || '—';
    document.getElementById('detail-views').textContent  = book.views ?? 0;

    // Muqova
    const coverEl = document.getElementById('detail-cover');
    if (coverEl) {
        coverEl.innerHTML = book.cover
            ? `<img src="${esc(book.cover)}" alt="${esc(book.title)}"
                   style="width:100%;height:100%;object-fit:cover;border-radius:10px;"
                   onerror="this.style.opacity='0'">`
            : '';
    }

    // Yuklagan foydalanuvchi — API addedBy.fullname va addedBy.username qaytaradi
    const uploaderEl = document.getElementById('uploader-info');
    if (uploaderEl) {
        uploaderEl.innerHTML = book.addedBy
            ? `<p><strong>Ism:</strong> ${esc(book.addedBy.fullname || '—')}</p>
               <p><strong>Username:</strong> @${esc(book.addedBy.username || '—')}</p>`
            : '<p style="color:#999;">—</p>';
    }

    // Sevimli tugmasi
    const favBtn = document.getElementById('favorite-book-btn');
    if (favBtn) {
        if (isLoggedIn()) {
            favBtn.style.display = 'inline-flex';
            favBtn.dataset.bookId = book.id;
            const isFav = favoriteIds.has(book.id);
            favBtn.classList.toggle('active', isFav);
            favBtn.innerHTML = isFav ? '❤ Sevimli' : '♡ Sevimli';
            favBtn.onclick = () => toggleFavorite(book.id);
        } else {
            favBtn.style.display = 'none';
        }
    }

    // Egasi / admin uchun tahrirlash va o'chirish tugmalari
    const ownerActions = document.getElementById('book-owner-actions');
    const isOwner = isLoggedIn() && (
        book.addedBy?.id === currentUser?.id || currentUser?.role === 'admin'
    );
    if (ownerActions) {
        ownerActions.style.display = isOwner ? 'flex' : 'none';
        if (isOwner) {
            document.getElementById('edit-book-btn').onclick   = () => openEditBook(book);
            document.getElementById('delete-book-btn').onclick = () => deleteBook(book);
        }
    }

    // O'qish holati (kirgan foydalanuvchilar uchun)
    const statusSelector = document.getElementById('reading-status-selector');
    if (statusSelector) statusSelector.style.display = isLoggedIn() ? 'block' : 'none';

    if (isLoggedIn()) {
        try {
            const sr = await apiFetch(`${API}/books/${book.id}/reading-status`, { headers: authHeaders() });
            if (sr.ok) {
                const { status } = await sr.json();
                document.querySelectorAll('.btn-status').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.status === status);
                });
            }
        } catch {}

        document.querySelectorAll('.btn-status').forEach(btn => {
            btn.onclick = async () => {
                try {
                    const r = await apiFetch(`${API}/books/${book.id}/reading-status`, {
                        method: 'POST', headers: authHeaders(),
                        body: JSON.stringify({ status: btn.dataset.status })
                    });
                    if (r.ok) {
                        document.querySelectorAll('.btn-status').forEach(b => b.classList.toggle('active', b === btn));
                        showToast("Holat yangilandi", 'success');
                    }
                } catch {}
            };
        });
    }


    // Ulashish tugmasi
    const shareBtn = document.getElementById('share-book-btn');
    if (shareBtn) {
        shareBtn.onclick = async () => {
            const text = `${book.title} — ${book.author}`;
            if (navigator.share) {
                await navigator.share({ title: book.title, text, url: location.href });
            } else {
                await navigator.clipboard.writeText(text).catch(() => {});
                showToast("Nusxalandi!", 'success');
            }
        };
    }

    modal.style.display = 'flex';
}

// ── Kitobni tahrirlash ────────────────────────────────────────────────────────
function openEditBook(book) {
    editingBookId = book.id;
    document.getElementById('add-book-modal-title').textContent = "Kitobni Tahrirlash";
    document.getElementById('add-book-submit').textContent      = "Yangilash";

    document.getElementById('book-name').value   = book.title  || '';
    document.getElementById('book-author').value = book.author || '';
    document.getElementById('book-genre').value  = book.genre  || '';
    document.getElementById('book-phone').value  = book.phone  || '';
    document.getElementById('book-year').value   = book.year   || '';
    document.getElementById('book-status').value = book.status || 'Mavjud';

    const preview = document.getElementById('image-preview');
    if (preview && book.cover && book.cover !== 'default-book.png') {
        preview.innerHTML = `<img src="${esc(book.cover)}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">`;
        selectedCover = book.cover;
    }

    document.getElementById('book-detail-modal').style.display = 'none';
    document.getElementById('add-book-modal').style.display    = 'flex';
}

function resetAddBookModal() {
    editingBookId = null;
    selectedCover = null;
    document.getElementById('add-book-modal-title').textContent = "Kitob Qo'shish";
    document.getElementById('add-book-submit').textContent      = "Saqlash";
    document.getElementById('add-book-form').reset();
    const preview = document.getElementById('image-preview');
    if (preview) preview.innerHTML = '<i class="fas fa-upload"></i><p>Rasm tanlang</p>';
}

// ── Kitobni o'chirish ─────────────────────────────────────────────────────────
async function deleteBook(book) {
    if (!confirm(`"${book.title}" kitobini o'chirishni tasdiqlaysizmi?`)) return;
    try {
        const res = await apiFetch(`${API}/books/${book.id}`, {
            method: 'DELETE', headers: authHeaders()
        });
        if (res.ok) {
            document.getElementById('book-detail-modal').style.display = 'none';
            showToast("Kitob o'chirildi!", 'success');
            loadAnalytics();
            displayBooks();
        } else {
            const d = await res.json();
            showToast(d.message || "O'chirishda xato", 'error');
        }
    } catch {}
}

// ── Foydalanuvchi profili ─────────────────────────────────────────────────────
async function loadUserProfile() {
    if (!isLoggedIn()) return;
    try {
        const res = await apiFetch(`${API}/profile/${currentUser.id}`, { headers: authHeaders() });
        if (!res.ok) return;
        const { user, books } = await res.json();

        document.getElementById('profile-name').textContent      = user.fullname;
        document.getElementById('profile-username').textContent   = '@' + user.username;
        document.getElementById('profile-book-count').textContent = books.length;

        const initials = (user.fullname || user.username || '?')
            .split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
        const avatarEl = document.getElementById('profile-avatar-initials');
        if (avatarEl) avatarEl.textContent = initials;

        const profileBooks = document.getElementById('profile-books');
        if (profileBooks) {
            profileBooks.innerHTML = books.length
                ? books.map(b => `
                    <div class="profile-book-item" onclick="openBookById(${b.id})" style="cursor:pointer;">
                        <h4>${esc(b.title)}</h4>
                        <p>${esc(b.author)}</p>
                        <small>${esc(b.genre)} · ${b.year || '—'}</small>
                    </div>`).join('')
                : '<p style="color:#999;">Hozircha kitob qo\'shmagansiz</p>';
        }
    } catch {}
}

async function loadProfileFavorites() {
    const el = document.getElementById('profile-favorites');
    if (!el || !isLoggedIn()) return;
    el.innerHTML = '<p style="color:#999;">Yuklanmoqda...</p>';
    try {
        const res = await fetch(API + '/favorites', { headers: authHeaders() });
        if (!res.ok) return;
        const favs = await res.json();
        el.innerHTML = favs.length
            ? favs.map(b => `
                <div class="profile-book-item" onclick="openBookById(${b.id})" style="cursor:pointer;">
                    <h4>${esc(b.title)}</h4>
                    <p>${esc(b.author)}</p>
                    <small>${esc(b.genre)} · ${b.year || '—'}</small>
                </div>`).join('')
            : '<p style="color:#999;">Hali sevimlilar yo\'q</p>';
    } catch {
        el.innerHTML = '<p style="color:#999;">Yuklashda xato</p>';
    }
}

// ── Chiqish ───────────────────────────────────────────────────────────────────
async function logout() {
    if (currentToken) {
        await fetch(API + '/logout', { method: 'POST', headers: authHeaders() }).catch(() => {});
    }
    clearSession();
    updateUIState();
    loadAnalytics();
    displayBooks();
    showToast("Chiqildi", 'info');
}

// ── DOM tayyor ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);

    const addBookModal     = $('add-book-modal');
    const loginModal       = $('login-modal');
    const registerModal    = $('register-modal');
    const userProfileModal = $('user-profile-modal');
    const slideMenu        = $('slide-menu');

    // ── Sarlavha tugmalari ─────────────────────────────────────────────────────
    $('add-book-btn')?.addEventListener('click', () => {
        if (!isLoggedIn()) loginModal.style.display = 'flex';
        else { resetAddBookModal(); addBookModal.style.display = 'flex'; }
    });

    $('profile-btn')?.addEventListener('click', () => {
        if (!isLoggedIn()) loginModal.style.display = 'flex';
        else { loadUserProfile(); userProfileModal.style.display = 'flex'; }
    });

    $('hero-join-btn')?.addEventListener('click', () => {
        loginModal.style.display = 'flex';
    });

    $('menu-btn')?.addEventListener('click', () => slideMenu?.classList.add('open'));

    // ── Modallarni yopish ──────────────────────────────────────────────────────
    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
            resetAddBookModal();
        });
    });
    document.querySelectorAll('.modal').forEach(m => {
        m.addEventListener('click', e => {
            if (e.target === m) { m.style.display = 'none'; resetAddBookModal(); }
        });
    });
    document.querySelector('.close-menu')?.addEventListener('click', () => slideMenu?.classList.remove('open'));

    // ── Klaviatura yorliqlari ──────────────────────────────────────────────────
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
            slideMenu?.classList.remove('open');
            hideDropdown();
            resetAddBookModal();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            $('search-input')?.focus();
        }
    });

    // ── Qidiruv ────────────────────────────────────────────────────────────────
    $('search-input')?.addEventListener('input', e => {
        showSearchSuggestions(e.target.value);
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => { currentPage = 1; displayBooks(); }, 350);
    });
    document.addEventListener('click', e => {
        if (!e.target.closest('.search-wrapper')) hideDropdown();
    });

    // ── Saralash ───────────────────────────────────────────────────────────────
    $('sort-select')?.addEventListener('change', e => {
        currentSort = e.target.value;
        currentPage = 1;
        displayBooks();
    });

    // ── Janr yon paneli ────────────────────────────────────────────────────────
    document.querySelectorAll('.genre').forEach(el => {
        el.addEventListener('click', () => {
            document.querySelectorAll('.genre').forEach(g => g.classList.remove('active'));
            el.classList.add('active');
            currentGenre      = el.dataset.genre;
            currentGenreLabel = el.textContent.trim();
            currentUserOnly   = false;
            currentPage = 1;
            displayBooks();
        });
    });

    // ── Kirish formasi ─────────────────────────────────────────────────────────
    $('login-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const username = $('login-username').value.trim();
        const password = $('login-password').value;
        if (!username || !password) { showToast("Foydalanuvchi nomi va parolni kiriting", 'error'); return; }
        const btn = e.target.querySelector('[type=submit]');
        setLoading(btn, true);
        try {
            const res  = await fetch(API + '/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (res.ok) {
                currentUser  = data.user;
                currentToken = data.token;
                localStorage.setItem('user',  JSON.stringify(currentUser));
                localStorage.setItem('token', currentToken);
                await loadFavoriteIds();
                e.target.reset();
                loginModal.style.display = 'none';
                updateUIState();
                loadAnalytics();
                displayBooks();
                showToast(`Xush kelibsiz, ${currentUser.fullname || currentUser.username}!`, 'success');
            } else {
                showToast(data.message || "Kirish muvaffaqiyatsiz", 'error');
            }
        } catch { showToast("Server xatosi", 'error'); }
        finally  { setLoading(btn, false); }
    });

    // ── Kirish ↔ Ro'yxatdan o'tish almashtirish ───────────────────────────────
    $('switch-to-register')?.addEventListener('click', e => {
        e.preventDefault();
        loginModal.style.display    = 'none';
        registerModal.style.display = 'flex';
    });
    $('switch-to-login')?.addEventListener('click', e => {
        e.preventDefault();
        registerModal.style.display = 'none';
        loginModal.style.display    = 'flex';
    });

    // ── Ro'yxatdan o'tish formasi ──────────────────────────────────────────────
    $('register-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const body = {
            fullname: $('reg-fullname').value.trim(),
            phone:    $('reg-phone').value.trim(),
            username: $('reg-username').value.trim(),
            password: $('reg-password').value
        };
        const btn = e.target.querySelector('[type=submit]');
        setLoading(btn, true);
        try {
            const res  = await fetch(API + '/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (res.ok) {
                e.target.reset();
                registerModal.style.display = 'none';
                loginModal.style.display    = 'flex';
                showToast("Ro'yxatdan o'tildi! Iltimos, kiring.", 'success');
            } else {
                showToast(data.message || "Ro'yxatdan o'tishda xato", 'error');
            }
        } catch { showToast("Server xatosi", 'error'); }
        finally  { setLoading(btn, false); }
    });

    // ── Kitob qo'shish / tahrirlash formasi ───────────────────────────────────
    const imagePreview = $('image-preview');
    $('book-image')?.addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = ev => {
                selectedCover = ev.target.result;
                if (imagePreview)
                    imagePreview.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">`;
            };
            reader.readAsDataURL(file);
        } else {
            selectedCover = null;
            if (imagePreview)
                imagePreview.innerHTML = '<i class="fas fa-upload"></i><p>Rasm tanlang</p>';
        }
    });

    $('add-book-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        if (!isLoggedIn()) { showToast("Avval tizimga kiring", 'error'); return; }
        const btn = e.target.querySelector('[type=submit]');
        setLoading(btn, true);
        const body = {
            title:  $('book-name').value.trim(),
            author: $('book-author').value.trim(),
            genre:  $('book-genre').value,
            phone:  $('book-phone').value.trim(),
            year:   $('book-year').value || undefined,
            status: $('book-status').value,
            cover:  selectedCover || 'default-book.png'
        };
        try {
            const isEditing = editingBookId !== null;
            const url    = isEditing ? `${API}/books/${editingBookId}` : `${API}/books`;
            const method = isEditing ? 'PUT' : 'POST';
            const res    = await apiFetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
            const data   = await res.json();
            if (res.ok) {
                addBookModal.style.display = 'none';
                resetAddBookModal();
                showToast(isEditing ? "Kitob yangilandi!" : "Kitob qo'shildi!", 'success');
                loadAnalytics();
                displayBooks();
            } else {
                showToast(data.message || "Xato yuz berdi", 'error');
            }
        } catch {}
        finally { setLoading(btn, false); }
    });

    // ── Parol o'zgartirish formasi ─────────────────────────────────────────────
    $('change-password-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const currentPassword = $('cp-current').value;
        const newPassword     = $('cp-new').value;
        const confirmPassword = $('cp-confirm').value;

        if (newPassword !== confirmPassword) {
            showToast("Yangi parollar bir-biriga mos kelmadi", 'error');
            return;
        }
        if (newPassword.length < 8) {
            showToast("Yangi parol kamida 8 belgidan iborat bo'lishi kerak", 'error');
            return;
        }
        const btn = e.target.querySelector('[type=submit]');
        setLoading(btn, true);
        try {
            const res  = await apiFetch(API + '/change-password', {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ currentPassword, newPassword })
            });
            const data = await res.json();
            if (res.ok) {
                e.target.reset();
                showToast(data.message || "Parol yangilandi!", 'success');
            } else {
                showToast(data.message || "Xato yuz berdi", 'error');
            }
        } catch {}
        finally { setLoading(btn, false); }
    });

    // ── Profil tablari ─────────────────────────────────────────────────────────
    document.querySelectorAll('.profile-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.profile-tab-content').forEach(c => c.style.display = 'none');
            tab.classList.add('active');
            $('tab-' + tab.dataset.tab).style.display = 'block';
            if (tab.dataset.tab === 'favorites') loadProfileFavorites();
        });
    });

    // ── Yon menyu ──────────────────────────────────────────────────────────────
    $('menu-add-book')?.addEventListener('click', () => {
        slideMenu?.classList.remove('open');
        if (!isLoggedIn()) loginModal.style.display = 'flex';
        else { resetAddBookModal(); addBookModal.style.display = 'flex'; }
    });
    $('menu-my-books')?.addEventListener('click', () => {
        slideMenu?.classList.remove('open');
        if (!isLoggedIn()) loginModal.style.display = 'flex';
        else {
            currentUserOnly = true;
            currentGenre = 'Barchasi';
            currentPage = 1;
            displayBooks();
        }
    });
    $('menu-profile')?.addEventListener('click', () => {
        slideMenu?.classList.remove('open');
        if (!isLoggedIn()) loginModal.style.display = 'flex';
        else { loadUserProfile(); userProfileModal.style.display = 'flex'; }
    });

    $('menu-logout')?.addEventListener('click', () => {
        slideMenu?.classList.remove('open');
        if (isLoggedIn()) logout();
        else showToast("Tizimga kirmagansiz", 'info');
    });

    // ── Profildan chiqish ──────────────────────────────────────────────────────
    $('logout-btn')?.addEventListener('click', () => {
        userProfileModal.style.display = 'none';
        logout();
    });

    // ── Parol ko'rinishi almashtirish ──────────────────────────────────────────
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const inp = $(btn.dataset.target);
            if (!inp) return;
            inp.type = inp.type === 'password' ? 'text' : 'password';
            btn.classList.toggle('fa-eye',       inp.type === 'password');
            btn.classList.toggle('fa-eye-slash', inp.type === 'text');
        });
    });

    // ── Jadval chiziqlarini animatsiya qilish ──────────────────────────────────
    document.querySelectorAll('.bar').forEach((bar, i) => {
        const h = bar.dataset.height;
        if (!h) return;
        setTimeout(() => { bar.style.height = h; }, i * 150 + 100);
    });

    // ── Saqlangan tokenni tekshirish ───────────────────────────────────────────
    if (currentToken) {
        fetch(API + '/analytics', { headers: authHeaders() })
            .then(res => { if (res.status === 401) { clearSession(); updateUIState(); } })
            .catch(() => {});
    }

    // ── Boshlang'ich yuklash ───────────────────────────────────────────────────
    updateUIState();
    loadAnalytics();
    if (isLoggedIn()) loadFavoriteIds().then(() => displayBooks());
    else displayBooks();
});


