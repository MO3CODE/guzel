import { SheetsService } from '../sheets/SheetsService.js';
import { VideoLinksService } from './VideoLinksService.js';

const CHUNK = 100;

export const VideoLinksWriter = {
  async write(spreadsheetId, { sheetName, col, numCol, startRow, endRow, videos, linkType, includeNames, btnLabel, onProgress }) {
    const colIdx    = col.charCodeAt(0) - 65;
    const numColIdx = numCol.charCodeAt(0) - 65;

    // 1 — Get numeric sheetId
    const sheets   = await SheetsService.getSheetNames(spreadsheetId);
    const sheet    = sheets.find(s => s.title === sheetName);
    if (!sheet) {
      const names = sheets.map(s => `"${s.title}"`).join(', ');
      throw new Error(`ورقة "${sheetName}" غير موجودة. المتاح: ${names}`);
    }

    // 2 — Read number column to build rowIndex map
    const colValues = await SheetsService.readColumn(spreadsheetId, sheetName, numCol, startRow, endRow);
    const numToRow  = {};
    colValues.forEach((v, i) => {
      const n = parseInt(v);
      if (!isNaN(n)) numToRow[n] = (startRow - 1) + i;
    });

    if (!Object.keys(numToRow).length)
      throw new Error(`لا أرقام في العمود ${numCol} (${startRow}→${endRow})`);

    // 3 — Build per-row requests
    const requests = [];
    let matched = 0, skipped = 0;

    videos.forEach(f => {
      const seqNum = VideoLinksService.extractLeadingNumber(f.name);
      const rowIdx = seqNum !== null ? numToRow[seqNum] : undefined;
      if (rowIdx === undefined) { skipped++; return; }

      const link  = VideoLinksService.getLinkUrl(f, linkType);
      const cells = [SheetsService.makeLinkCell(link, btnLabel || '▶ فيديو')];
      if (includeNames) cells.push(SheetsService.makeTextCell(f.name));

      requests.push({ rowIdx, cells });
      matched++;
    });

    if (!requests.length) throw new Error('لم تُطابَق أي فيديو — تحقق من عمود الأرقام');

    // 4 — Write in chunks
    for (let i = 0; i < requests.length; i += CHUNK) {
      const batch = requests.slice(i, i + CHUNK).map(({ rowIdx, cells }) => ({
        sheetId: sheet.sheetId,
        rowIdx,
        cells,
        colIdx,
        colCount: cells.length,
      }));

      await Promise.all(batch.map(b =>
        SheetsService.writeCells(
          spreadsheetId, b.sheetId, b.rowIdx, b.colIdx,
          [{ values: b.cells }]
        )
      ));

      onProgress?.((i + Math.min(CHUNK, requests.length - i)) / requests.length);
    }

    return { matched, skipped };
  },
};
