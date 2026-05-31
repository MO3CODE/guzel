// ─── config ───────────────────────────────────────────────────────────────────
const WA_BASE = 'http://localhost:3001';

// ─── state ────────────────────────────────────────────────────────────────────
let _pollTimer = null;
let _connected = false;

// ─── helpers ──────────────────────────────────────────────────────────────────
function escAttr(s) {
  return (s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

async function waFetch(path, opts = {}) {
  const res = await fetch(WA_BASE + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `خطأ ${res.status}`);
  return data;
}

function setBadge(count) {
  const badge = document.getElementById('wa-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

// ─── status ───────────────────────────────────────────────────────────────────
async function waCheckStatus() {
  try {
    const data = await waFetch('/status');
    waRenderStatus(data);
  } catch {
    waRenderStatus({ state: 'offline' });
  }
}

function waRenderStatus(data) {
  const el = document.getElementById('wa-status-wrap');
  if (!el) return;

  const state = data.state ?? 'offline';
  _connected  = state === 'connected';

  if (state === 'offline') {
    el.innerHTML = `
      <div class="wa-status offline">
        <span>⚫ غير متصل</span>
        <button class="btn btn-primary" onclick="window.waConnect()">اتصال</button>
      </div>`;
    stopPoll();
  } else if (state === 'qr') {
    const qr = data.qr ? `<img src="${escAttr(data.qr)}" class="wa-qr" alt="QR Code" />` : '<p>انتظر ظهور QR...</p>';
    el.innerHTML = `
      <div class="wa-status qr">
        <span>🔄 في انتظار المسح</span>
        ${qr}
      </div>`;
    stopPoll();
  } else if (state === 'connected') {
    const phone = data.phone ? `(${escAttr(data.phone)})` : '';
    el.innerHTML = `
      <div class="wa-status connected">
        <span>🟢 متصل ${phone}</span>
        <button class="btn btn-danger" onclick="window.waLogout()">تسجيل خروج</button>
      </div>`;
    startPoll();
    waLoadUnread();
    waLoadGroups();
  }
}

// ─── connect / logout ─────────────────────────────────────────────────────────
async function waConnect() {
  try {
    await waFetch('/connect', { method: 'POST' });
    setTimeout(waCheckStatus, 2000);
  } catch (e) {
    showWaMsg('خطأ في الاتصال: ' + e.message, 'error');
  }
}

async function waLogout() {
  if (!confirm('تسجيل الخروج من WhatsApp؟')) return;
  try {
    await waFetch('/logout', { method: 'POST' });
    setBadge(0);
    stopPoll();
    waCheckStatus();
  } catch (e) {
    showWaMsg('خطأ: ' + e.message, 'error');
  }
}

// ─── unread ───────────────────────────────────────────────────────────────────
async function waLoadUnread() {
  try {
    const data = await waFetch('/unread');
    const msgs = data.messages ?? [];
    setBadge(msgs.length);
    renderUnread(msgs);
  } catch {
    setBadge(0);
  }
}

function renderUnread(msgs) {
  const el = document.getElementById('wa-unread-list');
  if (!el) return;

  if (!msgs.length) {
    el.innerHTML = '<div class="empty-state">لا توجد رسائل غير مقروءة</div>';
    return;
  }

  el.innerHTML = msgs.map(m => `
    <div class="wa-msg-item">
      <div class="wa-msg-from">${escAttr(m.from ?? '')}</div>
      <div class="wa-msg-body">${escAttr(m.body ?? '')}</div>
      <div class="wa-msg-time" style="font-size:11px;color:var(--text3)">${m.time ? new Date(m.time).toLocaleTimeString('ar-SA') : ''}</div>
    </div>
  `).join('');
}

async function waClearUnread() {
  try {
    await waFetch('/unread/clear', { method: 'POST' });
    setBadge(0);
    renderUnread([]);
  } catch (e) {
    showWaMsg('خطأ: ' + e.message, 'error');
  }
}

// ─── groups ───────────────────────────────────────────────────────────────────
async function waLoadGroups() {
  try {
    const data   = await waFetch('/groups');
    const groups = data.groups ?? [];
    renderGroupsList(groups);
    populateGroupSelect(groups);
  } catch (e) {
    showWaMsg('خطأ تحميل المجموعات: ' + e.message, 'error');
  }
}

function renderGroupsList(groups) {
  const el = document.getElementById('wa-groups-list');
  if (!el) return;
  if (!groups.length) {
    el.innerHTML = '<div class="empty-state">لا توجد مجموعات</div>';
    return;
  }
  el.innerHTML = groups.map(g => `
    <div class="wa-group-item">
      <span>👥 ${escAttr(g.name)}</span>
      <span style="font-size:11px;color:var(--text3)">${g.participants ?? 0} عضو</span>
    </div>
  `).join('');
}

function populateGroupSelect(groups) {
  const sel = document.getElementById('wa-send-group');
  if (!sel) return;
  sel.innerHTML = '<option value="">اختر مجموعة...</option>' +
    groups.map(g => `<option value="${escAttr(g.id)}">${escAttr(g.name)}</option>`).join('');
}

// ─── send message ─────────────────────────────────────────────────────────────
async function waSendMsg() {
  const groupId = document.getElementById('wa-send-group')?.value;
  const msg     = document.getElementById('wa-send-msg')?.value?.trim();
  if (!groupId) { showWaMsg('اختر مجموعة', 'error'); return; }
  if (!msg)     { showWaMsg('أدخل رسالة', 'error'); return; }

  try {
    await waFetch('/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, message: msg }),
    });
    showWaMsg('✅ تم الإرسال', 'success');
    const msgEl = document.getElementById('wa-send-msg');
    if (msgEl) msgEl.value = '';
  } catch (e) {
    showWaMsg('خطأ: ' + e.message, 'error');
  }
}

async function waSendTo(to) {
  const msg = document.getElementById('wa-send-msg')?.value?.trim();
  if (!msg) { showWaMsg('أدخل رسالة', 'error'); return; }
  try {
    await waFetch('/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, message: msg }),
    });
    showWaMsg('✅ تم الإرسال', 'success');
  } catch (e) {
    showWaMsg('خطأ: ' + e.message, 'error');
  }
}

// ─── forward file ─────────────────────────────────────────────────────────────
async function waForwardFile() {
  const groupId = document.getElementById('wa-send-group')?.value;
  const fileEl  = document.getElementById('wa-file-input');
  const file    = fileEl?.files?.[0];

  if (!groupId) { showWaMsg('اختر مجموعة', 'error'); return; }
  if (!file)    { showWaMsg('اختر ملفاً', 'error'); return; }

  const form = new FormData();
  form.append('file', file);
  form.append('groupId', groupId);

  const caption = document.getElementById('wa-file-caption')?.value?.trim();
  if (caption) form.append('caption', caption);

  try {
    await fetch(`${WA_BASE}/send-file`, { method: 'POST', body: form })
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error || `خطأ ${r.status}`); });
    showWaMsg('✅ تم إرسال الملف', 'success');
    if (fileEl) fileEl.value = '';
  } catch (e) {
    showWaMsg('خطأ: ' + e.message, 'error');
  }
}

// ─── polling ──────────────────────────────────────────────────────────────────
function startPoll() {
  if (_pollTimer) return;
  _pollTimer = setInterval(() => {
    if (_connected) waLoadUnread();
  }, 15000);
}

function stopPoll() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

// ─── notification helper ──────────────────────────────────────────────────────
function showWaMsg(msg, type = 'info') {
  const el = document.getElementById('wa-notify');
  if (!el) return;
  el.className = `wa-notify ${type}`;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ─── expose to window ─────────────────────────────────────────────────────────
window.waConnect     = waConnect;
window.waLoadUnread  = waLoadUnread;
window.waClearUnread = waClearUnread;
window.waLoadGroups  = waLoadGroups;
window.waSendMsg     = waSendMsg;
window.waForwardFile = waForwardFile;
window.waLogout      = waLogout;
window.waSendTo      = waSendTo;

// ─── init ─────────────────────────────────────────────────────────────────────
waCheckStatus();
