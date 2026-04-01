import express from 'express';
import { addonBuilder, getRouter } from 'stremio-addon-sdk';
import { manifest } from './manifest';
import { registerSubtitleHandler } from './subtitleHandler';
import { getCached } from './cache';

const PORT = parseInt(process.env.PORT ?? '7000', 10);
// Render.com injects RENDER_EXTERNAL_URL automatically
const HOST = process.env.RENDER_EXTERNAL_URL ?? `http://localhost:${PORT}`;

const builder = new addonBuilder(manifest);
registerSubtitleHandler(builder, HOST);

const addonInterface = builder.getInterface();
const addonRouter = getRouter(addonInterface);

const app = express();
app.use(express.json());

// Mount the Stremio SDK router (handles /manifest.json, /configure, /subtitles/...)
app.use('/', addonRouter);

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
