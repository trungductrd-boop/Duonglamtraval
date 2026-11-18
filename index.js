const express = require('express');
const http = require('http');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, { cors: { origin: '*' } });

const JWT_SECRET = 'duonglam-secret-2026';
const upload = multer({ dest: path.join(__dirname, 'public', 'uploads') });

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- AUTH ----------
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token hết hạn' }); }
}

app.post('/api/auth/register', (req, res) => {
  const { email, password, name, role, business_name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'Thiếu thông tin' });
  const exists = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (exists) return res.status(400).json({ error: 'Email đã tồn tại' });
  const r = db.prepare('INSERT INTO users (email,password,name,role,business_name) VALUES (?,?,?,?,?)')
    .run(email, bcrypt.hashSync(password, 10), name, role === 'business' ? 'business' : 'user', business_name || null);
  const user = db.prepare('SELECT id,email,name,role,business_name FROM users WHERE id=?').get(r.lastInsertRowid);
  res.json({ token: jwt.sign(user, JWT_SECRET, { expiresIn: '7d' }), user });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!u || !bcrypt.compareSync(password, u.password)) return res.status(400).json({ error: 'Sai email hoặc mật khẩu' });
  const user = { id: u.id, email: u.email, name: u.name, role: u.role, business_name: u.business_name };
  res.json({ token: jwt.sign(user, JWT_SECRET, { expiresIn: '7d' }), user });
});

// ---------- PLACES ----------
app.get('/api/places', (req, res) => {
  res.json(db.prepare('SELECT * FROM places ORDER BY id').all());
});
app.get('/api/places/:slug', (req, res) => {
  const p = db.prepare('SELECT * FROM places WHERE slug=?').get(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Không tìm thấy' });
  p.comments = db.prepare('SELECT * FROM comments WHERE place_id=? ORDER BY id DESC LIMIT 50').all(p.id);
  res.json(p);
});

// ---------- COMMENTS (realtime) ----------
app.get('/api/places/:slug/comments', (req, res) => {
  const p = db.prepare('SELECT id FROM places WHERE slug=?').get(req.params.slug);
  if (!p) return res.status(404).json([]);
  res.json(db.prepare('SELECT * FROM comments WHERE place_id=? ORDER BY id DESC LIMIT 50').all(p.id));
});

app.post('/api/places/:slug/comments', (req, res) => {
  const p = db.prepare('SELECT id FROM places WHERE slug=?').get(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Không tìm thấy địa điểm' });
  const { user_name, content, rating } = req.body;
  if (!user_name || !content) return res.status(400).json({ error: 'Thiếu tên hoặc nội dung' });
  const r = db.prepare('INSERT INTO comments (place_id,user_name,content,rating) VALUES (?,?,?,?)')
    .run(p.id, user_name, content, rating || 5);
  const c = db.prepare('SELECT * FROM comments WHERE id=?').get(r.lastInsertRowid);
  io.emit('new-comment', { place_slug: req.params.slug, comment: c });  // realtime broadcast
  res.json(c);
});

// ---------- LISTINGS (shop) ----------
app.get('/api/listings', (req, res) => {
  res.json(db.prepare(`SELECT l.*, u.business_name, u.name AS owner_name
    FROM listings l LEFT JOIN users u ON u.id=l.owner_id WHERE l.approved=1 ORDER BY l.id DESC`).all());
});
app.get('/api/listings/:id', (req, res) => {
  const l = db.prepare('SELECT * FROM listings WHERE id=?').get(req.params.id);
  if (!l) return res.status(404).json({ error: 'Không tìm thấy' });
  res.json(l);
});

app.post('/api/listings', auth, (req, res) => {
  if (req.user.role !== 'business') return res.status(403).json({ error: 'Chỉ tài khoản kinh doanh mới được đăng' });
  const { title, type, price, description_vi, description_en, address, phone, lat, lng } = req.body;
  if (!title || !type) return res.status(400).json({ error: 'Thiếu tiêu đề hoặc loại' });
  const r = db.prepare(`INSERT INTO listings (owner_id,title,type,price,description_vi,description_en,address,phone,lat,lng)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(req.user.id, title, type, price || 0, description_vi || '', description_en || '', address || '', phone || '', lat || null, lng || null);
  const l = db.prepare('SELECT * FROM listings WHERE id=?').get(r.lastInsertRowid);
  io.emit('new-listing', l); // realtime cập nhật shop
  res.json(l);
});

app.put('/api/listings/:id', auth, (req, res) => {
  const l = db.prepare('SELECT * FROM listings WHERE id=?').get(req.params.id);
  if (!l) return res.status(404).json({ error: 'Không tìm thấy' });
  if (l.owner_id !== req.user.id) return res.status(403).json({ error: 'Không phải của bạn' });
  const { title, type, price, description_vi, description_en, address, phone, lat, lng } = req.body;
  db.prepare(`UPDATE listings SET title=?,type=?,price=?,description_vi=?,description_en=?,address=?,phone=?,lat=?,lng=? WHERE id=?`)
    .run(title ?? l.title, type ?? l.type, price ?? l.price, description_vi ?? l.description_vi,
      description_en ?? l.description_en, address ?? l.address, phone ?? l.phone, lat ?? l.lat, lng ?? l.lng, l.id);
  res.json(db.prepare('SELECT * FROM listings WHERE id=?').get(l.id));
});

app.delete('/api/listings/:id', auth, (req, res) => {
  const l = db.prepare('SELECT * FROM listings WHERE id=?').get(req.params.id);
  if (!l || l.owner_id !== req.user.id) return res.status(403).json({ error: 'Không có quyền' });
  db.prepare('DELETE FROM listings WHERE id=?').run(l.id);
  io.emit('delete-listing', { id: l.id });
  res.json({ ok: true });
});

app.get('/api/my/listings', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM listings WHERE owner_id=? ORDER BY id DESC').all(req.user.id));
});

// ---------- BOOKINGS ----------
app.post('/api/bookings', (req, res) => {
  const { listing_id, user_name, phone, note } = req.body;
  if (!listing_id || !user_name || !phone) return res.status(400).json({ error: 'Thiếu thông tin đặt chỗ' });
  const r = db.prepare('INSERT INTO bookings (listing_id,user_name,phone,note) VALUES (?,?,?,?)')
    .run(listing_id, user_name, phone, note || '');
  const b = db.prepare('SELECT * FROM bookings WHERE id=?').get(r.lastInsertRowid);
  io.emit('new-booking', b);
  res.json(b);
});
app.get('/api/my/bookings', auth, (req, res) => {
  res.json(db.prepare(`SELECT b.*, l.title FROM bookings b JOIN listings l ON l.id=b.listing_id
    WHERE l.owner_id=? ORDER BY b.id DESC`).all(req.user.id));
});

// ---------- AI GUIDE (proxy tới OpenAI-compatible API, hoặc fallback nội bộ) ----------
app.post('/api/ai/chat', async (req, res) => {
  const { message, lang, context } = req.body;
  const apiKey = process.env.OPENAI_API_KEY;
  const sys = `Bạn là hướng dẫn viên AI của Làng cổ Đường Lâm (Sơn Tây, Hà Nội).
Trả lời ngắn gọn, ấm áp, bằng ${lang || 'tiếng Việt'}.
Thông tin hiện tại: ${context || ''}`;

  if (apiKey) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: sys }, { role: 'user', content: message }]
        })
      });
      const d = await r.json();
      return res.json({ reply: d.choices?.[0]?.message?.content || '...' });
    } catch (e) { /* fallthrough */ }
  }
  // Fallback offline: trả lời dựa trên dữ liệu DB
  const q = (message || '').toLowerCase();
  const places = db.prepare('SELECT name, description_vi FROM places').all();
  const hit = places.find(p => q.includes(p.name.toLowerCase().split(' ')[0]) || q.includes('đường lâm'));
  res.json({
    reply: hit ? `${hit.name}: ${hit.description_vi}` :
      `Làng cổ Đường Lâm có Đình Mông Phụ, Chùa Mộng Phụ & Cao, đường làng đá ong, nhà cổ, miến soạn và chè kho. Bạn muốn tìm hiểu địa điểm nào? (Cấu hình OPENAI_API_KEY để bật AI đầy đủ.)`
  });
});

io.on('connection', socket => {
  console.log('client connected');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🏛️  Đường Lâm web running: http://localhost:${PORT}`));
