import axios from 'axios';

const BASE = 'https://api.opensubtitles.com/api/v1';

export interface SubtitleResult {
  fileId: number;
  language: string;
  fileName: string;
}

// Module-level JWT state with mutex to avoid concurrent logins
let jwtToken: string | null = null;
let loginPromise: Promise<string> | null = null;

async function loginUser(): Promise<string> {
  const res = await axios.post(
    `${BASE}/login`,
    {
      username: process.env.OPENSUBTITLES_USERNAME,
      password: process.env.OPENSUBTITLES_PASSWORD,
    },
    { headers: commonHeaders() },
  );
  return res.data.token as string;
}

async function ensureJwt(): Promise<string> {
  if (jwtToken) return jwtToken;
  if (!loginPromise) {
    loginPromise = loginUser().then(token => {
      jwtToken = token;
      loginPromise = null;
      return token;
    });
  }
  return loginPromise;
}

function commonHeaders(): Record<string, string> {
  return {
    'Api-Key': process.env.OPENSUBTITLES_API_KEY ?? '',
    'Content-Type': 'application/json',
    'User-Agent': 'DualSubsAddon/1.0',
  };
}

export interface SearchOpts {
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
    headers: commonHeaders(),
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

const hasCredentials =
  !!process.env.OPENSUBTITLES_USERNAME && !!process.env.OPENSUBTITLES_PASSWORD;

export async function downloadSrt(fileId: number): Promise<string> {
  const extraHeaders: Record<string, string> = {};

  if (hasCredentials) {
    const jwt = await ensureJwt();
    extraHeaders['Authorization'] = `Bearer ${jwt}`;
  }

  const attempt = async (authHeaders: Record<string, string>): Promise<string> => {
    const res = await axios.post(
      `${BASE}/download`,
      { file_id: fileId },
      { headers: { ...commonHeaders(), ...authHeaders } },
    );

    const { link } = res.data as { link: string };
    const srtRes = await axios.get<string>(link, { responseType: 'text' });
    return srtRes.data;
  };

  try {
    return await attempt(extraHeaders);
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.status === 401 && hasCredentials) {
      // Token expired — re-login and retry once
      jwtToken = null;
      const fresh = await ensureJwt();
      return attempt({ Authorization: `Bearer ${fresh}` });
    }
    throw err;
  }
}
