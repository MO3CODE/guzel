// ─── Shared ──────────────────────────────────
import { TokenService }    from './shared/TokenService.js';
import { EventBus, Events } from './shared/EventBus.js';

// ─── Auth ─────────────────────────────────────
import { initPinScreen, pinKey, pinDel } from './domains/auth/PinScreen.js';

// ─── UI ───────────────────────────────────────
import { TabManager }   from './ui/TabManager.js';
import { FoldersTab }   from './ui/tabs/FoldersTab.js';
import { BrowseTab }    from './ui/tabs/BrowseTab.js';
import { PdfExtractTab }from './ui/tabs/PdfExtractTab.js';
import { PdfMergeTab }  from './ui/tabs/PdfMergeTab.js';
import { VideoLinksTab }from './ui/tabs/VideoLinksTab.js';
import { MonitorTab }   from './ui/tabs/MonitorTab.js';
import { WhatsAppTab }  from './ui/tabs/WhatsAppTab.js';

// ─── Expose globals for inline HTML onclicks ──
window.switchTab   = n  => TabManager.switch(n);
window.pinKey      = pinKey;
window.pinDel      = pinDel;
window.verifyToken = () => TokenService.verify(document.getElementById('token-inp').value.trim()).then(updateTokenUI);

// Shared download helper used by pdf tabs
window.dl = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
};

// Shared escaping helpers (used by tree builder inline strings)
window.escAttr = s => (s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
window.escJs   = s => (s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// Expose tab methods
window.foldersTab   = FoldersTab;
window.browseTab    = BrowseTab;
window.pdfExtract   = PdfExtractTab;
window.pdfMerge     = PdfMergeTab;
window.videoLinks   = VideoLinksTab;
window.monitor      = MonitorTab;
window.whatsapp     = WhatsAppTab;

// ─── Token UI ────────────────────────────────
function updateTokenUI(user) {
  const dot   = document.getElementById('conn-dot');
  const label = document.getElementById('conn-label');
  const btn   = document.getElementById('create-btn');
  if (user) {
    dot.className         = 'dot green';
    label.textContent     = user.displayName || 'متصل';
    label.style.color     = '#166534';
    btn.disabled          = false;
  } else {
    dot.className         = 'dot';
    label.textContent     = 'غير متصل';
    label.style.color     = '';
    btn.disabled          = true;
  }
}

EventBus.on(Events.TOKEN_CHANGED, () => {
  const inp = document.getElementById('token-inp');
  if (inp) inp.value = TokenService.get();
});

// ─── Bootstrap ───────────────────────────────
async function bootstrap() {
  // 1 — PIN screen
  initPinScreen(onAuthenticated);
}

async function onAuthenticated() {
  // 2 — Auto-refresh token
  const autoToken = await TokenService.autoRefresh();
  if (autoToken) {
    const user = await TokenService.verify(autoToken);
    updateTokenUI(user);
    document.getElementById('token-card-manual').style.display = 'none';
    document.getElementById('token-auto-badge').style.display  = 'flex';
    const autoUser = document.getElementById('conn-auto-user');
    if (autoUser && user) autoUser.textContent = user.displayName || '';
  } else if (TokenService.get()) {
    const user = await TokenService.verify();
    updateTokenUI(user);
  }

  // 3 — Check backend health
  try {
    const r = await fetch('/api/health');
    document.getElementById('server-status').innerHTML = r.ok
      ? '<span class="server-banner ok">✅ الخادم متصل — استخراج PDF جاهز</span>'
      : '<span class="server-banner err">⚠️ الخادم غير متصل</span>';
  } catch {
    document.getElementById('server-status').innerHTML =
      '<span class="server-banner err">⚠️ الخادم غير متصل</span>';
  }

  // 4 — Init all tabs
  FoldersTab.init();
  BrowseTab.init();
  PdfExtractTab.init();
  PdfMergeTab.init();
  VideoLinksTab.init();
  MonitorTab.init();
  WhatsAppTab.init();
}

bootstrap();
