import { FolderBrowser } from '../components/FolderBrowser.js';
import { LogViewer }     from '../components/LogViewer.js';
import { DriveService }  from '../../domains/drive/DriveService.js';

// ─── state ───────────────────────────────────────────────────────────────────
let selectedFolders = [];
let browseTree      = [];
let _nodeId         = 1;

const log = new LogViewer('browse-log');

const browser = new FolderBrowser({
  containerId:   'folder-browser',
  breadcrumbId:  'breadcrumb',
  upBtnId:       'go-up-btn',
  onSelect: (folder) => {
    toggleSel(folder.id, folder.name, folder.path);
  },
});

// ─── helpers ─────────────────────────────────────────────────────────────────
function escAttr(s) {
  return (s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function makeNode(name = '') {
  return { id: _nodeId++, name, children: [] };
}

// ─── selected folders ─────────────────────────────────────────────────────────
function renderSelFolders() {
  const el = document.getElementById('sel-folders-list');
  if (!el) return;
  if (!selectedFolders.length) {
    el.innerHTML = '<div class="empty-state">لم يتم اختيار أي مجلد</div>';
    checkBrowseBtn();
    return;
  }
  el.innerHTML = selectedFolders.map((f, i) => `
    <div class="sel-folder-item">
      <span class="sel-folder-name">📁 ${escAttr(f.name)}</span>
      <span class="sel-folder-path" style="font-size:11px;color:var(--text3)">${escAttr(f.path || '')}</span>
      <button class="btn-icon danger" onclick="window.removeSel(${i})" title="إزالة">✖</button>
    </div>
  `).join('');
  checkBrowseBtn();
}

function toggleSel(id, name, path = '') {
  const idx = selectedFolders.findIndex(f => f.id === id);
  if (idx !== -1) {
    selectedFolders.splice(idx, 1);
    log.info(`تم إلغاء اختيار: ${name}`);
  } else {
    selectedFolders.push({ id, name, path });
    log.success(`تم اختيار: ${name}`);
  }
  renderSelFolders();
}

function removeSel(index) {
  const removed = selectedFolders.splice(index, 1)[0];
  log.info(`تمت إزالة: ${removed?.name}`);
  renderSelFolders();
}

function clearSel() {
  selectedFolders = [];
  renderSelFolders();
  log.info('تم مسح قائمة الاختيار');
}

// ─── browse tree (subfolder structure) ────────────────────────────────────────
function findNode(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return null;
}

function removeNodeFromList(nodes, id) {
  const idx = nodes.findIndex(n => n.id === id);
  if (idx !== -1) { nodes.splice(idx, 1); return true; }
  for (const n of nodes) {
    if (removeNodeFromList(n.children, id)) return true;
  }
  return false;
}

function renderBrowseTreeNodes(nodes, depth = 0) {
  return nodes.map(n => `
    <div class="tree-node" style="margin-right:${depth * 20}px">
      <span class="tree-icon">📁</span>
      <input type="text" value="${escAttr(n.name)}" class="tree-name-input"
        onchange="window.__browseTreeUpdateName(${n.id}, this.value)" />
      <button class="btn-icon" onclick="window.__browseTreeAddChild(${n.id})">➕</button>
      <button class="btn-icon danger" onclick="window.__browseTreeRemove(${n.id})">🗑️</button>
    </div>
    ${renderBrowseTreeNodes(n.children, depth + 1)}
  `).join('');
}

function renderBrowseTree() {
  const el = document.getElementById('browse-tree-container');
  if (!el) return;
  el.innerHTML = browseTree.length
    ? renderBrowseTreeNodes(browseTree)
    : '<div class="empty-state">لا توجد مجلدات فرعية</div>';
  checkBrowseBtn();
}

function addNode() {
  browseTree.push(makeNode('مجلد جديد'));
  renderBrowseTree();
}

function clearBrowseTree() {
  browseTree = [];
  renderBrowseTree();
}

window.__browseTreeAddChild = (parentId) => {
  const parent = findNode(browseTree, parentId);
  if (parent) parent.children.push(makeNode('مجلد فرعي'));
  renderBrowseTree();
};

window.__browseTreeRemove = (id) => {
  removeNodeFromList(browseTree, id);
  renderBrowseTree();
};

window.__browseTreeUpdateName = (id, name) => {
  const node = findNode(browseTree, id);
  if (node) node.name = name;
};

// ─── add tree to selected folders ─────────────────────────────────────────────
function countNodes(nodes) {
  return nodes.reduce((s, n) => s + 1 + countNodes(n.children), 0);
}

async function createTreeUnder(nodes, parentId) {
  for (const node of nodes) {
    const id = await DriveService.createFolder(node.name, parentId);
    log.info(`✅ ${node.name}`);
    if (node.children.length) await createTreeUnder(node.children, id);
  }
}

async function addTreeToSelected() {
  if (!selectedFolders.length) { log.error('اختر مجلداً على الأقل'); return; }
  if (!browseTree.length)       { log.error('أضف هيكل المجلدات الفرعية أولاً'); return; }

  const btn = document.getElementById('add-tree-btn');
  if (btn) btn.disabled = true;
  log.clear();
  log.info('جاري الإنشاء...');

  try {
    for (const folder of selectedFolders) {
      log.info(`📁 معالجة: ${folder.name}`);
      await createTreeUnder(browseTree, folder.id);
    }
    log.success('✅ اكتملت العملية بنجاح');
  } catch (e) {
    log.error('خطأ: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ─── check button state ───────────────────────────────────────────────────────
function checkBrowseBtn() {
  const btn = document.getElementById('add-tree-btn');
  if (btn) btn.disabled = !selectedFolders.length || !browseTree.length;
}

// ─── browser wrappers ─────────────────────────────────────────────────────────
async function loadRoot() { await browser.loadRoot(); }
async function goUp()     { await browser.goUp(); }

// ─── expose to window ─────────────────────────────────────────────────────────
window.loadRoot          = loadRoot;
window.goUp              = goUp;
window.toggleSel         = toggleSel;
window.removeSel         = removeSel;
window.clearSel          = clearSel;
window.addNode           = addNode;
window.clearBrowseTree   = clearBrowseTree;
window.addTreeToSelected = addTreeToSelected;
window.checkBrowseBtn    = checkBrowseBtn;

// ─── init ─────────────────────────────────────────────────────────────────────
renderSelFolders();
renderBrowseTree();
