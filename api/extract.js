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
      const MISTRAL_KEY = process.env.MISTRAL_API_KEY;

      // 1. رفع الملف إلى Mistral Files API
      const formData = new FormData();
      formData.append('purpose', 'ocr');
      formData.append('file', new Blob([buf], { type: 'application/pdf' }), file.originalFilename || 'file.pdf');

      const uploadRes = await fetch('https://api.mistral.ai/v1/files', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MISTRAL_KEY}` },
        body: formData
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.message || 'فشل رفع الملف');
      const fileId = uploadData.id;

      // 2. الحصول على signed URL
      const urlRes = await fetch(`https://api.mistral.ai/v1/files/${fileId}/url?expiry=1`, {
        headers: { 'Authorization': `Bearer ${MISTRAL_KEY}` }
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlData.message || 'فشل الحصول على رابط الملف');
      const signedUrl = urlData.url;

      // 3. استخراج الأسماء
      const chatRes = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MISTRAL_KEY}` },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          messages: [{
            role: 'user',
            content: [
              { type: 'document_url', document_url: signedUrl },
              { type: 'text', text: 'استخرج جميع أسماء الأشخاص من هذا الملف (عربي أو إنجليزي). أجب فقط بـ JSON بدون أي نص إضافي أو ماركداون: {"names": ["الاسم1", "الاسم2"]}' }
            ]
          }]
        })
      });
      const chatData = await chatRes.json();
      if (!chatRes.ok) throw new Error(chatData.message || 'خطأ في Mistral API');

      // 4. حذف الملف بعد الاستخراج
      await fetch(`https://api.mistral.ai/v1/files/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${MISTRAL_KEY}` }
      });

      const txt = chatData.choices?.[0]?.message?.content || '{"names":[]}';
      let names = [];
      try {
        const parsed = JSON.parse(txt.replace(/```json|```/g, '').trim());
        names = parsed.names || [];
      } catch {
        names = txt.split('\n').map(l => l.replace(/^[\d\-\.\*\s]+/, '').trim()).filter(l => l.length > 2);
      }
      res.json({ names });

    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
