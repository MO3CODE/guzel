const { GoogleGenerativeAI } = require('@google/generative-ai');
const multiparty = require('multiparty');
const fs = require('fs');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const form = new multiparty.Form({ maxFilesSize: 20 * 1024 * 1024 });

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(400).json({ error: 'فشل في قراءة الملف' });

    const file = files?.pdf?.[0];
    if (!file) return res.status(400).json({ error: 'لم يُرفق ملف PDF' });

    try {
      const buf = fs.readFileSync(file.path);
      const b64 = buf.toString('base64');

      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent([
        { inlineData: { data: b64, mimeType: 'application/pdf' } },
        'استخرج جميع أسماء الأشخاص من هذا الملف (عربي أو إنجليزي). أجب فقط بـ JSON بدون أي نص إضافي أو ماركداون: {"names": ["الاسم1", "الاسم2"]}'
      ]);

      const txt = result.response.text() || '{"names":[]}';
      const parsed = JSON.parse(txt.replace(/```json|```/g, '').trim());
      res.json({ names: parsed.names || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
