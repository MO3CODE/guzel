import { MonitorService } from '../../domains/monitor/MonitorService.js';
import { FolderBrowser }  from '../components/FolderBrowser.js';
import { LogViewer }      from '../components/LogViewer.js';

// ─── state ───────────────────────────────────────────────────────────────────
let lastLiveData = null;

const log = new LogViewer('monitor-log');

const browser = new FolderBrowser({
  containerId:  'mon-folder-browser',
  breadcrumbId: 'mon-breadcrumb',
  upBtnId:      'mon-up-btn',
  onSelect: (folder) => monAddFolder(folder),
});

// ─── helpers ─────────────────────────────────────────────────────────────────
function escAttr(s) {
  return (s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function setProgress(pct) {
  const bar  = document.getElementById('mon-prog-bar');
  const wrap = document.getElementById('mon-prog-wrap');
  if (wrap) wrap.style.display = pct >= 0 ? 'block' : 'none';
  if (bar)  bar.style.width    = pct + '%';
}

// ─── browser open / close ─────────────────────────────────────────────────────
function monOpenBrowser() {
  const el = document.getElementById('mon-browser-wrap');
  if (el) el.style.display = 'block';
  monLoadRoot();
}

function monCloseBrowser() {
  const el = document.getElementById('mon-browser-wrap');
  if (el) el.style.display = 'none';
}

async function monLoadRoot() { await browser.loadRoot(); }
async function monGoUp()     { await browser.goUp(); }

// ─── folder list ─────────────────────────────────────────────────────────────
function renderMonFolders() {
  const el = document.getElementById('mon-folders-list');
  if (!el) return;
  const folders = MonitorService.getFolders();

  if (!folders.length) {
    el.innerHTML = '<div class="empty-state">لا توجد مجلدات مراقبة</div>';
    return;
  }

  el.innerHTML = folders.map((f, i) => {
    const driveLink = `https://drive.google.com/drive/folders/${escAttr(f.id)}`;
    return `
      <div class="mon-folder-item">
        <span class="tree-icon">📁</span>
        <div style="flex:1;min-width:0">
          <a href="${driveLink}" target="_blank" class="mon-folder-link" title="فتح في Drive">
            ${escAttr(f.name)}
          </a>
        </div>
        <button class="btn-icon danger" onclick="window.monRemoveFolder(${i})" title="إزالة">🗑️</button>
      </div>
    `;
  }).join('');
}

function monAddFolder(folder) {
  try {
    MonitorService.addFolder(folder);
    log.success(`✅ تمت إضافة: ${folder.name}`);
    renderMonFolders();
    monCloseBrowser();
  } catch (e) {
    log.error(e.message);
  }
}

function monRemoveFolder(index) {
  MonitorService.removeFolder(index);
  log.info('تمت إزالة المجلد');
  renderMonFolders();
}

// ─── snapshot ─────────────────────────────────────────────────────────────────
async function monTakeSnapshot() {
  log.clear();
  log.info('جاري أخذ لقطة...');
  setProgress(0);
  const btn = document.getElementById('snapshot-btn');
  if (btn) btn.disabled = true;

  try {
    await MonitorService.takeSnapshot((p) => setProgress(Math.round(p * 100)));
    const ts = new Date().toLocaleString('ar-SA');
    log.success(`✅ تم حفظ اللقطة في ${ts}`);
    setProgress(100);
    updateSnapshotInfo();
  } catch (e) {
    log.error('خطأ: ' + e.message);
    setProgress(-1);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function monCheckChanges() {
  log.clear();
  log.info('جاري فحص التغييرات...');
  setProgress(0);
  const btn = document.getElementById('check-btn');
  if (btn) btn.disabled = true;

  try {
    const result = await MonitorService.checkChanges((p) => setProgress(Math.round(p * 100)));
    lastLiveData = result.liveData;
    setProgress(100);
    const total = result.added.length + result.deleted.length + result.modified.length;
    log.success(`✅ اكتمل الفحص — ${total} تغيير`);
    renderMonResults(result);
  } catch (e) {
    log.error('خطأ: ' + e.message);
    setProgress(-1);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function monUpdateSnapshot() {
  if (!lastLiveData) { log.error('لا توجد بيانات حية. نفّذ فحص التغييرات أولاً'); return; }
  MonitorService.updateSnapshot(lastLiveData);
  log.success('✅ تم تحديث اللقطة');
  updateSnapshotInfo();
}

function monClearSnapshot() {
  if (!confirm('حذف اللقطة المحفوظة؟')) return;
  MonitorService.clearSnapshot();
  lastLiveData = null;
  log.info('تم حذف اللقطة');
  updateSnapshotInfo();
  const resultsEl = document.getElementById('mon-results');
  if (resultsEl) resultsEl.innerHTML = '';
}

function updateSnapshotInfo() {
  const snap = MonitorService.getSnapshot();
  const el   = document.getElementById('snapshot-info');
  if (!el) return;
  el.textContent = snap
    ? `اللقطة الأخيرة: ${new Date(snap.timestamp).toLocaleString('ar-SA')}`
    : 'لا توجد لقطة محفوظة';
}

// ─── results rendering ────────────────────────────────────────────────────────
function fileRowHtml(f) {
  const link = f.webViewLink
    ? `<a href="${escAttr(f.webViewLink)}" target="_blank" class="file-link">${escAttr(f.name)}</a>`
    : escAttr(f.name);
  return `<tr><td>${link}</td><td>${escAttr(f._folderName ?? '')}</td></tr>`;
}

function sectionTable(title, files, extraHeader = '') {
  if (!files.length) return '';
  return `
    <div class="mon-section">
      <h4 class="mon-section-title">${title} (${files.length})</h4>
      <table class="data-table">
        <thead><tr><th>الملف</th><th>المجلد</th>${extraHeader ? `<th>${extraHeader}</th>` : ''}</tr></thead>
        <tbody>${files.map(fileRowHtml).join('')}</tbody>
      </table>
    </div>
  `;
}

function renderMonResults({ added, deleted, modified }) {
  const el = document.getElementById('mon-results');
  if (!el) return;

  if (!added.length && !deleted.length && !modified.length) {
    el.innerHTML = '<div class="empty-state">✅ لا توجد تغييرات</div>';
    return;
  }

  el.innerHTML =
    sectionTable('➕ ملفات مضافة', added) +
    sectionTable('🗑️ ملفات محذوفة', deleted) +
    sectionTable('✏️ ملفات معدّلة', modified);
}

// ─── expose to window ─────────────────────────────────────────────────────────
window.monOpenBrowser    = monOpenBrowser;
window.monCloseBrowser   = monCloseBrowser;
window.monLoadRoot       = monLoadRoot;
window.monGoUp           = monGoUp;
window.monAddFolder      = monAddFolder;
window.monRemoveFolder   = monRemoveFolder;
window.monTakeSnapshot   = monTakeSnapshot;
window.monCheckChanges   = monCheckChanges;
window.monUpdateSnapshot = monUpdateSnapshot;
window.monClearSnapshot  = monClearSnapshot;

// ─── init ─────────────────────────────────────────────────────────────────────
renderMonFolders();
updateSnapshotInfo();
