import { Storage } from './Storage.js';
import { EventBus, Events } from './EventBus.js';

const STORAGE_KEY  = 'drive_token';
const API_BASE     = '/api';
let _token         = Storage.get(STORAGE_KEY, '');
let _autoTimer     = null;

export const TokenService = {
  get: () => _token,

  set(token) {
    _token = token;
    Storage.set(STORAGE_KEY, token);
    EventBus.emit(Events.TOKEN_CHANGED, token);
  },

  clear() {
    _token = '';
    Storage.remove(STORAGE_KEY);
    EventBus.emit(Events.TOKEN_CLEARED);
  },

  async autoRefresh() {
    try {
      const d = await fetch(`${API_BASE}/token`).then(r => r.json());
      if (d.access_token) {
        this.set(d.access_token);
        clearTimeout(_autoTimer);
        _autoTimer = setTimeout(() => this.autoRefresh(), 55 * 60 * 1000);
        return d.access_token;
      }
    } catch { /* server not configured */ }
    return null;
  },

  async verify(token) {
    const t = token || _token;
    if (!t) return null;
    try {
      const d = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: { Authorization: `Bearer ${t}` },
      }).then(r => r.json());
      if (d.user) { this.set(t); return d.user; }
    } catch {}
    return null;
  },
};
