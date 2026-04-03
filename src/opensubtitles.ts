import axios from 'axios';

const BASE = 'https://api.opensubtitles.com/api/v1';

export interface SubtitleResult {
  fileId: number;
  language: string;
  fileName: string;
}

export interface SearchOpts {
  apiKey: string;
  hash?: string;
  imdbId: string;
  type: 'movie' | 'episode';
  season?: number;
  episode?: number;
  filename?: string;
}

interface OsFile {
  file_id: number;
  file_name: string;
}

interface OsItem {
  attributes: {
    language: string;
    download_count: number;
    files: OsFile[];
  };
}

function headers(apiKey: string): Record<string, string> {
  return {
    'Api-Key': apiKey,
    'Content-Type': 'application/json',
    'User-Agent': 'DualSubsAddon/1.0',
  };
}

function pickBest(items: OsItem[]): SubtitleResult | null {
  const best = items
    .filter(i => i.attributes.files.length > 0)
    .sort((a, b) => b.attributes.download_count - a.attributes.download_count)[0];
  if (!best) return null;
  const file = best.attributes.files[0];
  return { fileId: file.file_id, language: best.attributes.language, fileName: file.file_name };
}

async function osSearch(
  params: Record<string, string | number>,
  apiKey: string,
  retries = 2,
): Promise<OsItem[]> {
  try {
    const res = await axios.get(`${BASE}/subtitles`, {
      headers: headers(apiKey),
      params,
    });
    return res.data.data as OsItem[];
  } catch (err) {
    if (axios.isAxiosError(err) && retries > 0) {
      const status = err.response?.status;
      if (status === 503 || status === 429) {
        const delay = status === 429 ? 2000 : 1000;
        console.log(`[OS] got ${status}, retrying in ${delay}ms (${retries} left)`);
        await new Promise(r => setTimeout(r, delay));
        return osSearch(params, apiKey, retries - 1);
      }
    }
    throw err;
  }
}

// Parse a show title from a torrent filename.
// "The.House.of.Flowers.S01E01.WEB-DL.mkv" → "The House of Flowers"
function parseTitleFromFilename(filename: string): string | null {
  // Strip extension
  const base = filename.replace(/\.[^.]+$/, '');
  // Match everything before the SxxExx pattern
  const m = base.match(/^(.+?)[.\s_][Ss]\d{1,2}[Ee]\d{1,2}/);
  if (!m) return null;
  // Replace dots/underscores with spaces and clean up
  return m[1].replace(/[._]/g, ' ').trim();
}

export async function searchSubtitles(
  lang: string,
  opts: SearchOpts,
): Promise<SubtitleResult | null> {
  // 1. Hash search — most accurate, works for any content type
  if (opts.hash) {
    try {
      console.log(`[OS] hash search lang=${lang} hash=${opts.hash}`);
      const items = await osSearch({ languages: lang, moviehash: opts.hash }, opts.apiKey);
      if (items.length > 0) return pickBest(items);
      console.log('[OS] hash search returned 0, falling back');
    } catch (err) {
      console.warn(`[OS] hash search failed, falling back: ${(err as Error).message}`);
    }
  }

  // 2. Movie: IMDb ID search (works reliably for movies)
  if (opts.type === 'movie') {
    console.log(`[OS] movie imdb search lang=${lang} imdb=${opts.imdbId}`);
    const items = await osSearch({ languages: lang, imdb_id: opts.imdbId }, opts.apiKey);
    return pickBest(items);
  }

  // 3. Episode: try parsing show title from filename for a query search
  //    OpenSubtitles doesn't support series IMDb ID + season/episode lookups —
  //    it needs the episode-level IMDb ID, which Stremio doesn't provide.
  if (opts.filename) {
    const title = parseTitleFromFilename(opts.filename);
    if (title) {
      console.log(`[OS] episode filename-query search lang=${lang} title="${title}" S${opts.season}E${opts.episode}`);
      const params: Record<string, string | number> = { languages: lang, query: title };
      if (opts.season !== undefined) params.season_number = opts.season;
      if (opts.episode !== undefined) params.episode_number = opts.episode;
      const items = await osSearch(params, opts.apiKey);
      if (items.length > 0) return pickBest(items);
    }
  }

  console.warn(`[OS] no subtitles found lang=${lang} type=${opts.type} imdb=${opts.imdbId}`);
  return null;
}

export async function downloadSrt(fileId: number, apiKey: string): Promise<string> {
  const res = await axios.post(
    `${BASE}/download`,
    { file_id: fileId },
    { headers: headers(apiKey) },
  );

  const { link } = res.data as { link: string };
  const srtRes = await axios.get<string>(link, { responseType: 'text' });
  return srtRes.data;
}
