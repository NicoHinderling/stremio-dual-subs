// Common OpenSubtitles language codes with human-readable labels
export const LANGUAGE_OPTIONS = [
  'en', 'ja', 'zh-CN', 'zh-TW', 'ko', 'fr', 'de', 'es', 'pt', 'it',
  'ru', 'ar', 'hi', 'pl', 'nl', 'sv', 'da', 'fi', 'no', 'tr',
  'he', 'cs', 'hu', 'ro', 'uk', 'vi', 'th', 'id', 'ms',
];

export const manifest = {
  id: 'com.dualsubs.addon',
  version: '1.0.0',
  name: 'Dual Subtitles',
  description:
    'Merges two subtitle languages into one track — primary on top, secondary in italics below. Configure your language pair before installing.',
  resources: ['subtitles'],
  types: ['movie', 'series'],
  catalogs: [],
  idPrefixes: ['tt'],
  behaviorHints: {
    configurable: true,
    configurationRequired: true,
  },
  config: [
    {
      key: 'lang1',
      type: 'select',
      title: 'Primary Language (top)',
      options: LANGUAGE_OPTIONS,
      default: 'ja',
      required: true,
    },
    {
      key: 'lang2',
      type: 'select',
      title: 'Secondary Language (bottom, italics)',
      options: LANGUAGE_OPTIONS,
      default: 'en',
      required: true,
    },
  ],
};
