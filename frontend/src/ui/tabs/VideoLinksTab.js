import { FolderBrowser }      from '../components/FolderBrowser.js';
import { LogViewer }          from '../components/LogViewer.js';
import { VideoLinksService }  from '../../domains/video-links/VideoLinksService.js';
import { VideoLinksWriter }   from '../../domains/video-links/VideoLinksWriter.js';
import { SheetsService }      from '../../domains/sheets/SheetsService.js';
import { DriveService }       from '../../domains/drive/DriveService.js';

let _browser, _log, _videos = [], _rangeMode = 'all', _sourceMode = 'browse', _selectedFolder = null;

export const VideoLinksTab = {
  init() {
    _log     = new LogViewer('vl-log');
    _browser = new FolderBrowser({
      containerId:  'vl-folder-browser',
      breadcrumbId: 'vl-breadcrumb',
      upBtnId:      'vl-up-btn',
      onSelect: f  => _selectFolder(f),
    });

    // Expose to HTML
    window.vlLoadRoot       = () => _browser.loadRoot();
    window.vlGoUp           = () => _browser.goUp();
    window.vlSetSourceMode  = mode => _setSourceMode(mode);
    window.vlParseFolderUrl = el => _parseFolderUrl(el);
    window.vlSelectFromUrl  = () => _selectFromUrl();
    window.vlClearFolder    = () => _clearFolder();
    window.vlSetRangeMode   = mode => _setRangeMode(mode);
    window.vlUpdateRangeHint= () => _updateRangeHint();
    window.vlFetchVideos    = () => _fetchVideos();
    window.vlWriteToSheet   = () => _writeToSheet();
    window.vlAnalyzeDupes   = () => _analyzeDupes();
    window.vlParseSheetId   = el => _parseSheetId(el);
  },
};

function _setSourceMode(mode) {
  _sourceMode = mode;
  document.getElementById('vl-src-browse').classList.toggle('active', mode === 'browse');
  document.getElementById('vl-src-link').classList.toggle('active', mode === 'link');
  document.getElementById('vl-source-browse').style.display = mode === 'browse' ? 'block' : 'none';
  document.getElementById('vl-source-link').style.display   = mode === 'link'   ? 'block' : 'none';
}

function _selectFolder({ id, name, path }) {
  _selectedFolder = { id, name, path };
  document.getElementById('vl-selected-folder').style.display = 'block';
  document.getElementById('vl-sel-name').textContent = name;
  document.getElementById('vl-fetch-btn').disabled = false;
  _log.success(`تم اختيار: ${name}`);
}

function _clearFolder() {
  _selectedFolder = null; _videos = [];
  document.getElementById('vl-selected-folder').style.display = 'none';
  document.getElementById('vl-fetch-btn').disabled = true;
  document.getElementById('vl-preview').style.display = 'none';
  document.getElementById('vl-write-card').style.display = 'none';
  document.getElementById('vl-dupes-card').style.display = 'none';
}

let _sheetTimer = null;
function _parseSheetId(input) {
  const m = input.value.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const el = document.getElementById('vl-sheet-id-parsed');
  el.style.display = m ? 'block' : 'none';
  if (m) el.textContent = '✅ Sheet ID: ' + m[1];
  clearTimeout(_sheetTimer);
  _sheetTimer = setTimeout(_autoLoadSheetNames, 500);
}

async function _autoLoadSheetNames() {
  const id = _getSpreadsheetId();
  if (!id) return;
  const status = document.getElementById('vl-sheet-load-status');
  const sel    = document.getElementById('vl-sheet-name');
  status.textContent = '⏳ جاري الجلب...';
  status.style.color = 'var(--text3)';
  try {
    const sheets = await SheetsService.getSheetNames(id);
    sel.innerHTML = sheets.map(s => `<option value="${_esc(s.title)}">${_esc(s.title)}</option>`).join('');
    status.textContent = `✅ ${sheets.length} ورقة`;
    status.style.color = 'var(--success)';
    await _autoDetectLastRow();
  } catch (e) {
    status.textContent = '❌ ' + e.message;
    status.style.color = 'var(--danger)';
  }
}

async function _autoDetectLastRow() {
  const id       = _getSpreadsheetId();
  const sheet    = document.getElementById('vl-sheet-name').value;
  const numCol   = (document.getElementById('vl-num-col').value || 'A').toUpperCase();
  const startRow = parseInt(document.getElementById('vl-start-row').value) || 2;
  if (!id || !sheet) return;
  const el = document.getElementById('vl-end-row');
  el.placeholder = '⏳';
  try {
    const last = await SheetsService.findLastDataRow(id, sheet, numCol, startRow);
    el.value = last;
    el.style.color = 'var(--success)';
  } catch { el.placeholder = '301'; }
}

function _parseFolderUrl(input) {
  const id = DriveService.extractFolderIdFromUrl(input.value);
  const el = document.getElementById('vl-folder-url-parsed');
  el.style.display = input.value.trim() ? 'block' : 'none';
  if (id) { el.innerHTML = `✅ Folder ID: <strong>${id}</strong>`; el.style.background = 'var(--accent-bg)'; el.style.color = 'var(--accent-text)'; }
  else    { el.textContent = '⚠️ رابط غير معروف'; el.style.background = 'var(--warning-bg)'; el.style.color = 'var(--warning)'; }
}

async function _selectFromUrl() {
  const url = document.getElementById('vl-folder-url').value.trim();
  const id  = DriveService.extractFolderIdFromUrl(url);
  if (!id) { alert('رابط غير صحيح'); return; }
  let name = id;
  try {
    const d = await DriveService.getFolder(id);
    name = d.name || id;
  } catch {}
  _selectFolder({ id, name, path: name });
}

function _setRangeMode(mode) {
  _rangeMode = mode;
  document.getElementById('vl-rt-all').classList.toggle('active', mode === 'all');
  document.getElementById('vl-rt-range').classList.toggle('active', mode === 'range');
  document.getElementById('vl-range-inputs').style.display = mode === 'range' ? 'block' : 'none';
}

function _updateRangeHint() {
  const from = document.getElementById('vl-range-from')?.value || 1;
  const to   = document.getElementById('vl-range-to')?.value   || 100;
  const hf   = document.getElementById('vl-rh-from');
  const ht   = document.getElementById('vl-rh-to');
  if (hf) hf.textContent = from;
  if (ht) ht.textContent = to;
}

async function _fetchVideos() {
  if (!_selectedFolder) { alert('اختر مجلداً أولاً'); return; }
  const btn = document.getElementById('vl-fetch-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> جاري السحب...';
  document.getElementById('vl-preview').style.display = 'none';
  document.getElementById('vl-write-card').style.display = 'none';
  document.getElementById('vl-dupes-card').style.display = 'none';
  _log.info(`سحب الفيديوهات من: ${_selectedFolder.name}`);

  try {
    const includeSubfolders = document.getElementById('vl-include-subfolders').checked;
    let files = await VideoLinksService.fetchVideos(_selectedFolder.id, { includeSubfolders });

    if (!files.length) { _log.error('لا توجد فيديوهات'); return; }

    if (_rangeMode === 'range') {
      const from = parseInt(document.getElementById('vl-range-from').value) || 1;
      const to   = parseInt(document.getElementById('vl-range-to').value)   || from;
      files = VideoLinksService.applyRange(files, from, to);
      _log.info(`النطاق: ${from}→${to} (${files.length} فيديو)`);
    }

    _videos = files;
    _log.success(`${files.length} فيديو`);
    _renderPreview(files);

    document.getElementById('vl-write-card').style.display = 'block';
    document.getElementById('vl-dupes-card').style.display = 'block';
    document.getElementById('vl-dupes-result').innerHTML   = '<div style="font-size:13px;color:var(--text3)">اضغط "تحليل الآن" لفحص التكرار</div>';
  } catch (e) { _log.error(e.message); }

  btn.disabled = false; btn.textContent = '🔍 سحب قائمة الفيديوهات';
}

function _renderPreview(files) {
  const col      = (document.getElementById('vl-col').value || 'C').toUpperCase();
  const startRow = parseInt(document.getElementById('vl-start-row').value) || 2;
  const sheet    = document.getElementById('vl-sheet-name').value || 'Sheet1';
  const linkType = document.getElementById('vl-link-type').value;
  const inclName = document.getElementById('vl-include-name').checked;
  const endCol   = inclName ? String.fromCharCode(col.charCodeAt(0) + 1) : col;
  const maxP     = Math.min(files.length, 10);

  let tbl = `<table class="data-table"><thead><tr><th>#</th><th>اسم الفيديو</th><th>رابط</th><th>الخلية</th></tr></thead><tbody>`;
  for (let i = 0; i < maxP; i++) {
    const f = files[i];
    const link = VideoLinksService.getLinkUrl(f, linkType);
    tbl += `<tr><td>${i+1}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(f.name)}</td>
      <td><a href="${_esc(link)}" target="_blank" style="color:var(--accent);font-size:11px">🔗</a></td>
      <td style="font-family:var(--mono);font-size:12px;color:var(--text3)">${sheet}!${col}${startRow+i}</td>
    </tr>`;
  }
  if (files.length > maxP) tbl += `<tr><td colspan="4" style="text-align:center;color:var(--text3)">... و ${files.length-maxP} آخر</td></tr>`;
  tbl += '</tbody></table>';

  document.getElementById('vl-preview-badge').innerHTML = `<span class="badge badge-success">✅ ${files.length} فيديو</span>`;
  document.getElementById('vl-preview-table').innerHTML = tbl;
  document.getElementById('vl-preview').style.display   = 'block';

  const endRow = startRow + files.length - 1;
  document.getElementById('vl-write-summary').innerHTML =
    `كتابة <strong>${files.length} رابط</strong> في <strong>${col}${startRow}:${endCol}${endRow}</strong> ← ورقة <strong>"${_esc(sheet)}"</strong>`;
}

async function _writeToSheet() {
  if (!_videos.length) return;
  const id = _getSpreadsheetId();
  if (!id) { alert('أدخل معرّف الشيت'); return; }

  const btn = document.getElementById('vl-write-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> جاري الكتابة...';
  document.getElementById('vl-prog-wrap').style.display = 'block';
  _log.info('بدء الكتابة...');

  try {
    const { matched, skipped } = await VideoLinksWriter.write(id, {
      sheetName:    document.getElementById('vl-sheet-name').value || 'Sheet1',
      col:          (document.getElementById('vl-col').value || 'C').toUpperCase(),
      numCol:       (document.getElementById('vl-num-col').value || 'A').toUpperCase(),
      startRow:     parseInt(document.getElementById('vl-start-row').value) || 2,
      endRow:       parseInt(document.getElementById('vl-end-row').value)   || 301,
      videos:       _videos,
      linkType:     document.getElementById('vl-link-type').value,
      includeNames: document.getElementById('vl-include-name').checked,
      btnLabel:     document.getElementById('vl-btn-label').value.trim() || '▶ فيديو',
      onProgress: p => { document.getElementById('vl-prog-bar').style.width = Math.round(p * 100) + '%'; },
    });
    _log.success(`🎉 اكتمل — ${matched} كُتب${skipped ? `، ${skipped} تُخطّي` : ''}`);
  } catch (e) {
    _log.error(e.message);
    if (e.message.includes('403')) _log.error('أضف scope: spreadsheets للتوكن');
  }

  btn.disabled = false; btn.textContent = '✍️ كتابة الروابط في الشيت الآن';
}

function _analyzeDupes() {
  if (!_videos.length) return;
  const dupes = VideoLinksService.detectDuplicates(_videos);
  const el    = document.getElementById('vl-dupes-result');

  if (!dupes.length) {
    el.innerHTML = `<div style="padding:12px;background:var(--success-bg);border-radius:var(--radius);color:var(--success);font-size:13px">✅ لا توجد فيديوهات مكررة</div>`;
    return;
  }

  const icons = { 0: '🟢 الأول' };
  let html = `<div style="margin-bottom:10px;font-size:13px;color:var(--warning)">⚠️ ${dupes.length} مجموعة تكرار</div><div style="display:flex;flex-direction:column;gap:10px">`;
  dupes.forEach((group, gi) => {
    html += `<div style="border:1px solid #fcd34d;border-radius:var(--radius);overflow:hidden">
      <div style="padding:8px 12px;background:var(--warning-bg);font-size:12px;font-weight:600;color:var(--warning)">
        🔁 مكرر ${gi+1}: "${_esc(group[0].name.replace(/\.[^.]+$/, ''))}"
      </div>
      <table class="data-table" style="margin:0"><thead><tr><th>#</th><th>الاسم</th><th>رابط</th></tr></thead><tbody>`;
    group.forEach((f, i) => {
      const link = f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`;
      html += `<tr><td>${i===0?'🟢 الأول':`🔴 مكرر ${i}`}</td>
        <td style="font-size:12px;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(f.name)}</td>
        <td><a href="${_esc(link)}" target="_blank" style="color:var(--accent);font-size:12px">🔗 فتح</a></td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  });
  el.innerHTML = html + '</div>';
  _log.info(`تحليل التكرار: ${dupes.length} مجموعة`);
}

function _getSpreadsheetId() {
  const raw = document.getElementById('vl-sheet-id').value.trim();
  const m   = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : raw;
}

function _esc(s) { return (s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
