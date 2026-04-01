declare module 'stremio-addon-sdk' {
  export interface SubtitleHandlerArgs {
    type: string;
    id: string;
    extra: Record<string, unknown>;
    config: Record<string, string>;
  }

  export interface SubtitleItem {
    id?: string;
    url: string;
    lang: string;
  }

  export interface SubtitleResponse {
    subtitles: SubtitleItem[];
    cacheMaxAge?: number;
    staleRevalidate?: number;
  }

  export class addonBuilder {
    constructor(manifest: Record<string, unknown>);
    defineSubtitlesHandler(
      handler: (args: SubtitleHandlerArgs) => Promise<SubtitleResponse>
    ): void;
    getInterface(): AddonInterface;
  }

  export interface AddonInterface {
    manifest: Record<string, unknown>;
  }

  export function getRouter(addon: AddonInterface): import('express').Router;

  export function serveHTTP(
    addon: AddonInterface,
    opts?: { port?: number }
  ): void;
}
