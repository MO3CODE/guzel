import { PdfService } from '../../domains/pdf/PdfService.js';
import { LogViewer }  from '../components/LogViewer.js';

// ─── state ───────────────────────────────────────────────────────────────────
let mergeFiles = [];

const log = new LogViewer('merge-log');

// ─── helpers ─────────────────────────────────────────────────────────────────
function escAttr(s) {
  return (s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function formatSize(bytes) {
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// ─── render list ──────────────────────────────────────────────────────────────
function renderMergeList() {
  const el = document.getElementById('merge-list');
  if (!el) return;

  if (!mergeFiles.length) {
    el.innerHTML = '<div class="empty-state">لم يتم إضافة ملفات</div>';
    updateMergeBtn();
    return;
  }

  el.innerHTML = mergeFiles.map((f, i) => `
    <div class="merge-file-item">
      <span class="merge-file-icon">📄</span>
      <div style="flex:1;min-width:0">
        <div class="fi-name">${escAttr(f.name)}</div>
        <div style="font-size:11px;color:var(--text3)">${formatSize(f.size)}</div>
      </div>
      <div class="merge-order-btns">
        <button class="btn-icon" onclick="window.__mergeMoveUp(${i})" ${i === 0 ? 'disabled' : ''} title="تحريك لأعلى">⬆</button>
        <button class="btn-icon" onclick="window.__mergeMoveDown(${i})" ${i === mergeFiles.length - 1 ? 'disabled' : ''} title="تحريك لأسفل">⬇</button>
      </div>
      <button class="btn-icon danger" onclick="window.__mergeRemove(${i})" title="حذف">🗑️</button>
    </div>
  `).join('');

  updateMergeBtn();
}

function updateMergeBtn() {
  const btn = document.getElementById('merge-btn');
  if (btn) btn.disabled = mergeFiles.length < 2;
}

// ─── file management ──────────────────────────────────────────────────────────
function addMergeFiles(filesOrEvent) {
  let files;
  if (filesOrEvent instanceof FileList || Array.isArray(filesOrEvent)) {
    files = Array.from(filesOrEvent);
  } else if (filesOrEvent?.target?.files) {
    files = Array.from(filesOrEvent.target.files);
  } else {
    return;
  }

  const pdfs = files.filter(f => f.type === 'application/pdf');
  const skipped = files.length - pdfs.length;

  pdfs.forEach(f => mergeFiles.push(f));

  if (skipped) log.error(`تم تخطي ${skipped} ملف (ليس PDF)`);
  if (pdfs.length) log.info(`تمت إضافة ${pdfs.length} ملف`);

  renderMergeList();
}

function dropMerge(event) {
  event.preventDefault();
  document.getElementById('merge-drop-zone')?.classList.remove('drag-over');
  const files = event.dataTransfer?.files;
  if (files) addMergeFiles(files);
}

function clearMerge() {
  mergeFiles = [];
  renderMergeList();
  log.clear();
  log.info('تم مسح القائمة');
}

// ─── reorder helpers ─────────────────────────────────────────────────────────
window.__mergeMoveUp = (i) => {
  if (i === 0) return;
  [mergeFiles[i - 1], mergeFiles[i]] = [mergeFiles[i], mergeFiles[i - 1]];
  renderMergeList();
};

window.__mergeMoveDown = (i) => {
  if (i >= mergeFiles.length - 1) return;
  [mergeFiles[i], mergeFiles[i + 1]] = [mergeFiles[i + 1], mergeFiles[i]];
  renderMergeList();
};

window.__mergeRemove = (i) => {
  mergeFiles.splice(i, 1);
  renderMergeList();
};

// ─── merge ────────────────────────────────────────────────────────────────────
async function mergePDFs() {
  if (mergeFiles.length < 2) { log.error('أضف ملفين على الأقل'); return; }

  const btn = document.getElementById('merge-btn');
  if (btn) btn.disabled = true;
  log.clear();
  log.info(`جاري دمج ${mergeFiles.length} ملفات PDF...`);

  try {
    const blob = await PdfService.mergeFiles(mergeFiles);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'merged.pdf';
    a.click();
    URL.revokeObjectURL(url);
    log.success(`✅ تم الدمج بنجاح (${(blob.size / 1048576).toFixed(2)} MB)`);
  } catch (e) {
    log.error('خطأ: ' + e.message);
  } finally {
    if (btn) btn.disabled = mergeFiles.length < 2;
  }
}

// ─── expose to window ─────────────────────────────────────────────────────────
window.addMergeFiles = addMergeFiles;
window.dropMerge     = dropMerge;
window.clearMerge    = clearMerge;
window.mergePDFs     = mergePDFs;

// ─── init ─────────────────────────────────────────────────────────────────────
renderMergeList();
