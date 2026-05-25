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
  ['folders', 'browse', 'pdf-extract', 'pdf-merge'].forEach((t, i) => {
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
// Helpers
// ═══════════════════════════════════════════
function dl(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
