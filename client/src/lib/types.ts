export type Role = 'BAT' | 'BOWL' | 'AR' | 'WK';

export interface Player {
  id: number;
  name: string;
  role: Role;
  country: string;
  cc: string;
  overseas: boolean;
  capped: boolean;
  age: number | null;
  lastTeam: string;
  lastSeason: number;
  seasons: number;
  retainedBy: string | null;
  retainedFee: number | null;
  marquee: boolean;
  rating: number;
  base: number;
  photo: 'cut' | 'wiki' | null;
}

export interface TeamInfo {
  code: string;
  id: number;
  name: string;
  city: string;
  primary: string;
  secondary: string;
  text: string;
  titles: number;
}

export interface Member {
  id: string;
  name: string;
  team: string | null;
  connected: boolean;
  bot: boolean;
}

export interface TeamState {
  code: string;
  ownerId: string;
  purse: number;
  squad: { id: number; price: number }[];
}

export interface Lot {
  id: number;
  set: string;
  base: number;
  bid: number | null;
  leader: string | null;
  endsAt: number;
  history: { team: string; amount: number; t: number }[];
  status: 'live' | 'sold' | 'unsold';
  passed: string[];
  n: number;
  next: number | null;
  remaining: number;
}

export interface Settings {
  purse: number;
  maxSquad: number;
  minSquad: number;
  maxOverseas: number;
  bidTime: number;
  pool: 'blitz' | 'quick' | 'standard' | 'full';
  unsoldRound: boolean;
}

export interface LogEntry {
  t: number;
  kind: 'info' | 'sold' | 'unsold';
  text: string;
  id?: number;
  team?: string;
  amount?: number;
}

export interface RoomState {
  code: string;
  hostId: string;
  phase: 'lobby' | 'auction' | 'results';
  settings: Settings;
  members: Member[];
  teams: Record<string, TeamState>;
  lot: Lot | null;
  paused: boolean;
  round: number;
  progress: { done: number; total: number };
  upcoming: number[];
  log: LogEntry[];
  serverNow: number;
  nextLotAt: number;
  receivedAt: number; // client-side performance.now() when this state arrived
}
