import 'dotenv/config';
import express from 'express';
import { addonBuilder, getRouter } from 'stremio-addon-sdk';
import { manifest, LANGUAGE_OPTIONS } from './manifest';
import { registerSubtitleHandler } from './subtitleHandler';
import { getCached } from './cache';

const PORT = parseInt(process.env.PORT ?? '7001', 10);
// Render.com injects these automatically
const HOST = process.env.RENDER_EXTERNAL_URL ?? `http://localhost:${PORT}`;
const GIT_SHA = (process.env.RENDER_GIT_COMMIT ?? 'local').slice(0, 7);

const builder = new addonBuilder(manifest);
registerSubtitleHandler(builder, HOST);

const addonInterface = builder.getInterface();
const addonRouter = getRouter(addonInterface);

const app = express();
app.use(express.json());

// Mount the Stremio SDK router (handles /manifest.json and subtitle routes)
app.use('/', addonRouter);

const langOptions = LANGUAGE_OPTIONS.map(
  l => `<option value="${l}">${l}</option>`,
).join('');

const configurePage = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Dual Subtitles — Configure</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: #1a1a2e; color: #eee; display: flex; justify-content: center; padding: 40px 16px; margin: 0; }
    .card { background: #16213e; border-radius: 12px; padding: 36px; width: 100%; max-width: 480px; }
    h1 { margin: 0 0 6px; font-size: 22px; color: #fff; }
    .sub { color: #aaa; font-size: 14px; margin-bottom: 28px; }
    label { display: block; font-size: 13px; color: #bbb; margin-bottom: 6px; }
    input, select { width: 100%; padding: 10px 12px; border-radius: 6px; border: 1px solid #333; background: #0f3460; color: #fff; font-size: 14px; margin-bottom: 18px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .url-box { background: #0f3460; border: 1px solid #333; border-radius: 6px; padding: 10px 12px; font-size: 12px; color: #aaa; word-break: break-all; margin-bottom: 8px; min-height: 48px; }
    .url-label { font-size: 13px; color: #bbb; margin-bottom: 6px; }
    .copy-btn { width: 100%; padding: 12px; background: #533483; border: none; border-radius: 6px; color: #fff; font-size: 15px; font-weight: bold; cursor: pointer; margin-bottom: 10px; }
    .copy-btn:hover { background: #6a45a0; }
    .copy-btn.copied { background: #2d6a4f; }
    .hint { font-size: 12px; color: #888; line-height: 1.5; }
    .hint strong { color: #bbb; }
    a { color: #a78bfa; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Dual Subtitles</h1>
    <p class="sub">Configure your languages, then copy the URL into Stremio.</p>

    <label>OpenSubtitles API Key
      <a href="https://www.opensubtitles.com/consumers" target="_blank" style="font-size:11px; margin-left:6px">get one free →</a>
    </label>
    <input type="text" id="apiKey" placeholder="paste your API key here">

    <div class="row">
      <div>
        <label>Primary language (top)</label>
        <select id="lang1">${langOptions}</select>
      </div>
      <div>
        <label>Secondary language (italics)</label>
        <select id="lang2">${langOptions}</select>
      </div>
    </div>

    <div class="url-label">Your manifest URL</div>
    <div class="url-box" id="manifestUrl">Fill in your API key above to generate your URL.</div>
    <button class="copy-btn" id="copyBtn" onclick="copyUrl()">Copy URL</button>

    <p class="hint">
      In Stremio: <strong>Settings → Add-ons → ⊕ (top right) → paste URL</strong><br>
      On Apple TV: install on desktop Stremio first — it syncs automatically.
    </p>
    <p style="margin-top:20px; font-size:11px; color:#555; text-align:right">
      deployed: <code style="color:#666">${GIT_SHA}</code>
    </p>
  </div>
  <script>
    const BASE = '${HOST}';
    const lang1El = document.getElementById('lang1');
    const lang2El = document.getElementById('lang2');
    const apiKeyEl = document.getElementById('apiKey');
    const urlEl = document.getElementById('manifestUrl');
    const copyBtn = document.getElementById('copyBtn');

    // Set defaults
    lang1El.value = 'ja';
    lang2El.value = 'en';

    function getUrl() {
      const key = apiKeyEl.value.trim();
      if (!key) return null;
      const config = encodeURIComponent(JSON.stringify({ apiKey: key, lang1: lang1El.value, lang2: lang2El.value }));
      return BASE + '/' + config + '/manifest.json';
    }

    function update() {
      const url = getUrl();
      urlEl.textContent = url || 'Fill in your API key above to generate your URL.';
    }

    function copyUrl() {
      const url = getUrl();
      if (!url) { alert('Enter your OpenSubtitles API key first.'); return; }
      navigator.clipboard.writeText(url).then(() => {
        copyBtn.textContent = 'Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => { copyBtn.textContent = 'Copy URL'; copyBtn.classList.remove('copied'); }, 2000);
      });
    }

    apiKeyEl.addEventListener('input', update);
    lang1El.addEventListener('change', update);
    lang2El.addEventListener('change', update);
  </script>
</body>
</html>`;

app.get('/', (_req: express.Request, res: express.Response): void => {
  res.redirect('/configure');
});
app.get('/configure', (_req: express.Request, res: express.Response): void => {
  res.setHeader('Content-Type', 'text/html');
  res.send(configurePage);
});

// Serve merged SRT files from cache
app.get('/srt/:key', (req: express.Request, res: express.Response): void => {
  const key = decodeURIComponent(req.params.key as string);
  const srt = getCached(key);

  if (!srt) {
    res.status(404).send('Subtitle not found or cache expired — please reload the title in Stremio');
    return;
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(srt);
});

// Health check for Render.com
app.get('/health', (_req: express.Request, res: express.Response): void => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Dual Subs add-on running on port ${PORT}`);
  console.log(`Configure & install: ${HOST}/configure`);
});
