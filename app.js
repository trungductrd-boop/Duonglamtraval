/* ================= Đường Lâm App ================= */
const API = '';
let token = localStorage.getItem('dl_token') || null;
let user = JSON.parse(localStorage.getItem('dl_user') || 'null');
let places = [], listings = [], currentSlug = null;
let myMarker = null, routeLayer = null, map = null, markers = {};

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => (s || '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

/* ---------- Navigation ---------- */
function navigate(v) {
  $$('nav a').forEach(a => a.classList.toggle('active', a.dataset.view === v));
  $$('.view').forEach(s => s.classList.remove('active'));
  $('#view-' + v).classList.add('active');
  if (v === 'map' && !map) initMap();
  if (v === 'shop') renderShop();
  if (v === 'business') renderBiz();
}
$$('nav a').forEach(a => a.onclick = e => { e.preventDefault(); navigate(a.dataset.view) });

/* ---------- Load data ---------- */
async function loadPlaces() {
  places = await (await fetch(API + '/api/places')).json();
  renderHome(); fillRouteSelect(); renderMapPlaces();
  if (map) drawMarkers();
}
async function loadListings() {
  listings = await (await fetch(API + '/api/listings')).json();
  renderShop();
}

/* ---------- Home ---------- */
const catVi = { ditich: '🏛️ Di tích', nghieng: '🏠 Nhà cổ', anuong: '🍜 Ẩm thực', muaSam: '🛍️ Mua sắm' };
function renderHome() {
  $('#place-grid').innerHTML = places.filter(p => p.category !== 'anuong').map(cardHTML).join('');
  $('#food-grid').innerHTML = places.filter(p => p.category === 'anuong').map(cardHTML).join('');
  $$('.place-card').forEach(c => c.onclick = () => openPlace(c.dataset.slug));
}
function cardHTML(p) {
  const img = p.image || `https://images.unsplash.com/photo-1528181304800-259b08848526?auto=format&fit=crop&w=600&q=70&sig=${p.id}`;
  return `<div class="place-card" data-slug="${p.slug}">
    <img src="${img}" onerror="this.style.background='linear-gradient(135deg,#8b3a2e,#c9a227)';this.src='data:image/gif;base64,R0lGODlhAQABAAAAACw=';">
    <div class="pc-body"><h4>${esc(p.name)}</h4><p>${esc((p.description_vi || '').slice(0, 90))}...</p>
    <span class="tag">${catVi[p.category] || p.category}</span></div></div>`;
}

/* ---------- Place detail + comments ---------- */
async function openPlace(slug) {
  currentSlug = slug;
  const p = await (await fetch(API + '/api/places/' + slug)).json();
  $('#place-detail').innerHTML = `
    <h3 style="color:var(--pri)">${esc(p.name)}</h3>
    <p style="color:#666;font-style:italic">${esc(p.name_en || '')}</p>
    <p style="margin:12px 0">${esc(p.description_vi || '')}</p>
    <p>${esc(p.description_en || '')}</p>
    <button class="speak-btn" onclick="speakPlace('${slug}')">🔊 Nghe thuyết minh đa ngôn ngữ</button>`;
  $('#place-modal').hidden = false;
  $('#comment-list').innerHTML = (p.comments || []).map(c =>
    `<div class="comment"><b>${esc(c.user_name)}</b> ${'★'.repeat(c.rating)}<br>${esc(c.content)}<small>${c.created_at}</small></div>`).join('');
  $('#comment-form').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const r = await fetch(API + '/api/places/' + slug + '/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_name: f.get('user_name'), content: f.get('content'), rating: +f.get('rating') })
    });
    if (r.ok) { e.target.reset(); }
  };
}
// realtime bình luận
const socket = io();
socket.on('new-comment', d => {
  if (currentSlug === d.place_slug) {
    $('#comment-list').insertAdjacentHTML('afterbegin',
      `<div class="comment"><b>${esc(d.comment.user_name)}</b> ${'★'.repeat(d.comment.rating)}<br>${esc(d.comment.content)}<small>vừa xong</small></div>`);
  }
});
socket.on('new-listing', () => loadListings());

/* ---------- Multilingual voice (TTS) ---------- */
// Dịch qua AI rồi dùng Web Speech API với giọng đúng ngôn ngữ
const LANG_MAP = { vi: 'vi-VN', en: 'en-US', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN', fr: 'fr-FR', th: 'th-TH' };

async function translate(text, lang) {
  if (lang === 'vi') return text;
  const r = await fetch(API + '/api/ai/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Dịch chính xác đoạn sau sang ${lang}, chỉ trả về bản dịch:\n${text}`, lang })
  });
  const d = await r.json();
  // dùng lại reply làm bản dịch (fallback khi không có OPENAI key thì vẫn đọc nguyên văn)
  return d.reply || text;
}
async function speak(text, lang = 'vi') {
  const translated = await translate(text, lang);
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(translated);
  const voices = speechSynthesis.getVoices();
  const v = voices.find(v => v.lang.toLowerCase().startsWith(lang));
  if (v) u.voice = v;
  u.lang = LANG_MAP[lang] || 'vi-VN';
  u.rate = 0.95;
  speechSynthesis.speak(u);
}
async function startNarration(lang) {
  const t = `Chào mừng bạn đến với làng cổ Đường Lâm, viên ngọc quý hơn nghìn năm tuổi nằm ở Sơn Tây, Hà Nội. Ở đây có Đình Mông Phụ tuyệt tác gỗ được công nhận di tích quốc gia từ năm 1962, cụm chùa Mộng Phụ và Chùa Cao, những ngôi nhà cổ đá ong hàng trăm năm cùng đặc sản miến soạn, chè kho và củ lạc rang. Hãy mở bản đồ để bắt đầu hành trình về nguồn cội!`;
  speak(t, lang);
}
async function speakPlace(slug, lang) {
  lang = lang || $('#voice-lang').value;
  const p = places.find(x => x.slug === slug); if (!p) return;
  speak(`${p.name}. ${p.description_vi || ''}`, lang);
}
async function aiSpeakLast() {
  const msgs = $$('#ai-msgs .msg.bot');
  if (msgs.length) speak(msgs[msgs.length - 1].textContent, $('#voice-lang').value);
}

/* ---------- AI Guide ---------- */
function toggleAI(open) { $('#ai-panel').classList.toggle('open', open ?? !$('#ai-panel').classList.contains('open')); }
$('#btn-ai').onclick = () => toggleAI();
function aiAdd(role, text) {
  $('#ai-msgs').insertAdjacentHTML('beforeend', `<div class="msg ${role}">${esc(text)}</div>`);
  $('#ai-msgs').scrollTop = 1e9;
}
async function aiSend(msg) {
  msg = msg || $('#ai-input').value.trim(); if (!msg) return;
  $('#ai-input').value = '';
  aiAdd('user', msg);
  const r = await fetch(API + '/api/ai/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg, lang: $('#voice-lang').value, context: places.map(p => p.name).join(', ') })
  });
  const d = await r.json();
  aiAdd('bot', d.reply || '...');
}

/* ---------- Map + Geolocation + Routing ---------- */
function initMap() {
  map = L.map('map').setView([21.1425, 105.5300], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
  drawMarkers();
  map.on('click', e => {
    if ($('#view-business').classList.contains('active')) {
      const f = $('#listing-form'); f.lat.value = e.latlng.lat.toFixed(6); f.lng.value = e.latlng.lng.toFixed(6);
      L.popup().setLatLng(e.latlng).setContent('Đã chọn vị trí: ' + e.latlng.lat.toFixed(5) + ', ' + e.latlng.lng.toFixed(5)).openOn(map);
    }
  });
}
function drawMarkers() {
  const icon = c => L.divIcon({ html: `<div style="background:${c};width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.3)"><span style="transform:rotate(45deg)">🏛️</span></div>`, className: '', iconSize: [30, 30], iconAnchor: [15, 30] });
  places.forEach(p => {
    if (markers[p.slug]) return;
    const m = L.marker([p.lat, p.lng], { icon: icon(catVi[p.category]?.includes('Ẩm') ? '#c9a227' : '#8b3a2e') }).addTo(map)
      .bindPopup(`<b>${esc(p.name)}</b><br><button onclick="openPlace('${p.slug}');document.getElementById('place-modal').hidden=false">Xem chi tiết & bình luận</button>`);
    markers[p.slug] = m;
  });
}
function renderMapPlaces() {
  $('#map-places').innerHTML = `<b style="color:var(--pri)">Địa điểm trong làng:</b>` +
    places.map(p => `<div class="item" onclick="flyTo('${p.slug}')">🏛️ ${esc(p.name)}</div>`).join('');
}
function flyTo(slug) { const p = places.find(x => x.slug === slug); map.flyTo([p.lat, p.lng], 17); markers[slug].openPopup(); }
function fillRouteSelect() {
  $('#route-to').innerHTML = places.map(p => `<option value="${p.slug}">${esc(p.name)}</option>`).join('');
}
$('#btn-locate').onclick = () => {
  if (!navigator.geolocation) return alert('Trình duyệt không hỗ trợ định vị');
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: lat, longitude: lng } = pos.coords;
    $('#route-from').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    if (myMarker) map.removeLayer(myMarker);
    myMarker = L.marker([lat, lat ? lng : lng], { title: 'Vị trí của tôi' }).addTo(map)
      .bindPopup('📍 Bạn đang ở đây').openPopup();
    map.flyTo([lat, lng], 15);
  }, err => alert('Không lấy được vị trí: ' + err.message), { enableHighAccuracy: true });
};
$('#btn-route').onclick = async () => {
  if (!myMarker) return alert('Bạn cần định vị vị trí của mình trước (nút 📍)');
  const dest = places.find(p => p.slug === $('#route-to').value);
  if (!dest) return;
  const from = myMarker.getLatLng();
  const mode = $('#route-mode').value;
  $('#route-info').textContent = 'Đang tính toán lộ trình...';
  try {
    // OSRM public routing
    const prof = mode === 'foot' ? 'foot' : mode === 'bike' ? 'bike' : 'driving';
    const url = `https://router.project-osrm.org/route/v1/${prof}/${from.lng},${from.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
    const d = await (await fetch(url)).json();
    if (d.code !== 'Ok') throw new Error(d.code);
    const route = d.routes[0];
    const km = (route.distance / 1000).toFixed(2);
    const min = Math.round(route.duration / 60);
    if (routeLayer) map.removeLayer(routeLayer);
    routeLayer = L.geoJSON(route.geometry, { style: { color: '#c05a3c', weight: 5, opacity: .8 } }).addTo(map);
    map.fitBounds(routeLayer.getBounds().pad(0.2));
    const modeVi = { foot: 'đi bộ', bike: 'xe đạp', car: 'ô tô' }[mode];
    $('#route-info').textContent = `Lộ trình đến ${dest.name}:\n📏 ${km} km\n⏱️ ~${min} phút (${modeVi})`;
    window._routeText = `Lộ trình từ vị trí của bạn đến ${dest.name} dài ${km} ki-lô-mét, mất khoảng ${min} phút ${modeVi}. Chúc bạn có hành trình vui vẻ ở làng cổ Đường Lâm!`;
  } catch (e) {
    // fallback khoảng cách chim bay
    const from = myMarker.getLatLng();
    const km = (map.distance(from, [dest.lat, dest.lng]) / 1000).toFixed(2);
    $('#route-info').textContent = `Không tìm được lộ trình chi tiết.\nKhoảng cách chim bay tới ${dest.name}: ~${km} km`;
    window._routeText = `Khoảng cách chim bay tới ${dest.name} khoảng ${km} ki-lô-mét.`;
  }
};
$('#btn-narrate-route').onclick = () => { if (window._routeText) speak(window._routeText, $('#voice-lang').value); };

/* ---------- Shop ---------- */
function renderShop() {
  $('#shop-grid').innerHTML = listings.length ? listings.map(l =>`
    <div class="shop-card" onclick='bookListing(${l.id})'>
      <img src="${l.image || `https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=600&q=70&sig=${l.id}`}">
      <div class="pc-body"><h4>${esc(l.title)}</h4>
      <p>${esc((l.description_vi || '').slice(0, 80))}...</p>
      <span class="tag">${typeVi(l.type)}</span>
      <span class="tag" style="background:#fdf0d5">${l.price ? (+l.price).toLocaleString('vi-VN') + ' ₫' : 'Liên hệ'}</span>
      <p style="margin-top:8px;font-size:13px;color:#666">📞 ${esc(l.phone || '')} · ${esc(l.address || '')}</p>
      <button class="btn primary w100" onclick="event.stopPropagation();bookListing(${l.id})">Đặt chỗ</button></div>
    </div>`).join('') : '<p>Chưa có chỗ ở nào.</p>';
}
const typeVi = t => ({ homestay: '🏡 Homestay', khachsan: '🏨 Khách sạn', quanAn: '🍜 Quán ăn', cuaHang: '🛍️ Cửa hàng' }[t] || t);
async function bookListing(id) {
  const l = listings.find(x => x.id === id);
  const user_name = prompt('Tên của bạn:'); if (!user_name) return;
  const phone = prompt('Số điện thoại:'); if (!phone) return;
  const note = prompt('Ghi chú (ngày, số người):') || '';
  const r = await fetch(API + '/api/bookings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listing_id: id, user_name, phone, note })
  });
  alert(r.ok ? '✅ Đã gửi yêu cầu đặt chỗ! Chủ nhà sẽ liên hệ với bạn.' : '❌ Lỗi đặt chỗ');
}

/* ---------- Business ---------- */
function renderBiz() {
  const isBiz = user && user.role === 'business';
  $('#biz-login-hint').hidden = !!user;
  $('#biz-panel').hidden = !isBiz;
  if (isBiz) loadMyListings();
}
async function loadMyListings() {
  const r = await fetch(API + '/api/my/listings', { headers: { Authorization: 'Bearer ' + token } });
  const list = await r.json();
  $('#my-listings').innerHTML = list.map(l =>`
    <div class="card" style="margin-top:12px;display:flex;justify-content:space-between;align-items:center">
      <div><b>${esc(l.title)}</b> <span class="tag">${typeVi(l.type)}</span><br><small>${esc(l.address || '')}</small></div>
      <div><button class="btn" onclick="speakListing(${l.id})">🔊 Nghe đa ngôn ngữ</button>
      <button class="btn ghost" onclick="delListing(${l.id})">🗑️</button></div>
    </div>`).join('');
}
async function speakListing(id) {
  const l = listings.find(x => x.id === id) || await (await fetch(API + '/api/listings/' + id)).json();
  speak(`${l.title}. ${l.description_vi || ''}`, $('#voice-lang').value);
}
async function delListing(id) {
  if (!confirm('Xóa chỗ ở này?')) return;
  await fetch(API + '/api/listings/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
  loadMyListings(); loadListings();
}
$('#listing-form').onsubmit = async e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const r = await fetch(API + '/api/listings', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ ...f, price: +f.price || 0, lat: f.lat ? +f.lat : null, lng: f.lng ? +f.lng : null })
  });
  if (r.ok) { alert('✅ Đã đăng! Khách ngay lập tức thấy trong Shop.'); e.target.reset(); loadMyListings(); loadListings(); }
  else alert((await r.json()).error);
};

/* ---------- Auth ---------- */
let authMode = 'login';
function openAuth(mode) { authMode = mode || 'login'; updateAuthForm(); $('#auth-modal').hidden = false; }
function closeAuth() { $('#auth-modal').hidden = true; }
function updateAuthForm() {
  $('#auth-title').textContent = authMode === 'login' ? 'Đăng nhập' : 'Đăng ký tài khoản';
  $('#auth-submit').textContent = authMode === 'login' ? 'Đăng nhập' : 'Đăng ký';
  $('#auth-switch').textContent = authMode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập';
  const show = authMode === 'register';
  ['name', 'role', 'business_name'].forEach(n => $(`#auth-form [name=${n}]`).hidden = !show);
}
$('#auth-switch').onclick = e => { e.preventDefault(); authMode = authMode === 'login' ? 'register' : 'login'; updateAuthForm() };
$('#btn-auth').onclick = () => user ? logout() : openAuth('login');
function logout() { token = null; user = null; localStorage.clear(); updateAuthUI(); }
function updateAuthUI() {
  if (user) {
    $('#user-chip').hidden = false;
    $('#user-chip').innerHTML = `<b style="color:var(--pri)">${esc(user.name)}</b>${user.role === 'business' ? ' 🏪' : ''}`;
    $('#btn-auth').textContent = 'Đăng xuất';
  } else { $('#user-chip').hidden = true; $('#btn-auth').textContent = 'Đăng nhập'; }
}
$('#auth-form').onsubmit = async e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const url = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
  const r = await fetch(API + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
  const d = await r.json();
  if (!r.ok) return alert(d.error);
  token = d.token; user = d.user; localStorage.setItem('dl_token', token); localStorage.setItem('dl_user', JSON.stringify(user));
  closeAuth(); updateAuthUI();
  alert(authMode === 'register' ? '✅ Tạo tài khoản thành công!' : '✅ Đăng nhập thành công!');
  renderBiz();
};

/* ---------- Init ---------- */
speechSynthesis.onvoiceschanged = () => { };
updateAuthUI(); loadPlaces(); loadListings();
