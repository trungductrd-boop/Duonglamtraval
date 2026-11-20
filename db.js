const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new Database(path.join(__dirname, 'duonglam.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'user',          -- 'user' | 'business'
  business_name TEXT,
  avatar TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  category TEXT,                      -- ditich / nghieng / anuong / muaSam
  description_vi TEXT,
  description_en TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  image TEXT,
  story_vi TEXT,
  story_en TEXT
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id INTEGER NOT NULL,
  user_id INTEGER,
  user_name TEXT NOT NULL,
  content TEXT NOT NULL,
  rating INTEGER DEFAULT 5,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (place_id) REFERENCES places(id)
);

CREATE TABLE IF NOT EXISTS listings (   -- shop: chỗ ở / ăn uống
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,                 -- homestay / khachsan / quanAn / cuaHang
  price INTEGER,
  description_vi TEXT,
  description_en TEXT,
  address TEXT,
  phone TEXT,
  image TEXT,
  lat REAL,
  lng REAL,
  approved INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL,
  user_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  note TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (listing_id) REFERENCES listings(id)
);
`);

// ---- Seed dữ liệu Đường Lâm ----
const placeCount = db.prepare('SELECT COUNT(*) c FROM places').get().c;
if (placeCount === 0) {
  const ins = db.prepare(`INSERT INTO places (slug,name,name_en,category,description_vi,description_en,lat,lng,image,story_vi,story_en)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const seed = [
    ['chua-mong-phu-cao','Chùa Mộng Phụ & Cao','Mong Phu Temple & Cao Temple','ditich',
     'Cụm di tích tâm linh nổi bật giữa lòng làng, nơi thờ Phật và các thành hào làng Mộng Phụ. Kiến trúc cổ với mái ngói rìu, cây đa già hàng trăm tuổi.',
     'A prominent spiritual complex in the village heart, with ancient "rui" tile roofs and centuries-old banyan trees.',
     21.1425, 105.5310, null,
     'Chùa Mộng Phụ cùngglyphicon với Chùa Cao tạo thành cụm tam giác di tích thiêng liêng của làng Mông Phụ, xây dựng từ thế kỷ XVII.',''],
    ['dinh-mong-phu','Đình Mông Phụ','Mong Phu Communal House','ditich',
     'Đình làng xây năm 1684, tuyệt tác gỗ của dân tộc với gia logo gỗ chạm trổ tinh xảo, được công bunny quốc gia năm 1962.',
     'Built in 1684, a masterpiece of Vietnamese wood carving, national heritage site since 1962.',
     21.1432, 105.5301, null,
     'Đình Mông Phụ là niềm tự hào của làng Đường Lâm, nơi thờ Thành hoàng làng.',''],
    ['duong-mon-mong-phu','Đường làng & Đường môn','Village Lane & Gate','ditich',
     'Con đường đá ong uốn lượn với đình làng cổ kính, cây đa, giếng nước — linh hồn của làng quê Việt.',
     'A winding laterite lane with ancient gate, banyan trees and village well — the soul of rural Vietnam.',
     21.1428, 105.5296, null, '',''],
    ['nha-cua-tro-mong-phu','Nhà cổ Gia认真','Ancient House','nghieng',
     'Những ngôi nhà cổ đá ong hàng trăm tuổi với 5 gian, 2 chái, bếp đình, tủ desktop thờ, câu đối chữ Nôm.',
     'Hundreds-year-old laterite houses with five rooms, ancestral altar and Nom-script parallel sentences.',
     21.1435, 105.5285, null, '',''],
    ['mien-soan-son','Miến Soạn - Sơn','Son Village specialty','anuong',
     'Đặc sản nổi tiếng: mì sợi gạo truyền thống chấm nước tương, ăn kèm đậu phụng rang, bánh đúc.',
     'Famous rice-vermicelli specialty served with soy sauce, roasted peanuts and steamed rice cake.',
     21.1412, 105.5323, null, '',''],
    ['che-kho-lam','Củ lạc & Chè kho','Peanut & Sweet sticky-rice cake','anuong',
     'Món quà đậm đà làng quê — chè kho đậu xanh, củ lạc rang mặn ngọt hòa quyện.',
     'Traditional village snack — mung-bean sticky cake and sweet-salty roasted peanuts.',
     21.1415, 105.5295, null, '',''],
    ['lang-cam-giang','Cây đa làng Cam Giáng','Cam Giang Banyan','ditich',
     'Cây đa cổ thụ hàng trăm năm bên giếng nước làng, nơi trẻ em tụ họp mỗi chiều về.',
     'A centuries-old banyan beside the village well where children gather every evening.',
     21.1440, 105.5330, null, '',''],
    ['te-quan-tri','Đền Quán Trời','Sky Pavilion Temple','ditich',
     'Đền thờ trong truyền thuyết Bá Trạc và nàng Tiên Dung, gắn với huyền thoại làng Đường Lâm.',
     'Temple tied to the legend of Ba Trung and Fairy Dung of Duong Lam village.',
     21.1405, 105.5272, null, '','']
  ];
  for (const s of seed) ins.run(...s);

  // Tài khoản kinh doanh mẫu
  const biz = db.prepare(`INSERT INTO users (email,password,name,role,business_name) VALUES (?,?,?,?,?)`)
    .run('demo@duonglam.vn', bcrypt.hashSync('123456', 10), 'Homestay Đường Lâm', 'business', 'Đường Lâm Homestay');
  const lid = biz.lastInsertRowid;
  const insL = db.prepare(`INSERT INTO listings (owner_id,title,type,price,description_vi,description_en,address,phone,image,lat,lng)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  insL.run(lid, 'Nhà cổ Homestay Đường Lâm', 'homestay', 350000,
    'Ngủ trong ngôi nhà cổ đá ong 200 năm tuổi, ăn tối nhà quê, trải nghiệm làm chè kho cùng gia đình.',
    'Stay in a 200-year-old laterite house, home-cooked dinner, sweet-cake making workshop.',
    'Đường Mông Phụ, Đường Lâm, Sơn Tây, Hà Nội', '0912 345 678', null, 21.1431, 105.5290);
  insL.run(lid, 'Quán Miến Soạn Bà Hưa', 'quanAn', 50000,
    'Miến soạn truyền thống hơn 50 năm, đậu phụng rang giòn, nước tương nhà làm.',
    'Traditional rice vermicelli over 50 years, crispy peanuts, homemade soy sauce.',
    'Đường Mông Phụ, Đường Lâm', '0987 654 321', null, 21.1412, 105.5323);
}

module.exports = db;
