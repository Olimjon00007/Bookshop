require('dotenv').config();
const supabase = require('../lib/supabase');

async function test() {
  console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('Supabase Key:', process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? '✅ Mavjud' : '❌ Yo\'q');

  // Jadvallarni tekshirish
  const { data: users, error: usersErr } = await supabase.from('users').select('id').limit(1);
  console.log('\nUsers jadvali:', usersErr ? `❌ Xato: ${usersErr.message}` : '✅ Ishlayapti');

  const { data: books, error: booksErr } = await supabase.from('books').select('id').limit(1);
  console.log('Books jadvali:', booksErr ? `❌ Xato: ${booksErr.message}` : '✅ Ishlayapti');

  const { data: favs, error: favsErr } = await supabase.from('favorites').select('*').limit(1);
  console.log('Favorites jadvali:', favsErr ? `❌ Xato: ${favsErr.message}` : '✅ Ishlayapti');

  const { data: ratings, error: ratErr } = await supabase.from('ratings').select('*').limit(1);
  console.log('Ratings jadvali:', ratErr ? `❌ Xato: ${ratErr.message}` : '✅ Ishlayapti');

  const { data: chat, error: chatErr } = await supabase.from('chat_messages').select('*').limit(1);
  console.log('Chat jadvali:', chatErr ? `❌ Xato: ${chatErr.message}` : '✅ Ishlayapti');

  console.log('\n--- Test yakunlandi ---');
}

test();
