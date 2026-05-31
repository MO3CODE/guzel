import { AuthService } from './AuthService.js';

const PIN_MAX = 6;
let _pin = '';
let _successCallback = null;

export function initPinScreen(onSuccess) {
  _successCallback = onSuccess;          // store once on init
  if (AuthService.isAuthenticated()) { _hide(); onSuccess(); return; }

  document.addEventListener('keydown', e => {
    if (document.getElementById('pin-screen')?.classList.contains('hide')) return;
    if (e.key >= '0' && e.key <= '9') _key(e.key);
    else if (e.key === 'Backspace') _del();
  });
}

export function pinKey(k) { _key(k); }
export function pinDel()  { _del(); }

function _key(k) {
  if (_pin.length >= PIN_MAX) return;
  _pin += k;
  _renderDots();
  if (_pin.length === PIN_MAX) _submit();
}

function _del() {
  _pin = _pin.slice(0, -1);
  _renderDots();
}

function _renderDots(error = false) {
  for (let i = 0; i < PIN_MAX; i++) {
    const d = document.getElementById('pd' + i);
    if (!d) return;
    d.classList.toggle('filled', i < _pin.length);
    d.classList.toggle('error', error);
  }
}

async function _submit() {
  document.getElementById('pin-error').textContent = '';
  try {
    await AuthService.login(_pin);
    _hide();
    _successCallback?.();
  } catch (e) {
    document.getElementById('pin-error').textContent = e.message;
    _renderDots(true);
    _pin = '';
    setTimeout(() => _renderDots(false), 600);
  }
}

function _hide() {
  const s = document.getElementById('pin-screen');
  if (!s) return;
  s.classList.add('hide');
  setTimeout(() => (s.style.display = 'none'), 300);
}
