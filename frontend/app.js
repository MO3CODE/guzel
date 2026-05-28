// ═══════════════════════════════════════════
// Config
// ═══════════════════════════════════════════
const API_BASE = '/api';

// ═══════════════════════════════════════════
// State
// ═══════════════════════════════════════════
let token = localStorage.getItem('drive_token') || '';
let folderMap = {};
let extractedNames = [];
let mergeFiles = [];
let treeData = JSON.parse(localStorage.getItem('tree_data') || '[]');
let browseTree = [];
let _nodeId = 0;

// ═══════════════════════════════════════════
// Init
// ═══════════════════════════════════════════
(async function init() {
  // Restore saved token
  if (token) {
    document.getElementById('token-inp').value = token;
    await verifyToken(true);
  }

  // Check backend server
  try {
    const r = await fetch(`${API_BASE}/health`);
    if (r.ok) {
      document.getElementById('server-status').innerHTML =
        '<span class="server-banner ok">✅ الخادم متصل — استخراج PDF جاهز</span>';
    } else throw new Error();
  } catch {
    document.getElementById('server-status').innerHTML =
      '<span class="server-banner err">⚠️ الخادم غير متصل — شغّل Backend أولاً: <code>cd backend && npm start</code></span>';
  }

  renderTree('tree-builder', treeData, updateTreePreview);
  renderTree('browse-tree-builder', browseTree, updateBrowseTreePreview);
})();

// ─── Tabs ────────────────────────────────────
function switchTab(n) {
  ['folders', 'browse', 'pdf-extract', 'pdf-merge', 'video-links'].forEach((t, i) => {
    document.querySelectorAll('.tab')[i].classList.toggle('active', t === n);
    document.getElementById('tab-' + t).classList.toggle('active', t === n);
  });
}

// ─── Token ───────────────────────────────────
async function verifyToken(silent = false) {
  token = document.getElementById('token-inp').value.trim();
  if (!token) return;
  try {
    const r = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const d = await r.json();
    if (r.ok) {
      localStorage.setItem('drive_token', token);
      document.getElementById('conn-dot').className = 'dot green';
      document.getElementById('conn-label').textContent = d.user?.displayName || 'متصل';
      document.getElementById('conn-label').style.color = '#166534';
      document.getElementById('create-btn').disabled = false;
    } else {
      localStorage.removeItem('drive_token');
      token = '';
      if (!silent) alert('❌ التوكن غير صحيح أو منتهي\n\nاحصل على توكن جديد من OAuth Playground');
    }
  } catch (e) {
    if (!silent) alert('خطأ: ' + e.message);
  }
}

// ─── Log ─────────────────────────────────────
function addLog(id, msg, type = '') {
  const el = document.getElementById(id);
  const d = document.createElement('div');
  d.className = 'log-line ' + type;
  d.textContent = `[${new Date().toLocaleTimeString('ar-SA')}] ${msg}`;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
}

// ═══════════════════════════════════════════
// TREE BUILDER
// ═══════════════════════════════════════════
function newId() { return ++_nodeId; }

function addNode(arr) {
  const node = { id: newId(), name: '', children: [] };
  arr.push(node);
  const isMain = arr === treeData;
  renderTree(isMain ? 'tree-builder' : 'browse-tree-builder', arr,
    isMain ? updateTreePreview : updateBrowseTreePreview);
  setTimeout(() => { document.getElementById('n-' + node.id)?.focus(); }, 50);
}

function removeNode(arr, id) {
  function del(a) {
    for (let i = 0; i < a.length; i++) {
      if (a[i].id === id) { a.splice(i, 1); return true; }
      if (del(a[i].children)) return true;
    }
  }
  del(arr);
  const isMain = arr === treeData;
  renderTree(isMain ? 'tree-builder' : 'browse-tree-builder', arr,
    isMain ? updateTreePreview : updateBrowseTreePreview);
}

function addChild(arr, parentId) {
  function find(a) {
    for (const n of a) {
      if (n.id === parentId) {
        const c = { id: newId(), name: '', children: [] };
        n.children.push(c);
        return c;
      }
      const r = find(n.children);
      if (r) return r;
    }
  }
  const newNode = find(arr);
  const isMain = arr === treeData;
  renderTree(isMain ? 'tree-builder' : 'browse-tree-builder', arr,
    isMain ? updateTreePreview : updateBrowseTreePreview);
  if (newNode) setTimeout(() => { document.getElementById('n-' + newNode.id)?.focus(); }, 50);
}

function updateName(arr, id, val) {
  function set(a) { for (const n of a) { if (n.id === id) { n.name = val; return; } set(n.children); } }
  set(arr);
  if (arr === treeData) { saveTree(); updateTreePreview(); } else updateBrowseTreePreview();
}

function saveTree() {
  localStorage.setItem('tree_data', JSON.stringify(treeData));
}

function renderTree(containerId, arr, onUpdate) {
  const el = document.getElementById(containerId);
  el.innerHTML = arr.length
    ? renderNodes(arr, arr, 0)
    : '<div class="tree-empty">لا توجد مجلدات — اضغط "+ مجلد" للبدء</div>';
  onUpdate();
}

function renderNodes(arr, root, depth) {
  const isMain = root === treeData;
  return arr.map(n => {
    const safeName = escAttr(n.name);
    const arrRef = isMain ? 'treeData' : 'browseTree';
    return `
    <div class="tree-node">
      <div class="tree-node-row">
        <span class="tree-icon">📁</span>
        <input class="tree-node-name" id="n-${n.id}" value="${safeName}" placeholder="اسم المجلد..."
          oninput="updateName(${arrRef},${n.id},this.value)"
          onkeydown="if(event.key==='Enter'){event.preventDefault();addChild(${arrRef},${n.id})}" />
        <button class="tree-btn" onclick="addChild(${arrRef},${n.id})" title="إضافة مجلد فرعي">+ فرعي</button>
        <button class="tree-btn del" onclick="removeNode(${arrRef},${n.id})" title="حذف">✕</button>
      </div>
      ${n.children.length ? `<div class="tree-node-indent">${renderNodes(n.children, root, depth + 1)}</div>` : ''}
    </div>`;
  }).join('');
}

function escAttr(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function treeToText(nodes, prefix = '') {
  return nodes.map((n, i) => {
    const isLast = i === nodes.length - 1;
    const name = n.name || '(بدون اسم)';
    const childPrefix = prefix + (isLast ? '   ' : '│  ');
    return prefix + (isLast ? '└─' : '├─') + ' 📁 ' + name +
      (n.children.length ? '\n' + treeToText(n.children, childPrefix) : '');
  }).join('\n');
}

function updateTreePreview() {
  document.getElementById('tree-preview').textContent =
    treeData.length ? treeToText(treeData) : 'أضف مجلدات للمعاينة...';
  previewNames();
}

function updateBrowseTreePreview() {
  document.getElementById('browse-tree-preview').textContent =
    browseTree.length ? treeToText(browseTree) : 'أضف مجلدات...';
  checkBrowseBtn();
}

function clearTree() {
  treeData = [];
  saveTree();
  renderTree('tree-builder', treeData, updateTreePreview);
}
function clearBrowseTree() { browseTree = []; renderTree('browse-tree-builder', browseTree, updateBrowseTreePreview); }

// ═══════════════════════════════════════════
// CREATE FOLDERS (Tab 1)
// ═══════════════════════════════════════════
function getNames() {
  const raw = document.getElementById('names-ta').value.split('\n').map(n => n.trim()).filter(n => n);
  return [...new Set(raw)]; // deduplicate
}

function previewNames() {
  const raw = document.getElementById('names-ta').value.split('\n').map(n => n.trim()).filter(n => n);
  const unique = [...new Set(raw)];
  const hasDups = unique.length < raw.length;

  document.getElementById('names-count').textContent = raw.length ? `${raw.length} اسم` : '';
  document.getElementById('dup-warn').style.display = hasDups ? 'inline' : 'none';

  const root = document.getElementById('root-name').value || 'الأضاحي 2026';
  const el = document.getElementById('struct-prev');
  if (!unique.length) { el.textContent = 'أضف أسماء للمعاينة...'; return; }

  let t = `📁 ${root}/\n`;
  unique.slice(0, 3).forEach(n => {
    t += `  └─ 📁 ${n}/\n`;
    if (treeData.length) t += treeToText(treeData, '     ') + '\n';
  });
  if (unique.length > 3) t += `  └─ ... و ${unique.length - 3} آخرين`;
  el.textContent = t;
}

async function apiCreate(name, parentId) {
  const body = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) body.parents = [parentId];
  const r = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || 'خطأ في Drive API');
  return d.id;
}

async function createTreeUnder(nodes, parentId, logId) {
  for (const n of nodes) {
    if (!n.name.trim()) continue;
    const id = await apiCreate(n.name, parentId);
    addLog(logId, `     └─ ✅ ${n.name}`, 's');
    if (n.children.length) await createTreeUnder(n.children, id, logId);
  }
}

function countTreeNodes(nodes) { return nodes.reduce((s, n) => s + 1 + countTreeNodes(n.children), 0); }

async function createFolders() {
  const names = getNames();
  if (!names.length) { alert('أدخل أسماء أولاً'); return; }
  if (!token) { alert('يرجى الاتصال بـ Drive أولاً'); return; }

  const root = document.getElementById('root-name').value || 'الأضاحي 2026';
  const btn = document.getElementById('create-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> جاري الإنشاء...';
  document.getElementById('folders-log').innerHTML = '';
  document.getElementById('prog-wrap').style.display = 'block';
  document.getElementById('prog-bar').style.width = '0%';

  const treeCount = countTreeNodes(treeData);
  const total = 1 + names.length * (1 + treeCount);
  let done = 0;
  const tick = () => {
    done++;
    document.getElementById('prog-bar').style.width = Math.round(done / total * 100) + '%';
  };

  folderMap = {};
  try {
    addLog('folders-log', `إنشاء: ${root}`, 'i');
    const rootId = await apiCreate(root, null);
    tick();
    addLog('folders-log', `✅ ${root}`, 's');

    const sel = document.getElementById('folder-sel');
    sel.innerHTML = '<option value="">-- اختر مجلداً --</option>';

    for (const name of names) {
      addLog('folders-log', `📁 ${name}`, 'i');
      const fid = await apiCreate(name, rootId);
      folderMap[name] = fid;
      tick();
      addLog('folders-log', `  ✅ ${name}`, 's');
      const opt = document.createElement('option');
      opt.value = fid;
      opt.textContent = name;
      sel.appendChild(opt);
      if (treeData.length) await createTreeUnder(treeData, fid, 'folders-log');
    }

    addLog('folders-log', `🎉 اكتمل! ${names.length} مجلد` +
      (treeCount ? ` + هيكل فرعي (${treeCount} مجلد لكل شخص)` : ''), 's');
  } catch (e) {
    addLog('folders-log', `❌ ${e.message}`, 'e');
  }

  btn.disabled = false;
  btn.textContent = 'إنشاء المجلدات في Drive';
}

function resetAll() {
  document.getElementById('names-ta').value = '';
  document.getElementById('names-count').textContent = '';
  document.getElementById('dup-warn').style.display = 'none';
  document.getElementById('struct-prev').textContent = 'أضف أسماء للمعاينة...';
  document.getElementById('folders-log').innerHTML = '';
  document.getElementById('prog-bar').style.width = '0%';
  document.getElementById('prog-wrap').style.display = 'none';
}

// ═══════════════════════════════════════════
// BROWSE TAB
// ═══════════════════════════════════════════
let browseStack = [], selectedFolders = [];

async function listFolders(parentId) {
  const q = parentId
    ? `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    : `mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`;
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&orderBy=name&pageSize=100`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || 'خطأ');
  return d.files || [];
}

async function loadRoot() {
  if (!token) { alert('يرجى الاتصال بـ Drive أولاً'); return; }
  browseStack = [];
  await loadBrowser(null);
}

async function loadBrowser(folderId) {
  const browser = document.getElementById('folder-browser');
  browser.innerHTML = '<div class="empty-state"><span class="spin"></span> جاري التحميل...</div>';
  updateBC();
  try {
    const folders = await listFolders(folderId);
    if (!folders.length) { browser.innerHTML = '<div class="empty-state">لا توجد مجلدات هنا</div>'; return; }
    browser.innerHTML = `<div class="folder-grid">${folders.map(f => {
      const safeName = escAttr(f.name);
      const isSel = selectedFolders.some(s => s.id === f.id);
      return `
      <div class="folder-item ${isSel ? 'sel' : ''}" id="fi-${f.id}"
        onclick="toggleSel('${f.id}','${escJs(f.name)}','${escJs(browseStack.map(b => b.name).concat(f.name).join(' / '))}')">
        <span style="font-size:20px">📁</span>
        <div style="flex:1;min-width:0">
          <div class="fi-name">${safeName}</div>
          <div style="font-size:11px;color:var(--accent);margin-top:1px"
            onclick="event.stopPropagation();openF('${f.id}','${escJs(f.name)}')">↵ دخول</div>
        </div>
      </div>`;
    }).join('')}</div>`;
    document.getElementById('go-up-btn').disabled = browseStack.length === 0;
  } catch (e) {
    browser.innerHTML = `<div class="empty-state">❌ ${e.message}</div>`;
  }
}

function escJs(s) { return (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

function toggleSel(id, name, path) {
  const idx = selectedFolders.findIndex(f => f.id === id);
  if (idx >= 0) {
    selectedFolders.splice(idx, 1);
    document.getElementById('fi-' + id)?.classList.remove('sel');
  } else {
    selectedFolders.push({ id, name, path });
    document.getElementById('fi-' + id)?.classList.add('sel');
  }
  renderSelFolders();
}

function openF(id, name) { browseStack.push({ id, name }); loadBrowser(id); }

function goUp() {
  if (!browseStack.length) return;
  browseStack.pop();
  const p = browseStack[browseStack.length - 1];
  loadBrowser(p ? p.id : null);
}

function updateBC() {
  let h = `<span class="bc-item" onclick="browseStack=[];loadBrowser(null)">Drive</span>`;
  browseStack.forEach((b, i) => {
    h += `<span style="color:var(--text3)"> › </span>`;
    if (i < browseStack.length - 1)
      h += `<span class="bc-item" onclick="browseStack=browseStack.slice(0,${i + 1});loadBrowser('${b.id}')">${escAttr(b.name)}</span>`;
    else
      h += `<span class="bc-cur">${escAttr(b.name)}</span>`;
  });
  document.getElementById('breadcrumb').innerHTML = h;
}

function renderSelFolders() {
  const card = document.getElementById('sel-folders-card');
  document.getElementById('sel-count').textContent = selectedFolders.length;
  card.style.display = selectedFolders.length ? 'block' : 'none';
  document.getElementById('sel-folders-list').innerHTML = selectedFolders.map((f, i) => `
    <div class="sel-folder-item">
      <span style="font-size:18px">📁</span>
      <div style="flex:1;min-width:0">
        <div class="sfi-name">${escAttr(f.name)}</div>
        <div class="sfi-path">${escAttr(f.path)}</div>
      </div>
      <button class="btn btn-sm" onclick="removeSel(${i})" style="padding:3px 8px">✕</button>
    </div>`).join('');
  checkBrowseBtn();
}

function removeSel(i) {
  const f = selectedFolders[i];
  selectedFolders.splice(i, 1);
  renderSelFolders();
  document.getElementById('fi-' + f.id)?.classList.remove('sel');
}

function clearSel() {
  selectedFolders = [];
  renderSelFolders();
  document.querySelectorAll('.folder-item.sel').forEach(e => e.classList.remove('sel'));
}

function checkBrowseBtn() {
  document.getElementById('add-to-sel-btn').disabled =
    selectedFolders.length === 0 || browseTree.length === 0;
}

async function addTreeToSelected() {
  if (!selectedFolders.length || !browseTree.length) return;
  if (!token) { alert('يرجى الاتصال بـ Drive أولاً'); return; }

  const btn = document.getElementById('add-to-sel-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> جاري الإضافة...';
  document.getElementById('browse-log').innerHTML = '';

  const tc = countTreeNodes(browseTree);
  const total = selectedFolders.length * tc;
  let done = 0;
  document.getElementById('browse-prog-wrap').style.display = 'block';
  document.getElementById('browse-prog-bar').style.width = '0%';
  const tick2 = () => {
    done++;
    document.getElementById('browse-prog-bar').style.width = Math.round(done / total * 100) + '%';
  };

  async function createBrowseTree(nodes, parentId) {
    for (const n of nodes) {
      if (!n.name.trim()) continue;
      const id = await apiCreate(n.name, parentId);
      tick2();
      addLog('browse-log', `  └─ ✅ ${n.name}`, 's');
      if (n.children.length) await createBrowseTree(n.children, id);
    }
  }

  try {
    for (const f of selectedFolders) {
      addLog('browse-log', `📁 داخل: ${f.name}`, 'i');
      await createBrowseTree(browseTree, f.id);
    }
    addLog('browse-log', `🎉 اكتمل!`, 's');
  } catch (e) {
    addLog('browse-log', `❌ ${e.message}`, 'e');
  }

  btn.disabled = false;
  btn.textContent = '🚀 إضافة للمجلدات المحددة';
}

// ═══════════════════════════════════════════
// PDF EXTRACT (via Backend)
// ═══════════════════════════════════════════
function dov(e) { e.preventDefault(); e.currentTarget.classList.add('over'); }
function dlv(id) { document.getElementById(id).classList.remove('over'); }
function dropExtract(e) { e.preventDefault(); dlv('uz-extract'); doExtract(e.dataTransfer.files[0]); }
function dropMerge(e) { e.preventDefault(); dlv('uz-merge'); addMergeFiles(e.dataTransfer.files); }

async function doExtract(file) {
  if (!file || file.type !== 'application/pdf') return;
  if (file.size > 20 * 1024 * 1024) { alert('حجم الملف يتجاوز 20MB'); return; }

  document.getElementById('extract-file-info').textContent = `📄 ${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
  document.getElementById('extract-result-card').style.display = 'block';
  document.getElementById('extract-badge').innerHTML = '<span class="badge badge-info"><span class="spin"></span> جاري الاستخراج...</span>';
  addLog('extract-log', `معالجة: ${file.name}`, 'i');

  try {
    const form = new FormData();
    form.append('pdf', file);

    const res = await fetch(`${API_BASE}/extract`, { method: 'POST', body: form });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `خطأ ${res.status}`);
    }
    const data = await res.json();
    extractedNames = data.names || [];

    document.getElementById('extract-badge').innerHTML =
      `<span class="badge badge-success">✅ ${extractedNames.length} اسم مستخرج</span>`;
    document.getElementById('extracted-table').innerHTML = `
      <table class="data-table">
        <thead><tr><th>#</th><th>الاسم</th></tr></thead>
        <tbody>${extractedNames.map((n, i) => `<tr><td>${i + 1}</td><td>${escAttr(n)}</td></tr>`).join('')}</tbody>
      </table>`;
    addLog('extract-log', `✅ استُخرج ${extractedNames.length} اسم`, 's');
  } catch (e) {
    document.getElementById('extract-badge').innerHTML =
      `<span class="badge badge-warning">❌ ${escAttr(e.message)}</span>`;
    addLog('extract-log', `❌ ${e.message}`, 'e');
  }
}

async function exportAndUpload() {
  if (!extractedNames.length) return;
  const blob = buildXlsx();
  const fid = document.getElementById('folder-sel').value;
  if (fid && token) {
    addLog('extract-log', 'رفع Excel إلى Drive...', 'i');
    try {
      const meta = JSON.stringify({ name: 'أسماء_الأضاحي.xlsx', parents: [fid] });
      const fd = new FormData();
      fd.append('metadata', new Blob([meta], { type: 'application/json' }));
      fd.append('file', blob);
      const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd
      });
      if (r.ok) addLog('extract-log', '✅ تم رفع Excel', 's');
      else addLog('extract-log', '❌ فشل الرفع', 'e');
    } catch (e) { addLog('extract-log', '❌ ' + e.message, 'e'); }
  }
  dl(blob, 'أسماء_الأضاحي.xlsx');
}

function downloadXlsx() { if (!extractedNames.length) return; dl(buildXlsx(), 'أسماء_الأضاحي.xlsx'); }

function buildXlsx() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([['#', 'الاسم'], ...extractedNames.map((n, i) => [i + 1, n])]);
  XLSX.utils.book_append_sheet(wb, ws, 'أسماء');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ═══════════════════════════════════════════
// PDF MERGE
// ═══════════════════════════════════════════
function addMergeFiles(files) {
  Array.from(files).filter(f => f.type === 'application/pdf').forEach(f => mergeFiles.push(f));
  renderMergeList();
}

function renderMergeList() {
  document.getElementById('merge-list-card').style.display = mergeFiles.length ? 'block' : 'none';
  document.getElementById('merge-count').textContent = mergeFiles.length;
  document.getElementById('merge-list').innerHTML = mergeFiles.map((f, i) => `
    <div class="merge-file">
      <span style="font-size:18px">📄</span>
      <span class="merge-file-name">${escAttr(f.name)}</span>
      <span class="merge-file-size">${(f.size / 1024).toFixed(0)} KB</span>
      <button class="merge-file-rm" onclick="mergeFiles.splice(${i},1);renderMergeList()">×</button>
    </div>`).join('');
}

function clearMerge() { mergeFiles = []; renderMergeList(); }

async function mergePDFs() {
  if (!mergeFiles.length) return;
  const btn = document.getElementById('merge-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> جاري الدمج...';
  addLog('merge-log', `دمج ${mergeFiles.length} ملف...`, 'i');
  try {
    const merged = await PDFLib.PDFDocument.create();
    for (const f of mergeFiles) {
      addLog('merge-log', `دمج: ${f.name}`, 'i');
      const buf = await f.arrayBuffer();
      const doc = await PDFLib.PDFDocument.load(buf);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    }
    const bytes = await merged.save();
    const outName = document.getElementById('merge-out-name').value || 'مدمج.pdf';
    dl(new Blob([bytes], { type: 'application/pdf' }), outName);
    addLog('merge-log', `✅ تم: ${outName}`, 's');
  } catch (e) {
    addLog('merge-log', `❌ ${e.message}`, 'e');
  }
  btn.disabled = false;
  btn.textContent = '⬇ دمج وتنزيل على الجهاز';
}

// ═══════════════════════════════════════════
// VIDEO LINKS → GOOGLE SHEET (Tab 5)
// ═══════════════════════════════════════════
let vlStack = [], vlSelectedFolder = null, vlVideos = [], vlRangeMode = 'all';

function vlSetRangeMode(mode) {
  vlRangeMode = mode;
  document.getElementById('vl-rt-all').classList.toggle('active', mode === 'all');
  document.getElementById('vl-rt-range').classList.toggle('active', mode === 'range');
  document.getElementById('vl-range-inputs').style.display = mode === 'range' ? 'block' : 'none';
}

function vlUpdateRangeHint() {
  const from = document.getElementById('vl-range-from')?.value || 1;
  const to   = document.getElementById('vl-range-to')?.value || 100;
  const hf = document.getElementById('vl-rh-from');
  const ht = document.getElementById('vl-rh-to');
  if (hf) hf.textContent = from;
  if (ht) ht.textContent = to;
}

// Live hint update
setTimeout(() => {
  document.getElementById('vl-range-from')?.addEventListener('input', vlUpdateRangeHint);
  document.getElementById('vl-range-to')?.addEventListener('input', vlUpdateRangeHint);
}, 500);

async function vlLoadRoot() {
  if (!token) { alert('يرجى الاتصال بـ Drive أولاً'); return; }
  vlStack = [];
  vlSelectedFolder = null;
  document.getElementById('vl-selected-folder').style.display = 'none';
  document.getElementById('vl-fetch-btn').disabled = true;
  await vlLoadBrowser(null);
}

async function vlLoadBrowser(folderId) {
  const browser = document.getElementById('vl-folder-browser');
  browser.innerHTML = '<div class="empty-state"><span class="spin"></span> جاري التحميل...</div>';
  vlUpdateBC();
  try {
    const q = folderId
      ? `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
      : `mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`;
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&orderBy=name&pageSize=200`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || 'خطأ');
    const folders = d.files || [];
    const curName = vlStack.length ? vlStack[vlStack.length - 1].name : 'Drive';
    let html = '';
    if (folderId) {
      html += `<div class="vl-sel-btn-wrap">
        <button class="btn btn-primary" style="width:100%;margin-bottom:10px"
          onclick="vlSelectFolder('${folderId}','${escJs(curName)}')">
          ✅ اختيار هذا المجلد: "${escAttr(curName)}"
        </button>
      </div>`;
    }
    if (!folders.length) {
      html += '<div class="empty-state" style="margin-top:0">لا توجد مجلدات فرعية هنا</div>';
    } else {
      html += `<div class="folder-grid">${folders.map(f => `
        <div class="folder-item" onclick="vlOpenF('${f.id}','${escJs(f.name)}')">
          <span style="font-size:20px">📁</span>
          <div style="flex:1;min-width:0">
            <div class="fi-name">${escAttr(f.name)}</div>
            <div style="font-size:11px;color:var(--accent);margin-top:1px">↵ دخول</div>
          </div>
        </div>`).join('')}</div>`;
    }
    browser.innerHTML = html;
    document.getElementById('vl-up-btn').disabled = vlStack.length === 0;
  } catch (e) {
    browser.innerHTML = `<div class="empty-state">❌ ${e.message}</div>`;
  }
}

function vlSelectFolder(id, name) {
  vlSelectedFolder = { id, name };
  document.getElementById('vl-selected-folder').style.display = 'block';
  document.getElementById('vl-sel-name').textContent = name;
  document.getElementById('vl-fetch-btn').disabled = false;
  addLog('vl-log', `✅ تم اختيار المجلد: ${name}`, 's');
  vlVideos = [];
  document.getElementById('vl-preview').style.display = 'none';
  document.getElementById('vl-write-card').style.display = 'none';
}

function vlOpenF(id, name) { vlStack.push({ id, name }); vlLoadBrowser(id); }

function vlGoUp() {
  if (!vlStack.length) return;
  vlStack.pop();
  const p = vlStack[vlStack.length - 1];
  vlLoadBrowser(p ? p.id : null);
}

function vlUpdateBC() {
  let h = `<span class="bc-item" onclick="vlStack=[];vlLoadBrowser(null)">Drive</span>`;
  vlStack.forEach((b, i) => {
    h += `<span style="color:var(--text3)"> › </span>`;
    if (i < vlStack.length - 1)
      h += `<span class="bc-item" onclick="vlStack=vlStack.slice(0,${i+1});vlLoadBrowser('${b.id}')">${escAttr(b.name)}</span>`;
    else
      h += `<span class="bc-cur">${escAttr(b.name)}</span>`;
  });
  document.getElementById('vl-breadcrumb').innerHTML = h;
}

const VIDEO_MIMES = [
  'video/mp4','video/x-msvideo','video/quicktime','video/x-matroska',
  'video/webm','video/x-ms-wmv','video/mpeg','video/3gpp',
  'application/vnd.google-apps.video'
];

async function vlListVideosInFolder(folderId) {
  let allFiles = [], pageToken = null;
  const mimeQ = VIDEO_MIMES.map(m => `mimeType='${m}'`).join(' or ');
  const baseQ = `'${folderId}' in parents and (${mimeQ}) and trashed=false`;
  do {
    let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(baseQ)}&fields=nextPageToken,files(id,name,mimeType,webViewLink,webContentLink)&orderBy=name&pageSize=300`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || 'خطأ في Drive API');
    allFiles = allFiles.concat(d.files || []);
    pageToken = d.nextPageToken || null;
  } while (pageToken);
  return allFiles;
}

async function vlFetchVideos() {
  if (!vlSelectedFolder) { alert('اختر مجلداً أولاً'); return; }
  if (!token) { alert('يرجى الاتصال بـ Drive أولاً'); return; }
  const btn = document.getElementById('vl-fetch-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> جاري السحب...';
  document.getElementById('vl-preview').style.display = 'none';
  document.getElementById('vl-write-card').style.display = 'none';
  addLog('vl-log', `🔍 سحب الفيديوهات من: ${vlSelectedFolder.name}`, 'i');
  try {
    let files = await vlListVideosInFolder(vlSelectedFolder.id);
    if (document.getElementById('vl-include-subfolders').checked) {
      const subsR = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${vlSelectedFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id,name)&pageSize=200`,
        { headers: { Authorization: 'Bearer ' + token } }
      );
      const subsD = await subsR.json();
      for (const sub of (subsD.files || [])) {
        addLog('vl-log', `  📁 فحص: ${sub.name}`, 'i');
        const subFiles = await vlListVideosInFolder(sub.id);
        files = files.concat(subFiles);
      }
    }
    if (!files.length) {
      addLog('vl-log', '⚠️ لم يتم العثور على فيديوهات في هذا المجلد', 'e');
      btn.disabled = false; btn.textContent = '🔍 سحب قائمة الفيديوهات'; return;
    }
    // Always sort with natural numeric order (matches Drive's display order: 1,2,3...10,11 not 1,10,11,2)
    files.sort((a, b) => a.name.localeCompare(b.name, 'ar', { numeric: true, sensitivity: 'base' }));
    addLog('vl-log', `✅ تم العثور على ${files.length} فيديو إجمالاً`, 's');

    // Apply range filter
    let filtered = files;
    if (vlRangeMode === 'range') {
      const fromIdx = Math.max(1, parseInt(document.getElementById('vl-range-from').value) || 1);
      const toIdx   = Math.max(fromIdx, parseInt(document.getElementById('vl-range-to').value) || fromIdx);
      filtered = files.slice(fromIdx - 1, toIdx); // convert to 0-based
      addLog('vl-log', `🎯 النطاق المختار: ${fromIdx} → ${toIdx} (${filtered.length} فيديو)`, 'i');
    }
    vlVideos = filtered;

    const linkType = document.getElementById('vl-link-type').value;
    function getLink(f) {
      if (linkType === 'webContentLink') return f.webContentLink || `https://drive.google.com/uc?export=download&id=${f.id}`;
      if (linkType === 'id_embed') return `https://drive.google.com/file/d/${f.id}/preview`;
      return f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`;
    }

    const col = (document.getElementById('vl-col').value || 'C').toUpperCase();
    const startRow = parseInt(document.getElementById('vl-start-row').value) || 2;
    const inclName = document.getElementById('vl-include-name').checked;
    const sheetName = document.getElementById('vl-sheet-name').value || 'Sheet1';
    const maxP = Math.min(files.length, 10);
    let tbl = `<table class="data-table"><thead><tr><th>#</th><th>اسم الفيديو</th><th>الرابط</th><th>الخلية</th></tr></thead><tbody>`;
    for (let i = 0; i < maxP; i++) {
      const f = files[i];
      tbl += `<tr><td>${i+1}</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escAttr(f.name)}</td>
        <td><a href="${escAttr(getLink(f))}" target="_blank" style="font-size:11px;color:var(--accent)">🔗 رابط</a></td>
        <td style="font-family:var(--mono);font-size:12px;color:var(--text3)">${sheetName}!${col}${startRow+i}</td></tr>`;
    }
    if (files.length > maxP) tbl += `<tr><td colspan="4" style="text-align:center;color:var(--text3);font-size:12px">... و ${files.length-maxP} فيديو آخر</td></tr>`;
    tbl += '</tbody></table>';
    document.getElementById('vl-preview-badge').innerHTML = `<span class="badge badge-success">✅ ${files.length} فيديو</span>`;
    document.getElementById('vl-preview-table').innerHTML = tbl;
    document.getElementById('vl-preview').style.display = 'block';

    const endCol = inclName ? String.fromCharCode(col.charCodeAt(0)+1) : col;
    const endRow = startRow + files.length - 1;
    document.getElementById('vl-write-summary').innerHTML =
      `سيتم كتابة <strong>${files.length} رابط</strong> في <strong>${col}${startRow}:${col}${endRow}</strong>` +
      (inclName ? ` + أسماء في <strong>${endCol}${startRow}:${endCol}${endRow}</strong>` : '') +
      ` ← ورقة <strong>"${escAttr(sheetName)}"</strong>`;
    document.getElementById('vl-write-card').style.display = 'block';
  } catch (e) {
    addLog('vl-log', `❌ ${e.message}`, 'e');
  }
  btn.disabled = false; btn.textContent = '🔍 سحب قائمة الفيديوهات';
}

async function vlWriteToSheet() {
  if (!vlVideos.length) return;
  const sheetId = document.getElementById('vl-sheet-id').value.trim();
  if (!sheetId) { alert('أدخل معرّف الشيت (Sheet ID)'); return; }
  const sheetName = document.getElementById('vl-sheet-name').value || 'Sheet1';
  const col    = (document.getElementById('vl-col').value    || 'C').toUpperCase();
  const numCol = (document.getElementById('vl-num-col').value || 'A').toUpperCase();
  const startRow = parseInt(document.getElementById('vl-start-row').value) || 2;
  const endRow   = parseInt(document.getElementById('vl-end-row').value)   || 301;
  const inclName = document.getElementById('vl-include-name').checked;
  const linkType = document.getElementById('vl-link-type').value;
  function getLink(f) {
    if (linkType === 'webContentLink') return f.webContentLink || `https://drive.google.com/uc?export=download&id=${f.id}`;
    if (linkType === 'id_embed') return `https://drive.google.com/file/d/${f.id}/preview`;
    return f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`;
  }
  const btn = document.getElementById('vl-write-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> جاري الكتابة...';
  document.getElementById('vl-prog-wrap').style.display = 'block';
  document.getElementById('vl-prog-bar').style.width = '0%';
  addLog('vl-log', `📝 بدء الكتابة في الشيت...`, 'i');
  try {
    const colIdx    = col.charCodeAt(0) - 65;
    const numColIdx = numCol.charCodeAt(0) - 65;
    const colCount  = inclName ? 2 : 1;

    // Step 1: get sheet metadata (numeric sheetId)
    addLog('vl-log', `🔍 [1/3] جلب بيانات الشيت — ID: ${sheetId.slice(0,12)}...`, 'i');
    const metaR = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}?fields=sheets.properties`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    const metaD = await metaR.json();
    if (!metaR.ok) throw new Error(`[خطأ ${metaR.status} - الخطوة 1] ${metaD.error?.message || 'فشل جلب بيانات الشيت'}`);
    const sheetProps = metaD.sheets?.find(s => s.properties.title === sheetName);
    if (!sheetProps) {
      const available = metaD.sheets?.map(s => `"${s.properties.title}"`).join(', ') || '—';
      throw new Error(`[الخطوة 1] لم يتم العثور على ورقة باسم "${sheetName}". الأوراق المتاحة: ${available}`);
    }
    const numericSheetId = sheetProps.properties.sheetId;
    addLog('vl-log', `✅ الورقة: "${sheetName}" (sheetId: ${numericSheetId})`, 's');

    // Step 2: read number column via batchGet — range in query param (no path-encoding issues)
    const safeSheetForRange = sheetName.replace(/'/g, "''");
    const readRange = `'${safeSheetForRange}'!${numCol}${startRow}:${numCol}${endRow}`;
    addLog('vl-log', `🔢 [2/3] قراءة عمود الأرقام — النطاق: ${numCol}${startRow}:${numCol}${endRow}`, 'i');
    const batchGetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values:batchGet?ranges=${encodeURIComponent(readRange)}&majorDimension=ROWS`;
    const numRangeR = await fetch(batchGetUrl, { headers: { Authorization: 'Bearer ' + token } });
    const numRangeD = await numRangeR.json();
    if (!numRangeR.ok) throw new Error(`[خطأ ${numRangeR.status} - الخطوة 2] ${numRangeD.error?.message || 'فشل قراءة عمود الأرقام'}`);
    const numRows = numRangeD.valueRanges?.[0]?.values || [];

    // Build map: sequenceNumber → 0-based row index in sheet
    const numToRow = {};
    numRows.forEach((row, i) => {
      const raw = (row[0] ?? '').toString().trim();
      const val = parseInt(raw);
      if (!isNaN(val)) numToRow[val] = (startRow - 1) + i;
    });

    const mappedCount = Object.keys(numToRow).length;
    if (mappedCount === 0) {
      // Show first few raw values to help diagnose
      const sample = numRows.slice(0, 5).map(r => `"${r[0] ?? ''}"`).join(', ');
      throw new Error(`العمود ${numCol} لا يحتوي على أرقام قابلة للقراءة. أول قيم: [${sample || 'فارغ'}]`);
    }
    addLog('vl-log', `✅ تم قراءة ${mappedCount} رقم — من ${Math.min(...Object.keys(numToRow).map(Number))} إلى ${Math.max(...Object.keys(numToRow).map(Number))}`, 's');

    // Step 3: build per-row write requests matched by video position → sheet number
    const requests = [];
    let matched = 0, skipped = 0;

    const rangeFrom = vlRangeMode === 'range'
      ? (parseInt(document.getElementById('vl-range-from').value) || 1)
      : 1;

    vlVideos.forEach((f, i) => {
      // seqNum = position in full sorted Drive list (1-based)
      const seqNum = rangeFrom + i;
      const rowIdx = numToRow[seqNum];
      if (rowIdx === undefined) { skipped++; return; }

      const link = getLink(f);
      const cellValues = inclName
        ? [{ userEnteredValue: { formulaValue: `=HYPERLINK("${link}","▶ فيديو")` } },
           { userEnteredValue: { stringValue: f.name } }]
        : [{ userEnteredValue: { formulaValue: `=HYPERLINK("${link}","▶ فيديو")` } }];

      requests.push({
        updateCells: {
          range: {
            sheetId: numericSheetId,
            startRowIndex: rowIdx,
            endRowIndex: rowIdx + 1,
            startColumnIndex: colIdx,
            endColumnIndex: colIdx + colCount
          },
          rows: [{ values: cellValues }],
          fields: 'userEnteredValue'
        }
      });
      matched++;
    });

    if (!requests.length) throw new Error(`لم يتم مطابقة أي فيديو — تحقق من عمود الأرقام (${numCol}) وصفوف البداية/النهاية`);
    addLog('vl-log', `🎯 تم مطابقة ${matched} فيديو${skipped ? ` (${skipped} لم يُطابَق)` : ''}`, 'i');

    // Step 4: send all requests in chunks of 100
    const CHUNK = 100;
    let written = 0;
    for (let i = 0; i < requests.length; i += CHUNK) {
      const batch = requests.slice(i, i + CHUNK);
      const r = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}:batchUpdate`,
        { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: batch }) }
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || `خطأ ${r.status} في Sheets API`);
      written += batch.length;
      document.getElementById('vl-prog-bar').style.width = Math.round(written / requests.length * 100) + '%';
      addLog('vl-log', `  ✅ كُتب ${written}/${requests.length}`, 's');
    }
    addLog('vl-log', `🎉 اكتمل! تم كتابة ${vlVideos.length} رابط`, 's');
    addLog('vl-log', `🔗 https://docs.google.com/spreadsheets/d/${sheetId}/edit`, 'i');
  } catch (e) {
    addLog('vl-log', `❌ ${e.message}`, 'e');
    if (e.message.includes('403'))
      addLog('vl-log', '⚠️ أضف scope: https://www.googleapis.com/auth/spreadsheets للتوكن', 'e');
    if (e.message.includes('not supported') || e.message.includes('Office file') || e.message.includes('must not be'))
      addLog('vl-log', '⚠️ الملف ليس Google Sheet أصلي — افتح الملف في Drive ← اضغط "فتح بـ Google Sheets" ← انسخ الـ ID الجديد', 'e');
  }
  btn.disabled = false; btn.textContent = '✍️ كتابة الروابط في الشيت الآن';
}

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════
function dl(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
