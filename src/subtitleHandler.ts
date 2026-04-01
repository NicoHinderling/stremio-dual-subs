import { addonBuilder, SubtitleHandlerArgs } from 'stremio-addon-sdk';
import { searchSubtitles, downloadSrt, SearchOpts } from './opensubtitles';
import { parseSrt, mergeSrts } from './merger';
import { cacheKey, getCached, setCached } from './cache';

function buildResponse(baseUrl: string, key: string, lang1: string, lang2: string) {
  return {
    subtitles: [
      {
        id: `dualsubs-${lang1}-${lang2}`,
        lang: lang1,
        url: `${baseUrl}/srt/${encodeURIComponent(key)}`,
      },
    ],
    cacheMaxAge: 3600,
  };
}

async function fetchSrt(lang: string, opts: SearchOpts): Promise<string> {
  const result = await searchSubtitles(lang, opts);
  if (!result) throw new Error(`No subtitle found for lang=${lang}`);
  return downloadSrt(result.fileId, opts.apiKey);
}

export function registerSubtitleHandler(
  builder: addonBuilder,
  baseUrl: string,
): void {
  builder.defineSubtitlesHandler(async ({ type, id, extra, config }: SubtitleHandlerArgs) => {
    const apiKey: string = config?.apiKey ?? '';
    const lang1: string = config?.lang1 ?? 'en';
    const lang2: string = config?.lang2 ?? 'en';

    if (!apiKey) {
      console.warn('No OpenSubtitles API key in config');
      return { subtitles: [] };
    }

    // Series IDs: "tt1234567:1:3" (IMDb + season + episode)
    const [imdbId, seasonStr, episodeStr] = id.split(':');
    const season = seasonStr ? parseInt(seasonStr, 10) : undefined;
    const episode = episodeStr ? parseInt(episodeStr, 10) : undefined;
    const osType = type === 'series' ? 'episode' : 'movie';
    const hash = (extra as Record<string, string> | undefined)?.videoHash;
    const numericImdb = imdbId.replace(/^tt/, '');

    const key = cacheKey(hash, imdbId, lang1, lang2);

    const cached = getCached(key);
    if (cached !== undefined) {
      return buildResponse(baseUrl, key, lang1, lang2);
    }

    const opts: SearchOpts = { apiKey, hash, imdbId: numericImdb, type: osType, season, episode };

    const [res1, res2] = await Promise.allSettled([
      fetchSrt(lang1, opts),
      fetchSrt(lang2, opts),
    ]);

    const srt1 = res1.status === 'fulfilled' ? res1.value : null;
    const srt2 = res2.status === 'fulfilled' ? res2.value : null;

    if (!srt1 && !srt2) {
      return { subtitles: [] };
    }

    let mergedSrt: string;
    if (srt1 && srt2) {
      mergedSrt = mergeSrts(parseSrt(srt1), parseSrt(srt2));
    } else {
      mergedSrt = (srt1 ?? srt2) as string;
    }

    setCached(key, mergedSrt);
    return buildResponse(baseUrl, key, lang1, lang2);
  });
}
