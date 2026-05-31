import { DriveService } from '../drive/DriveService.js';

const VIDEO_MIMES = [
  'video/mp4', 'video/x-msvideo', 'video/quicktime', 'video/x-matroska',
  'video/webm', 'video/x-ms-wmv', 'video/mpeg', 'video/3gpp',
  'application/vnd.google-apps.video',
];

export const VideoLinksService = {
  async fetchVideos(folderId, { includeSubfolders = false } = {}) {
    let files = await DriveService.listAllFiles(folderId, VIDEO_MIMES);

    if (includeSubfolders) {
      const subs = await DriveService.listFolders(folderId);
      for (const sub of subs) {
        const subFiles = await DriveService.listAllFiles(sub.id, VIDEO_MIMES);
        files = files.concat(subFiles);
      }
    }

    return this.sortNatural(files);
  },

  sortNatural(files) {
    return [...files].sort((a, b) =>
      a.name.localeCompare(b.name, 'ar', { numeric: true, sensitivity: 'base' })
    );
  },

  applyRange(files, from, to) {
    return files.slice(from - 1, to);
  },

  extractLeadingNumber(filename) {
    const m = filename.match(/^(\d+)/);
    return m ? parseInt(m[1]) : null;
  },

  getLinkUrl(file, type = 'webViewLink') {
    if (type === 'webContentLink') return file.webContentLink || `https://drive.google.com/uc?export=download&id=${file.id}`;
    if (type === 'id_embed')       return `https://drive.google.com/file/d/${file.id}/preview`;
    return file.webViewLink        || `https://drive.google.com/file/d/${file.id}/view`;
  },

  detectDuplicates(files) {
    const normalize = name =>
      name.replace(/\.[^.]+$/, '')
          .replace(/^\d+[\s._\-–—]+/, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();

    const groups = {};
    files.forEach(f => {
      const key = normalize(f.name);
      (groups[key] ??= []).push(f);
    });

    return Object.values(groups).filter(g => g.length > 1);
  },
};
