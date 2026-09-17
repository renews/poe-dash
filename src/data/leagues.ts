export const Leagues = [
  'Forbidden Rites',
  'HC Forbidden Rites',
  'Runes of Aldur',
  'HC Runes of Aldur',
  'Standard',
  'Hardcore'
] as const;

export type League = typeof Leagues[number];
