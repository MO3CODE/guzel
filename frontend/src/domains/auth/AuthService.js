import { EventBus, Events } from '../../shared/EventBus.js';

const SESSION_KEY = 'session_token';
const API_BASE    = '/api';

export const AuthService = {
  isAuthenticated: () => !!sessionStorage.getItem(SESSION_KEY),

  async login(pin) {
    const r = await fetch(`${API_BASE}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'رمز غير صحيح');
    sessionStorage.setItem(SESSION_KEY, d.token);
    return d.token;
  },

  logout() {
    sessionStorage.removeItem(SESSION_KEY);
    EventBus.emit(Events.TOKEN_CLEARED);
  },
};
