import { DriveService } from '../drive/DriveService.js';
import { MonitorRepository } from './MonitorRepository.js';
import { EventBus, Events } from '../../shared/EventBus.js';

export const MonitorService = {
  getFolders:  () => MonitorRepository.getFolders(),
  getSnapshot: () => MonitorRepository.getSnapshot(),

  addFolder(folder) {
    const folders = this.getFolders();
    if (folders.some(f => f.id === folder.id)) throw new Error(`المجلد "${folder.name}" مضاف مسبقاً`);
    folders.push(folder);
    MonitorRepository.saveFolders(folders);
    return folders;
  },

  removeFolder(index) {
    const folders = this.getFolders();
    folders.splice(index, 1);
    MonitorRepository.saveFolders(folders);
    return folders;
  },

  async takeSnapshot(onProgress) {
    const folders = this.getFolders();
    if (!folders.length) throw new Error('لا توجد مجلدات للمراقبة');

    const data = {};
    for (let i = 0; i < folders.length; i++) {
      data[folders[i].id] = await DriveService.listAllFiles(folders[i].id);
      onProgress?.((i + 1) / folders.length);
    }

    const snapshot = { timestamp: Date.now(), data };
    MonitorRepository.saveSnapshot(snapshot);
    EventBus.emit(Events.SNAPSHOT_SAVED, snapshot);
    return snapshot;
  },

  async checkChanges(onProgress) {
    const snapshot = this.getSnapshot();
    if (!snapshot) throw new Error('لا توجد لقطة محفوظة');

    const folders   = this.getFolders();
    const added     = [], deleted = [], modified = [];
    const liveData  = {};

    for (let i = 0; i < folders.length; i++) {
      const folder   = folders[i];
      const oldFiles = snapshot.data[folder.id] ?? [];
      const newFiles = await DriveService.listAllFiles(folder.id);
      liveData[folder.id] = newFiles;

      const oldMap = Object.fromEntries(oldFiles.map(f => [f.id, f]));
      const newMap = Object.fromEntries(newFiles.map(f => [f.id, f]));

      newFiles.forEach(f => { if (!oldMap[f.id]) added.push({ ...f, _folderName: folder.name }); });
      oldFiles.forEach(f => { if (!newMap[f.id]) deleted.push({ ...f, _folderName: folder.name }); });
      newFiles.forEach(f => {
        const old = oldMap[f.id];
        if (old && old.modifiedTime !== f.modifiedTime)
          modified.push({ ...f, _folderName: folder.name, _oldTime: old.modifiedTime });
      });

      onProgress?.((i + 1) / folders.length);
    }

    return { added, deleted, modified, liveData };
  },

  updateSnapshot(liveData) {
    const snapshot = { timestamp: Date.now(), data: liveData };
    MonitorRepository.saveSnapshot(snapshot);
    EventBus.emit(Events.SNAPSHOT_SAVED, snapshot);
    return snapshot;
  },

  clearSnapshot() {
    MonitorRepository.clearSnapshot();
  },
};
