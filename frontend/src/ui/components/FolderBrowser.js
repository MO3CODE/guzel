import { DriveService } from '../../domains/drive/DriveService.js';

// Reusable folder browser — replaces 4 duplicate implementations
export class FolderBrowser {
  constructor({ containerId, breadcrumbId, upBtnId, onSelect }) {
    this._containerId  = containerId;
    this._breadcrumbId = breadcrumbId;
    this._upBtnId      = upBtnId;
    this._onSelect     = onSelect;
    this._stack        = [];
  }

  async loadRoot() {
    this._stack = [];
    await this._load(null);
  }

  async goUp() {
    if (!this._stack.length) return;
    this._stack.pop();
    const p = this._stack[this._stack.length - 1];
    await this._load(p?.id ?? null);
  }

  async openFolder(id, name) {
    this._stack.push({ id, name });
    await this._load(id);
  }

  getCurrentPath() {
    return this._stack.map(b => b.name).join(' / ');
  }

  async _load(folderId) {
    const container = document.getElementById(this._containerId);
    container.innerHTML = '<div class="empty-state"><span class="spin"></span> جاري التحميل...</div>';
    this._updateBC();

    try {
      const folders = await DriveService.listFolders(folderId);
      const curName = this._stack.length ? this._stack[this._stack.length - 1].name : 'Drive';
      const cid = this._containerId;
      let html = '';

      if (folderId) {
        html += `<button class="btn btn-primary" style="width:100%;margin-bottom:10px"
          onclick="window.__fb_${cid}_select('${folderId}','${_escJs(curName)}')">
          ✅ اختيار: "${_escAttr(curName)}"
        </button>`;
      }

      html += folders.length
        ? `<div class="folder-grid">${folders.map(f => `
            <div class="folder-item" onclick="window.__fb_${cid}_open('${f.id}','${_escJs(f.name)}')">
              <span style="font-size:20px">📁</span>
              <div style="flex:1;min-width:0">
                <div class="fi-name">${_escAttr(f.name)}</div>
                <div style="font-size:11px;color:var(--accent);margin-top:1px">↵ دخول</div>
              </div>
            </div>`).join('')}</div>`
        : '<div class="empty-state" style="margin-top:0">لا توجد مجلدات فرعية</div>';

      container.innerHTML = html;

      // Register global handlers (bridge for inline onclick)
      window[`__fb_${cid}_select`] = (id, name) => this._onSelect?.({ id, name, path: this.getCurrentPath() });
      window[`__fb_${cid}_open`]   = (id, name) => this.openFolder(id, name);

      if (this._upBtnId)
        document.getElementById(this._upBtnId).disabled = this._stack.length === 0;
    } catch (e) {
      container.innerHTML = `<div class="empty-state">❌ ${_escAttr(e.message)}</div>`;
    }
  }

  _updateBC() {
    const el = document.getElementById(this._breadcrumbId);
    if (!el) return;
    const cid = this._containerId;
    let h = `<span class="bc-item" onclick="window.__fb_${cid}_root()">Drive</span>`;
    this._stack.forEach((b, i) => {
      h += `<span style="color:var(--text3)"> › </span>`;
      if (i < this._stack.length - 1)
        h += `<span class="bc-item" onclick="window.__fb_${cid}_goto(${i})">${_escAttr(b.name)}</span>`;
      else
        h += `<span class="bc-cur">${_escAttr(b.name)}</span>`;
    });
    el.innerHTML = h;

    window[`__fb_${cid}_root`] = () => { this._stack = []; this._load(null); };
    window[`__fb_${cid}_goto`] = (i) => { this._stack = this._stack.slice(0, i + 1); this._load(this._stack[i].id); };
  }
}

function _escAttr(s) { return (s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function _escJs(s)   { return (s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
