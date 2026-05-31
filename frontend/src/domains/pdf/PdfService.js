const API_BASE = '/api';

export const PdfService = {
  async extractNames(file) {
    if (file.size > 20 * 1024 * 1024) throw new Error('حجم الملف يتجاوز 20MB');
    const form = new FormData();
    form.append('pdf', file);
    const r = await fetch(`${API_BASE}/extract`, { method: 'POST', body: form });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || `خطأ ${r.status}`);
    return d.names ?? [];
  },

  async mergeFiles(files) {
    const { PDFDocument } = PDFLib;
    const merged = await PDFDocument.create();
    for (const file of files) {
      const buf  = await file.arrayBuffer();
      const doc  = await PDFDocument.load(buf);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    }
    const bytes = await merged.save();
    return new Blob([bytes], { type: 'application/pdf' });
  },

  buildXlsx(names) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['#', 'الاسم'], ...names.map((n, i) => [i + 1, n])]);
    XLSX.utils.book_append_sheet(wb, ws, 'أسماء');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  },
};
