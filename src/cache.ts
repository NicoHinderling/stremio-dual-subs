import NodeCache from 'node-cache';

// TTL: 1 hour. checkperiod: background sweep every 2 minutes.
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

export function cacheKey(
  hash: string | undefined,
  imdbId: string,
  lang1: string,
  lang2: string,
): string {
  const base = hash ? `hash:${hash}` : `imdb:${imdbId}`;
  return `${base}|${lang1}|${lang2}`;
}

export function getCached(key: string): string | undefined {
  return cache.get<string>(key);
}

export function setCached(key: string, srt: string): void {
  cache.set(key, srt);
}
