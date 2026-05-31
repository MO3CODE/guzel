import { http } from '../../shared/HttpClient.js';
import { TokenService } from '../../shared/TokenService.js';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const headers = () => ({ Authorization: `Bearer ${TokenService.get()}`, 'Content-Type': 'application/json' });

export const SheetsService = {
  async getSheetNames(spreadsheetId) {
    const d = await http(`${BASE}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties`, { headers: headers() });
    return (d.sheets ?? []).map(s => ({ title: s.properties.title, sheetId: s.properties.sheetId }));
  },

  async readColumn(spreadsheetId, sheetName, col, startRow, endRow) {
    const safeSheet = sheetName.replace(/'/g, "''");
    const range = `'${safeSheet}'!${col}${startRow}:${col}${endRow}`;
    const d = await http(
      `${BASE}/${encodeURIComponent(spreadsheetId)}/values:batchGet?ranges=${encodeURIComponent(range)}&majorDimension=ROWS`,
      { headers: headers() }
    );
    return (d.valueRanges?.[0]?.values ?? []).map(r => (r[0] ?? '').toString().trim());
  },

  async findLastDataRow(spreadsheetId, sheetName, col, startRow) {
    const values = await this.readColumn(spreadsheetId, sheetName, col, startRow, startRow + 1999);
    let last = 0;
    values.forEach((v, i) => { if (v !== '') last = i; });
    return startRow + last;
  },

  async writeCells(spreadsheetId, numericSheetId, startRowIndex, startColIndex, rows) {
    const endRowIndex = startRowIndex + rows.length;
    const endColIndex = startColIndex + (rows[0]?.values?.length ?? 1);
    await http(`${BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        requests: [{
          updateCells: {
            range: { sheetId: numericSheetId, startRowIndex, endRowIndex, startColumnIndex: startColIndex, endColumnIndex: endColIndex },
            rows,
            fields: 'userEnteredValue,textFormatRuns',
          },
        }],
      }),
    });
  },

  makeLinkCell(uri, label = '▶ فيديو') {
    return {
      userEnteredValue: { stringValue: label },
      textFormatRuns: [{
        startIndex: 0,
        format: {
          link: { uri },
          foregroundColorStyle: { rgbColor: { red: 0.11, green: 0.31, blue: 0.85 } },
          underline: true,
        },
      }],
    };
  },

  makeTextCell(value) {
    return { userEnteredValue: { stringValue: String(value) } };
  },
};
