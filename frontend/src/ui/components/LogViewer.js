export class LogViewer {
  constructor(elementId) {
    this._id = elementId;
  }

  info(msg)    { this._append(msg, 'i'); }
  success(msg) { this._append(msg, 's'); }
  error(msg)   { this._append(msg, 'e'); }
  clear()      { const el = document.getElementById(this._id); if (el) el.innerHTML = ''; }

  _append(msg, type) {
    const el = document.getElementById(this._id);
    if (!el) return;
    const d = document.createElement('div');
    d.className = 'log-line ' + type;
    d.textContent = `[${new Date().toLocaleTimeString('ar-SA')}] ${msg}`;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
  }
}
