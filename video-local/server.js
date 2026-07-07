import express from 'express';
import cors from 'cors';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { spawn } from 'child_process';
import { createWriteStream, existsSync, mkdirSync, statSync, createReadStream } from 'fs';
import { readFile, writeFile, rm, readdir } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import path from 'path';
import crypto from 'crypto';

const PORT        = 3002;
// Heavy data lives outside the project drive (D: is tiny) — override with VIDEO_DATA_DIR
const DATA_ROOT   = process.env.VIDEO_DATA_DIR || path.join(process.env.LOCALAPPDATA || '.', 'adahi-video');
const CACHE_DIR   = path.join(DATA_ROOT, 'cache');    // downloaded Drive videos (keyed by file id)
const MUSIC_DIR   = path.join(DATA_ROOT, 'music');    // uploaded music files
const OUTPUT_DIR  = path.join(DATA_ROOT, 'output');   // rendered results
const WORK_DIR    = path.join(DATA_ROOT, 'work');     // per-job intermediates
const FFPROBE     = ffprobeStatic.path;

for (const d of [CACHE_DIR, MUSIC_DIR, OUTPUT_DIR, WORK_DIR]) if (!existsSync(d)) mkdirSync(d, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── Jobs (one at a time) ────────────────────
const jobs = {};
let busy = false;

function newJob(type) {
  const id = crypto.randomBytes(8).toString('hex');
  jobs[id] = { id, type, stage: '', percent: 0, logs: [], done: false, error: null, result: null, startedAt: Date.now() };
  return jobs[id];
}
function jlog(job, msg) {
  job.logs.push({ t: Date.now(), msg });
  console.log(`[${job.id.slice(0, 6)}] ${msg}`);
}

// ─── Helpers ─────────────────────────────────
const XFADE_TRANSITIONS = ['fade', 'fadeblack', 'wipeleft', 'wiperight', 'slideleft', 'slideright', 'smoothleft', 'smoothright', 'circleopen', 'circlecrop', 'dissolve', 'pixelize', 'radial'];

function safeExt(name) {
  const e = path.extname(name || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
  return e && e.length <= 5 ? e : '.mp4';
}

function run(bin, args, { onProgress, expectedSec } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', d => {
      out += d;
      if (onProgress && expectedSec) {
        // -progress pipe:1 emits "out_time_us=NNN" lines
        const m = String(d).match(/out_time_us=(\d+)/g);
        if (m) {
          const us = parseInt(m[m.length - 1].split('=')[1], 10);
          onProgress(Math.min(1, (us / 1e6) / expectedSec));
        }
      }
    });
    p.stderr.on('data', d => { err += d; if (err.length > 60000) err = err.slice(-30000); });
    p.on('error', reject);
    p.on('close', c => c === 0 ? resolve(out) : reject(new Error(`ffmpeg exited ${c}: ${err.slice(-1200)}`)));
  });
}

async function probe(file) {
  const out = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  const d = JSON.parse(out);
  const v = (d.streams || []).find(s => s.codec_type === 'video');
  const a = (d.streams || []).find(s => s.codec_type === 'audio');
  return {
    duration: parseFloat(d.format?.duration) || 0,
    width: v?.width || 0,
    height: v?.height || 0,
    fps: (() => { const [n, d] = String(v?.r_frame_rate || '0/1').split('/').map(Number); return d ? Math.round((n / d) * 10) / 10 : 0; })(),
    hasAudio: !!a,
    sizeBytes: parseInt(d.format?.size) || 0,
  };
}

// Download a Drive file into cache (skips if already cached)
async function downloadDriveFile(token, fileId, name, onProgress) {
  const dest = path.join(CACHE_DIR, fileId + safeExt(name));
  if (existsSync(dest) && statSync(dest).size > 0) { onProgress?.(1); return dest; }
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!r.ok) {
    const e = await r.text().catch(() => '');
    throw new Error(`فشل تنزيل "${name}" — HTTP ${r.status} ${e.slice(0, 200)}`);
  }
  const total = parseInt(r.headers.get('content-length')) || 0;
  let got = 0;
  const counter = new (await import('stream')).Transform({
    transform(chunk, _, cb) { got += chunk.length; if (total) onProgress?.(got / total); cb(null, chunk); }
  });
  const tmp = dest + '.part';
  await pipeline(Readable.fromWeb(r.body), counter, createWriteStream(tmp));
  const { renameSync } = await import('fs');
  renameSync(tmp, dest);
  onProgress?.(1);
  return dest;
}

// Resumable upload to Drive → { id, webViewLink }
async function uploadToDrive(token, filePath, name, folderId, onProgress) {
  const size = statSync(filePath).size;
  const meta = { name };
  if (folderId) meta.parents = [folderId];
  const initR = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(size) },
    body: JSON.stringify(meta),
  });
  if (!initR.ok) throw new Error(`فشل بدء الرفع — HTTP ${initR.status} ${(await initR.text()).slice(0, 200)}`);
  const session = initR.headers.get('location');

  const CHUNK = 16 * 1024 * 1024; // 16MB (multiple of 256KB)
  const buf = await readFile(filePath);
  let off = 0, final = null;
  while (off < size) {
    const end = Math.min(off + CHUNK, size);
    const r = await fetch(session, {
      method: 'PUT',
      headers: { 'Content-Length': String(end - off), 'Content-Range': `bytes ${off}-${end - 1}/${size}` },
      body: buf.subarray(off, end),
    });
    if (r.status === 308) { off = end; onProgress?.(off / size); continue; }
    if (r.ok) { final = await r.json(); onProgress?.(1); break; }
    throw new Error(`فشل رفع جزء — HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  return final;
}

// ─── Routes ──────────────────────────────────
app.get('/status', (_, res) => res.json({ ok: true, service: 'video-montage', busy, ffmpeg: !!ffmpegPath }));

app.get('/job/:id', (req, res) => {
  const j = jobs[req.params.id];
  if (!j) return res.status(404).json({ error: 'job not found' });
  res.json(j);
});

// Upload background music (raw body)
app.post('/music', express.raw({ type: '*/*', limit: '300mb' }), async (req, res) => {
  try {
    const name = decodeURIComponent(req.query.name || 'music.mp3');
    const id = crypto.randomBytes(6).toString('hex') + safeExt(name);
    await writeFile(path.join(MUSIC_DIR, id), req.body);
    const info = await probe(path.join(MUSIC_DIR, id));
    res.json({ musicId: id, name, duration: info.duration });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Analyze clips: download from Drive + ffprobe each
app.post('/analyze', (req, res) => {
  const { token, files } = req.body || {};
  if (!token || !files?.length) return res.status(400).json({ error: 'token و files مطلوبة' });
  if (busy) return res.status(409).json({ error: 'يوجد عملية جارية — انتظر انتهاءها' });
  const job = newJob('analyze');
  busy = true;
  res.json({ jobId: job.id });

  (async () => {
    const results = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      job.stage = `تنزيل وتحليل ${i + 1}/${files.length}: ${f.name}`;
      jlog(job, `⬇️ ${f.name}`);
      const base = i / files.length, span = 1 / files.length;
      const local = await downloadDriveFile(token, f.id, f.name, p => { job.percent = Math.round((base + p * span * 0.9) * 100); });
      const info = await probe(local);
      results.push({ ...f, ...info });
      job.percent = Math.round(((i + 1) / files.length) * 100);
      jlog(job, `✅ ${f.name} — ${info.duration.toFixed(1)}ث ${info.width}x${info.height}${info.hasAudio ? '' : ' (بلا صوت)'}`);
    }
    job.result = { clips: results };
    job.stage = 'اكتمل التحليل'; job.percent = 100; job.done = true;
  })().catch(e => { job.error = e.message; job.done = true; jlog(job, '❌ ' + e.message); })
     .finally(() => { busy = false; });
});

// Render montage
app.post('/render', (req, res) => {
  const { token, clips, settings } = req.body || {};
  if (!token || !clips?.length) return res.status(400).json({ error: 'token و clips مطلوبة' });
  if (busy) return res.status(409).json({ error: 'يوجد عملية جارية — انتظر انتهاءها' });
  const job = newJob('render');
  busy = true;
  res.json({ jobId: job.id });
  renderJob(job, token, clips, settings || {})
    .catch(e => { job.error = e.message; job.done = true; jlog(job, '❌ ' + e.message); })
    .finally(() => { busy = false; });
});

async function renderJob(job, token, clips, s) {
  const T          = Math.max(0.3, Math.min(3, parseFloat(s.transitionSec) || 1));
  const transition = s.transition || 'fade';                 // xfade name | 'random' | 'none'
  const maxClipSec = parseFloat(s.maxClipSec) > 0 ? parseFloat(s.maxClipSec) : 0;
  const muteOrig   = !!s.muteOriginal;
  const musicId    = s.musicId || null;
  const musicVol   = Math.max(0, Math.min(2, isNaN(parseFloat(s.musicVolume)) ? 0.3 : parseFloat(s.musicVolume)));
  const outName    = (s.outputName || 'montage.mp4').replace(/[\\/:*?"<>|]/g, '_');
  const work       = path.join(WORK_DIR, job.id);
  mkdirSync(work, { recursive: true });

  const setPct = (stageBase, stageSpan, p) => { job.percent = Math.round((stageBase + stageSpan * Math.min(1, p)) * 100); };

  // ── 1. Download (0–20%) ──
  job.stage = 'تنزيل الفيديوهات من Drive';
  const locals = [];
  for (let i = 0; i < clips.length; i++) {
    const f = clips[i];
    jlog(job, `⬇️ (${i + 1}/${clips.length}) ${f.name}`);
    const local = await downloadDriveFile(token, f.id, f.name, p => setPct(0, 0.20, (i + p) / clips.length));
    locals.push(local);
  }

  // ── 2. Probe + decide output size ──
  job.stage = 'تحليل الفيديوهات';
  const infos = [];
  for (const l of locals) infos.push(await probe(l));
  let W = 1920, H = 1080;
  if (s.resolution === '1280x720') { W = 1280; H = 720; }
  else if (s.resolution === 'source') { W = infos[0].width - (infos[0].width % 2) || 1920; H = infos[0].height - (infos[0].height % 2) || 1080; }
  jlog(job, `🎬 دقة الإخراج: ${W}x${H} — انتقال: ${transition} (${T}ث)`);

  // ── 3. Normalize every clip (20–65%) ──
  job.stage = 'معالجة وتوحيد المقاطع';
  const parts = [];
  for (let i = 0; i < locals.length; i++) {
    const inf = infos[i];
    const dur = maxClipSec ? Math.min(inf.duration, maxClipSec) : inf.duration;
    const out = path.join(work, `p${i}.mp4`);
    const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p`;
    const args = ['-y', '-nostats', '-progress', 'pipe:1', '-i', locals[i]];
    if (!inf.hasAudio) args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
    if (maxClipSec) args.push('-t', String(dur));
    args.push('-map', '0:v:0', '-map', inf.hasAudio ? '0:a:0' : '1:a:0');
    if (!inf.hasAudio) args.push('-shortest');
    args.push('-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
              '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '192k', out);
    jlog(job, `⚙️ معالجة (${i + 1}/${locals.length}) ${clips[i].name} → ${dur.toFixed(1)}ث`);
    await run(ffmpegPath, args, { expectedSec: dur, onProgress: p => setPct(0.20, 0.45, (i + p) / locals.length) });
    parts.push(out);
  }

  // exact durations of normalized parts (needed for xfade offsets)
  const partDur = [];
  for (const p of parts) partDur.push((await probe(p)).duration);
  const totalDur = transition === 'none' || parts.length === 1
    ? partDur.reduce((a, b) => a + b, 0)
    : partDur.reduce((a, b) => a + b, 0) - T * (parts.length - 1);

  // ── 4. Concat with transitions (65–85%) ──
  job.stage = 'دمج المقاطع والانتقالات';
  const concatOut = path.join(work, 'concat.mp4');
  if (parts.length === 1) {
    const { copyFileSync } = await import('fs');
    copyFileSync(parts[0], concatOut);
  } else if (transition === 'none') {
    const listFile = path.join(work, 'list.txt');
    await writeFile(listFile, parts.map(p => `file '${path.resolve(p).replace(/'/g, "'\\''")}'`).join('\n'));
    await run(ffmpegPath, ['-y', '-nostats', '-progress', 'pipe:1', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', concatOut],
      { expectedSec: totalDur, onProgress: p => setPct(0.65, 0.20, p) });
  } else {
    const args = ['-y', '-nostats', '-progress', 'pipe:1'];
    parts.forEach(p => args.push('-i', p));
    let fc = '', prevV = '[0:v]', prevA = '[0:a]', offset = 0;
    for (let i = 1; i < parts.length; i++) {
      const tr = transition === 'random'
        ? XFADE_TRANSITIONS[Math.floor(Math.random() * XFADE_TRANSITIONS.length)]
        : transition;
      // clamp: transition can't exceed half of either adjacent clip
      const t = Math.min(T, partDur[i - 1] / 2, partDur[i] / 2);
      offset += partDur[i - 1] - t;
      const vOut = i === parts.length - 1 ? '[vout]' : `[v${i}]`;
      const aOut = i === parts.length - 1 ? '[aout]' : `[a${i}]`;
      fc += `${prevV}[${i}:v]xfade=transition=${tr}:duration=${t}:offset=${offset.toFixed(3)}${vOut};`;
      fc += `${prevA}[${i}:a]acrossfade=d=${t}${aOut};`;
      prevV = vOut; prevA = aOut;
    }
    args.push('-filter_complex', fc.slice(0, -1).replace(/;$/, ''), '-map', '[vout]', '-map', '[aout]',
              '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '192k', concatOut);
    jlog(job, `🔀 دمج ${parts.length} مقطع مع انتقالات...`);
    await run(ffmpegPath, args, { expectedSec: totalDur, onProgress: p => setPct(0.65, 0.20, p) });
  }

  // ── 5. Music (85–92%) ──
  let finalFile = concatOut;
  if (musicId) {
    job.stage = 'إضافة الموسيقى';
    const musicPath = path.join(MUSIC_DIR, path.basename(musicId));
    if (!existsSync(musicPath)) throw new Error('ملف الموسيقى غير موجود — ارفعه من جديد');
    const D = (await probe(concatOut)).duration;
    const fadeSt = Math.max(0, D - 3);
    const withMusic = path.join(work, 'music.mp4');
    const args = ['-y', '-nostats', '-progress', 'pipe:1', '-i', concatOut, '-stream_loop', '-1', '-i', musicPath];
    if (muteOrig) {
      args.push('-map', '0:v', '-map', '1:a',
        '-filter:a', `volume=${musicVol},afade=t=out:st=${fadeSt.toFixed(2)}:d=3`);
    } else {
      args.push('-filter_complex',
        `[1:a]volume=${musicVol}[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0,afade=t=out:st=${fadeSt.toFixed(2)}:d=3[a]`,
        '-map', '0:v', '-map', '[a]');
    }
    args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', D.toFixed(3), withMusic);
    jlog(job, `🎵 ${muteOrig ? 'استبدال الصوت بالموسيقى' : 'مزج الموسيقى مع الصوت الأصلي'} (${Math.round(musicVol * 100)}%)`);
    await run(ffmpegPath, args, { expectedSec: D, onProgress: p => setPct(0.85, 0.07, p) });
    finalFile = withMusic;
  }

  // move to output dir
  const outPath = path.join(OUTPUT_DIR, job.id + '.mp4');
  const { copyFileSync } = await import('fs');
  copyFileSync(finalFile, outPath);
  const finalInfo = await probe(outPath);

  // ── 6. Optional upload to Drive (92–100%) ──
  let drive = null;
  if (s.uploadFolderId) {
    job.stage = 'رفع الناتج إلى Drive';
    jlog(job, `⬆️ رفع "${outName}" إلى Drive...`);
    drive = await uploadToDrive(token, outPath, outName, s.uploadFolderId, p => setPct(0.92, 0.08, p));
    jlog(job, `✅ تم الرفع — ${drive.webViewLink || drive.id}`);
  }

  await rm(work, { recursive: true, force: true }).catch(() => {});
  job.result = {
    outputName: outName,
    duration: finalInfo.duration,
    sizeBytes: statSync(outPath).size,
    downloadUrl: `/output/${job.id}`,
    drive,
  };
  job.stage = 'اكتمل المونتاج 🎉'; job.percent = 100; job.done = true;
  jlog(job, `🎉 اكتمل — ${finalInfo.duration.toFixed(1)}ث، ${(statSync(outPath).size / 1048576).toFixed(1)}MB`);
}

// Download rendered output
app.get('/output/:jobId', (req, res) => {
  const j = jobs[req.params.jobId];
  const f = path.join(OUTPUT_DIR, req.params.jobId.replace(/[^a-f0-9]/g, '') + '.mp4');
  if (!existsSync(f)) return res.status(404).send('not found');
  const name = encodeURIComponent(j?.result?.outputName || 'montage.mp4');
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${name}`);
  createReadStream(f).pipe(res);
});

// Clear the download cache
app.delete('/cache', async (_, res) => {
  let n = 0;
  for (const f of await readdir(CACHE_DIR)) { await rm(path.join(CACHE_DIR, f), { force: true }); n++; }
  res.json({ cleared: n });
});

app.listen(PORT, () => {
  console.log('');
  console.log('  🎞  خدمة المونتاج المحلية — نظام إدارة الأضاحي');
  console.log(`  ✅ تعمل على http://localhost:${PORT}`);
  console.log(`  🔧 FFmpeg: ${ffmpegPath}`);
  console.log(`  💾 مجلد البيانات: ${path.resolve(DATA_ROOT)}`);
  console.log('');
  console.log('  افتح النظام في المتصفح وانتقل لتبويب "المونتاج"');
  console.log('');
});
