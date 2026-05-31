import { http } from '../../shared/HttpClient.js';
import { TokenService } from '../../shared/TokenService.js';

const BASE = 'https://www.googleapis.com/drive/v3';
const headers = () => ({ Authorization: `Bearer ${TokenService.get()}` });
const allDrives = '&supportsAllDrives=true&includeItemsFromAllDrives=true';

export const DriveService = {
  async listFolders(parentId = null) {
    const q = parentId
      ? `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
      : `mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`;
    const d = await http(`${BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&orderBy=name&pageSize=200${allDrives}`, { headers: headers() });
    return d.files ?? [];
  },

  async getFolder(id) {
    return http(`${BASE}/files/${id}?fields=name,id${allDrives.replace('&', '?').replace('&', '&')}`, { headers: headers() });
  },

  async listFiles(folderId, mimeTypes = [], pageToken = null) {
    const mimeQ = mimeTypes.length
      ? ` and (${mimeTypes.map(m => `mimeType='${m}'`).join(' or ')})`
      : '';
    const q = `'${folderId}' in parents${mimeQ} and trashed=false`;
    let url = `${BASE}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink,webContentLink)&orderBy=name&pageSize=300${allDrives}`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    return http(url, { headers: headers() });
  },

  async listAllFiles(folderId, mimeTypes = []) {
    let all = [], pageToken = null;
    do {
      const d = await this.listFiles(folderId, mimeTypes, pageToken);
      all = all.concat(d.files ?? []);
      pageToken = d.nextPageToken ?? null;
    } while (pageToken);
    return all;
  },

  async createFolder(name, parentId = null) {
    const body = { name, mimeType: 'application/vnd.google-apps.folder' };
    if (parentId) body.parents = [parentId];
    const d = await http(`${BASE}/files`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return d.id;
  },

  async uploadFile(blob, name, parentId) {
    const meta = JSON.stringify({ name, parents: [parentId] });
    const fd = new FormData();
    fd.append('metadata', new Blob([meta], { type: 'application/json' }));
    fd.append('file', blob);
    return http('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TokenService.get()}` },
      body: fd,
    });
  },

  extractFolderIdFromUrl(url) {
    const patterns = [
      /\/folders\/([a-zA-Z0-9_-]{10,})/,
      /[?&]id=([a-zA-Z0-9_-]{10,})/,
      /^([a-zA-Z0-9_-]{25,})$/,
    ];
    for (const p of patterns) {
      const m = url.trim().match(p);
      if (m) return m[1];
    }
    return null;
  },
};
