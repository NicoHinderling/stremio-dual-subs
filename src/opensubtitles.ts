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

export async function searchSubtitles(
  lang: string,
  opts: SearchOpts,
): Promise<SubtitleResult | null> {
  const params: Record<string, string | number> = {
    languages: lang,
    type: opts.type,
  };

  if (opts.hash) {
    params.moviehash = opts.hash;
  } else {
    params.imdb_id = opts.imdbId;
    if (opts.season !== undefined) params.season_number = opts.season;
    if (opts.episode !== undefined) params.episode_number = opts.episode;
  }

  const res = await axios.get(`${BASE}/subtitles`, {
    headers: headers(opts.apiKey),
    params,
  });

  const items = res.data.data as OsItem[];

  // Hash search returned nothing — fall back to IMDb ID
  if (items.length === 0 && opts.hash) {
    return searchSubtitles(lang, { ...opts, hash: undefined });
  }

  const best = items
    .filter(i => i.attributes.files.length > 0)
    .sort((a, b) => b.attributes.download_count - a.attributes.download_count)[0];

  if (!best) return null;

  const file = best.attributes.files[0];
  return {
    fileId: file.file_id,
    language: best.attributes.language,
    fileName: file.file_name,
  };
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
