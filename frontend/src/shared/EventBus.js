const _handlers = {};

export const EventBus = {
  on:  (event, fn) => { (_handlers[event] ??= []).push(fn); },
  off: (event, fn) => { _handlers[event] = (_handlers[event] ?? []).filter(h => h !== fn); },
  emit: (event, payload) => { (_handlers[event] ?? []).forEach(fn => fn(payload)); },
};

// Events used across domains
export const Events = {
  TOKEN_CHANGED:    'token:changed',
  TOKEN_CLEARED:    'token:cleared',
  FOLDER_SELECTED:  'drive:folderSelected',
  SNAPSHOT_SAVED:   'monitor:snapshotSaved',
  UNREAD_FILES:     'whatsapp:unreadFiles',
};
