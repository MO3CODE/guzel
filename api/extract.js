const multiparty = require('multiparty');
const fs = require('fs');

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

      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`
        },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          messages: [{
            role: 'user',
            content: [
              {
                type: 'document_url',
                document_url: `data:application/pdf;base64,${b64}`
              },
              {
                type: 'text',
                text: 'استخرج جميع أسماء الأشخاص من هذا الملف (عربي أو إنجليزي). أجب فقط بـ JSON بدون أي نص إضافي أو ماركداون: {"names": ["الاسم1", "الاسم2"]}'
              }
            ]
          }]
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'خطأ في Mistral API');

      const txt = data.choices?.[0]?.message?.content || '{"names":[]}';
      const parsed = JSON.parse(txt.replace(/```json|```/g, '').trim());
      res.json({ names: parsed.names || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
