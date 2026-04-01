import 'dotenv/config';
import express from 'express';
import { addonBuilder, getRouter } from 'stremio-addon-sdk';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const landingTemplate = require('stremio-addon-sdk/src/landingTemplate');
import { manifest } from './manifest';
import { registerSubtitleHandler } from './subtitleHandler';
import { getCached } from './cache';

const PORT = parseInt(process.env.PORT ?? '7001', 10);
// Render.com injects RENDER_EXTERNAL_URL automatically
const HOST = process.env.RENDER_EXTERNAL_URL ?? `http://localhost:${PORT}`;

const builder = new addonBuilder(manifest);
registerSubtitleHandler(builder, HOST);

const addonInterface = builder.getInterface();
const addonRouter = getRouter(addonInterface);

const app = express();
app.use(express.json());

// Mount the Stremio SDK router (handles /manifest.json and subtitle routes)
app.use('/', addonRouter);

// Configure page — getRouter omits this, so we serve it manually
const landingHTML: string = landingTemplate(manifest);
app.get('/', (_req: express.Request, res: express.Response): void => {
  res.redirect('/configure');
});
app.get('/configure', (_req: express.Request, res: express.Response): void => {
  res.setHeader('Content-Type', 'text/html');
  res.send(landingHTML);
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
