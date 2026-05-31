import { PdfService }   from '../../domains/pdf/PdfService.js';
import { LogViewer }    from '../components/LogViewer.js';
import { DriveService } from '../../domains/drive/DriveService.js';

// ─── state ───────────────────────────────────────────────────────────────────
let extractedNames = [];
let currentFile    = null;

const log = new LogViewer('extract-log');

// ─── helpers ─────────────────────────────────────────────────────────────────
function escAttr(s) {
  return (s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// ─── render table ────────────────────────────────────────────────────────────
function renderNamesTable(names) {
  const el = document.getElementById('names-table-wrap');
  if (!el) return;

  if (!names.length) {
    el.innerHTML = '<div class="empty-state">لا توجد أسماء مستخرجة</div>';
    return;
  }

  const rows = names.map((n, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escAttr(n)}</td>
    </tr>
  `).join('');

  el.innerHTML = `
    <div style="margin-bottom:8px;color:var(--text2)">
      عدد الأسماء: <strong>${names.length}</strong>
    </div>
    <table class="data-table">
      <thead><tr><th>#</th><th>الاسم</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function setExportBtnsState(enabled) {
  ['export-upload-btn', 'download-xlsx-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !enabled;
  });
}

// ─── extract ─────────────────────────────────────────────────────────────────
async function doExtract(file) {
  if (!file) {
    log.error('لم يتم اختيار ملف');
    return;
  }
  currentFile = file;
  log.clear();
  log.info(`جاري استخراج الأسماء من: ${file.name}`);

  const btn = document.getElementById('extract-btn');
  if (btn) btn.disabled = true;

  try {
    extractedNames = await PdfService.extractNames(file);
    log.success(`✅ تم استخراج ${extractedNames.length} اسم`);
    renderNamesTable(extractedNames);
    setExportBtnsState(extractedNames.length > 0);
  } catch (e) {
    log.error('خطأ: ' + e.message);
    setExportBtnsState(false);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function dropExtract(event) {
  event.preventDefault();
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  if (file.type !== 'application/pdf') {
    log.error('الملف ليس PDF');
    return;
  }
  doExtract(file);
}

// ─── dov / dlv ───────────────────────────────────────────────────────────────
// dov = drag-over, dlv = drag-leave (visual feedback helpers called from HTML)
function dov(event) {
  event.preventDefault();
  document.getElementById('pdf-drop-zone')?.classList.add('drag-over');
}

function dlv() {
  document.getElementById('pdf-drop-zone')?.classList.remove('drag-over');
}

// ─── export & upload ─────────────────────────────────────────────────────────
async function exportAndUpload() {
  if (!extractedNames.length) { log.error('لا توجد أسماء للرفع'); return; }

  const urlInput = document.getElementById('upload-folder-url')?.value?.trim() ?? '';
  const folderId = DriveService.extractFolderIdFromUrl(urlInput);
  if (!folderId) { log.error('أدخل رابط مجلد صحيح'); return; }

  const btn = document.getElementById('export-upload-btn');
  if (btn) btn.disabled = true;
  log.info('جاري إنشاء ملف Excel...');

  try {
    const blob     = PdfService.buildXlsx(extractedNames);
    const baseName = currentFile ? currentFile.name.replace(/\.pdf$/i, '') : 'أسماء';
    const fileName = `${baseName}.xlsx`;

    log.info(`جاري رفع: ${fileName}`);
    await DriveService.uploadFile(blob, fileName, folderId);
    log.success(`✅ تم رفع الملف بنجاح: ${fileName}`);
  } catch (e) {
    log.error('خطأ: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function downloadXlsx() {
  if (!extractedNames.length) { log.error('لا توجد أسماء للتحميل'); return; }
  try {
    const blob     = PdfService.buildXlsx(extractedNames);
    const baseName = currentFile ? currentFile.name.replace(/\.pdf$/i, '') : 'أسماء';
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    a.href         = url;
    a.download     = `${baseName}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    log.success('✅ تم تحميل الملف');
  } catch (e) {
    log.error('خطأ: ' + e.message);
  }
}

// ─── expose to window ─────────────────────────────────────────────────────────
window.doExtract      = doExtract;
window.dropExtract    = dropExtract;
window.exportAndUpload = exportAndUpload;
window.downloadXlsx   = downloadXlsx;
window.dov            = dov;
window.dlv            = dlv;

// ─── init ─────────────────────────────────────────────────────────────────────
setExportBtnsState(false);
