import { Storage } from '../../shared/Storage.js';

const FOLDERS_KEY  = 'mon_folders';
const SNAPSHOT_KEY = 'mon_snapshot';

export const MonitorRepository = {
  getFolders:  ()  => Storage.get(FOLDERS_KEY, []),
  saveFolders: (f) => Storage.set(FOLDERS_KEY, f),

  getSnapshot:  ()  => Storage.get(SNAPSHOT_KEY, null),
  saveSnapshot: (s) => Storage.set(SNAPSHOT_KEY, s),
  clearSnapshot:()  => Storage.remove(SNAPSHOT_KEY),
};
