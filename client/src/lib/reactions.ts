export const REACTIONS = [
  { key: 'fire', label: 'Fire' },
  { key: 'joy', label: 'LOL' },
  { key: 'scream', label: 'Shocked' },
  { key: 'clap', label: 'Clap' },
  { key: 'money', label: 'Money gone' },
  { key: 'clown', label: 'Clown bid' },
  { key: 'huff', label: 'Fuming' },
  { key: 'pray', label: 'Please no' },
  { key: 'mindblown', label: 'Mind blown' },
  { key: 'skull', label: 'Dead' },
] as const;
export type ReactionKey = (typeof REACTIONS)[number]['key'];
export const BADGE_EMOJI = ['trophy', 'gem', 'swords', 'crown', 'cricket'];
