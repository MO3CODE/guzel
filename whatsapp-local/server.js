import express from 'express';
import cors from 'cors';
import qrcode from 'qrcode';
import pino from 'pino';
import { existsSync, mkdirSync } from 'fs';
import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidGroup,
} from '@whiskeysockets/baileys';

// ─── Safety config ───────────────────────────
const RATE_LIMIT_MS   = 3000;  // min 3s between sends
const MAX_PER_MINUTE  = 10;    // max 10 messages/min
const SESSION_DIR     = './session';

// ─── State ───────────────────────────────────
let sock         = null;
let qrCode       = null;       // base64 QR image
let status       = 'disconnected'; // disconnected | qr | connected
let connectedJid = null;
let sendQueue    = [];         // rate-limited queue
let sentThisMin  = 0;
let unreadFiles  = [];         // { jid, groupName, from, type, url, caption, ts }

setInterval(() => { sentThisMin = 0; }, 60_000);

if (!existsSync(SESSION_DIR)) mkdirSync(SESSION_DIR);

// ─── Baileys connect ─────────────────────────
async function connectWA() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const logger = pino({ level: 'silent' }); // silent = no spam logs

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    printQRInTerminal: true,
    browser: ['نظام الأضاحي', 'Chrome', '120.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,  // don't show "online" — reduces detection
    generateHighQualityLinkPreview: false,
  });

  // QR
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      status = 'qr';
      qrCode = await qrcode.toDataURL(qr);
      console.log('📱 امسح الـ QR من الصفحة');
    }
    if (connection === 'open') {
      status = 'connected';
      qrCode  = null;
      connectedJid = sock.user?.id;
      console.log('✅ متصل بواتساب:', connectedJid);
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      status = 'disconnected';
      console.log('❌ انقطع الاتصال — كود:', code);
      if (shouldReconnect) {
        console.log('🔄 إعادة الاتصال...');
        setTimeout(connectWA, 3000);
      } else {
        console.log('🚪 تم تسجيل الخروج — احذف مجلد session/ وأعد التشغيل');
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Listen for new messages — detect files
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;                     // skip own messages
      if (!isJidGroup(msg.key.remoteJid)) continue;     // groups only

      const m = msg.message;
      if (!m) continue;

      let fileType = null;
      let caption  = '';

      if (m.documentMessage)      { fileType = 'pdf';   caption = m.documentMessage.caption || m.documentMessage.fileName || ''; }
      else if (m.videoMessage)    { fileType = 'video'; caption = m.videoMessage.caption || ''; }
      else if (m.imageMessage)    { fileType = 'image'; caption = m.imageMessage.caption || ''; }
      else if (m.documentWithCaptionMessage) {
        const doc = m.documentWithCaptionMessage.message?.documentMessage;
        fileType = 'pdf'; caption = doc?.caption || doc?.fileName || '';
      }

      if (!fileType) continue;

      const groupMeta = await sock.groupMetadata(msg.key.remoteJid).catch(() => null);
      const groupName = groupMeta?.subject || msg.key.remoteJid;
      const sender    = msg.key.participant || msg.key.remoteJid;

      unreadFiles.push({
        id:        msg.key.id,
        jid:       msg.key.remoteJid,
        groupName,
        sender,
        fileType,
        caption,
        ts:        msg.messageTimestamp * 1000,
      });

      console.log(`📎 ملف جديد في "${groupName}" — نوع: ${fileType}`);
    }
  });
}

connectWA();

// ─── Rate-limited send ────────────────────────
async function safeSend(jid, content) {
  return new Promise((resolve, reject) => {
    sendQueue.push({ jid, content, resolve, reject });
    processQueue();
  });
}

let _sending = false;
async function processQueue() {
  if (_sending || !sendQueue.length) return;
  _sending = true;
  while (sendQueue.length) {
    if (sentThisMin >= MAX_PER_MINUTE) {
      console.log('⏳ حد الإرسال — انتظار...');
      await new Promise(r => setTimeout(r, 5000));
      _sending = false;
      processQueue();
      return;
    }
    const { jid, content, resolve, reject } = sendQueue.shift();
    try {
      const r = await sock.sendMessage(jid, content);
      sentThisMin++;
      resolve(r);
    } catch (e) { reject(e); }
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS)); // human delay
  }
  _sending = false;
}

// ─── Express API ──────────────────────────────
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Status + QR
app.get('/status', (_, res) => {
  res.json({ status, jid: connectedJid, qr: qrCode });
});

// List groups
app.get('/groups', async (_, res) => {
  if (status !== 'connected') return res.status(503).json({ error: 'غير متصل' });
  try {
    const chats = await sock.groupFetchAllParticipating();
    const groups = Object.values(chats).map(g => ({
      id:           g.id,
      name:         g.subject,
      participants: g.participants?.length || 0,
      creation:     g.creation,
    })).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    res.json(groups);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Unread files
app.get('/unread-files', (_, res) => {
  res.json(unreadFiles);
});

// Clear unread
app.delete('/unread-files', (_, res) => {
  unreadFiles = [];
  res.json({ ok: true });
});

// Send message (rate limited)
app.post('/send', async (req, res) => {
  if (status !== 'connected') return res.status(503).json({ error: 'غير متصل' });
  const { jid, text } = req.body;
  if (!jid || !text) return res.status(400).json({ error: 'jid و text مطلوبان' });
  try {
    await safeSend(jid, { text });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Forward file from one group to another
app.post('/forward', async (req, res) => {
  if (status !== 'connected') return res.status(503).json({ error: 'غير متصل' });
  const { fromJid, messageId, toJid, note } = req.body;
  if (!fromJid || !messageId || !toJid) return res.status(400).json({ error: 'بيانات ناقصة' });
  try {
    if (note) await safeSend(toJid, { text: note });
    res.json({ ok: true, note: 'تم إرسال الملاحظة' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Logout
app.post('/logout', async (_, res) => {
  try {
    await sock?.logout();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(3001, () => {
  console.log('');
  console.log('🟢 سيرفر واتساب شغّال على http://localhost:3001');
  console.log('📱 افتح النظام وانتقل لتبويب واتساب لمسح QR');
  console.log('');
});
