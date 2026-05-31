import { FolderBrowser } from '../components/FolderBrowser.js';
import { LogViewer }     from '../components/LogViewer.js';
import { DriveService }  from '../../domains/drive/DriveService.js';
import { Storage }       from '../../shared/Storage.js';

// ─── state ───────────────────────────────────────────────────────────────────
let treeData  = Storage.get('tree_data', []);
let browseTree = [];
let _nodeId   = 1;

const log = new LogViewer('folders-log');

// ─── helpers ─────────────────────────────────────────────────────────────────
function escAttr(s) {
  return (s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function makeNode(name = '') {
  return { id: _nodeId++, name, children: [] };
}

// ─── tree serialisation ───────────────────────────────────────────────────────
function treeToText(nodes, depth = 0) {
  return nodes.map(n => '  '.repeat(depth) + n.name + '\n' + treeToText(n.children, depth + 1)).join('');
}

// ─── rendering ───────────────────────────────────────────────────────────────
function renderNodes(nodes, depth = 0) {
  if (!nodes.length) return '';
  const items = nodes.map(n => `
    <div class="tree-node" style="margin-right:${depth * 20}px">
      <span class="tree-icon">📁</span>
      <input type="text" value="${escAttr(n.name)}" class="tree-name-input"
        onchange="window.updateName(${n.id}, this.value)" />
      <button class="btn-icon" onclick="window.addChild(${n.id})" title="إضافة مجلد فرعي">➕</button>
      <button class="btn-icon danger" onclick="window.removeNode(${n.id})" title="حذف">🗑️</button>
    </div>
    ${renderNodes(n.children, depth + 1)}
  `).join('');
  return items;
}

function renderTree() {
  const container = document.getElementById('tree-container');
  if (!container) return;
  if (!treeData.length) {
    container.innerHTML = '<div class="empty-state">لا توجد مجلدات. أضف مجلداً للبدء.</div>';
    return;
  }
  container.innerHTML = renderNodes(treeData);
  Storage.set('tree_data', treeData);
}

function updateTreePreview() {
  const el = document.getElementById('tree-preview');
  if (el) el.textContent = treeToText(treeData) || '(فارغ)';
}

// ─── find / mutate helpers ────────────────────────────────────────────────────
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

// ─── public mutations ─────────────────────────────────────────────────────────
function addNode() {
  treeData.push(makeNode('مجلد جديد'));
  renderTree();
  updateTreePreview();
}

function removeNode(id) {
  removeNodeFromList(treeData, id);
  renderTree();
  updateTreePreview();
}

function addChild(parentId) {
  const parent = findNode(treeData, parentId);
  if (parent) parent.children.push(makeNode('مجلد فرعي'));
  renderTree();
  updateTreePreview();
}

function updateName(id, name) {
  const node = findNode(treeData, id);
  if (node) node.name = name;
  Storage.set('tree_data', treeData);
  updateTreePreview();
}

function clearTree() {
  if (!confirm('هل تريد حذف كل المجلدات؟')) return;
  treeData = [];
  renderTree();
  updateTreePreview();
}

function previewNames() {
  updateTreePreview();
  const el = document.getElementById('tree-preview-wrap');
  if (el) el.style.display = 'block';
}

function resetAll() {
  if (!confirm('إعادة تعيين كامل؟')) return;
  treeData = [];
  Storage.remove('tree_data');
  renderTree();
  updateTreePreview();
  log.clear();
}

// ─── folder creation ──────────────────────────────────────────────────────────
async function createTreeUnder(nodes, parentId, total, counter) {
  for (const node of nodes) {
    const id = await DriveService.createFolder(node.name, parentId);
    counter.done++;
    const pct = Math.round((counter.done / total) * 100);
    setProgress(pct);
    log.info(`✅ تم إنشاء: ${node.name}`);
    if (node.children.length) {
      await createTreeUnder(node.children, id, total, counter);
    }
  }
}

function countNodes(nodes) {
  return nodes.reduce((s, n) => s + 1 + countNodes(n.children), 0);
}

function setProgress(pct) {
  const bar  = document.getElementById('prog-bar');
  const wrap = document.getElementById('prog-wrap');
  if (wrap) wrap.style.display = 'block';
  if (bar)  bar.style.width    = pct + '%';
}

async function createFolders() {
  const namesRaw = document.getElementById('root-names-input')?.value ?? '';
  const rootNames = namesRaw.split('\n').map(s => s.trim()).filter(Boolean);

  if (!rootNames.length) { log.error('أدخل أسماء المجلدات الجذرية'); return; }
  if (!treeData.length && rootNames.length === 0) { log.error('الشجرة فارغة'); return; }

  const parentUrl = document.getElementById('parent-folder-url')?.value?.trim() ?? '';
  let parentId = null;
  if (parentUrl) {
    parentId = DriveService.extractFolderIdFromUrl(parentUrl);
    if (!parentId) { log.error('رابط المجلد غير صحيح'); return; }
  }

  const totalNodes = rootNames.length * (1 + countNodes(treeData));
  const counter    = { done: 0 };
  setProgress(0);
  log.clear();
  log.info(`بدء إنشاء ${totalNodes} مجلداً...`);

  try {
    for (const rootName of rootNames) {
      const rootId = await DriveService.createFolder(rootName, parentId);
      counter.done++;
      setProgress(Math.round((counter.done / totalNodes) * 100));
      log.info(`📁 مجلد جذري: ${rootName}`);
      if (treeData.length) {
        await createTreeUnder(treeData, rootId, totalNodes, counter);
      }
    }
    log.success('✅ اكتملت العملية بنجاح');
    setProgress(100);
  } catch (e) {
    log.error('خطأ: ' + e.message);
  }
}

// ─── expose to window ─────────────────────────────────────────────────────────
window.addNode          = addNode;
window.removeNode       = removeNode;
window.addChild         = addChild;
window.updateName       = updateName;
window.clearTree        = clearTree;
window.updateTreePreview = updateTreePreview;
window.previewNames     = previewNames;
window.createFolders    = createFolders;
window.resetAll         = resetAll;

// ─── init ─────────────────────────────────────────────────────────────────────
renderTree();
updateTreePreview();
