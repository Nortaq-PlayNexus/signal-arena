// Season standings — accumulated across every match played on this machine.

export interface SeasonRow {
  id: string;
  name: string;
  played: number;
  wins: number;
  podiums: number;
  points: number;
}

const KEY = "signal-arena.season.v1";
const PAY = [4, 3, 2, 1];

export function loadSeason(): SeasonRow[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as SeasonRow[]) : [];
  } catch {
    return [];
  }
}

function persist(rows: SeasonRow[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    /* storage disabled — table stays in memory */
  }
}

export function recordSeason(
  players: { id: string; name: string }[],
  order: number[],
  bounty?: string | null,
): SeasonRow[] {
  const rows = loadSeason();
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (let rank = 0; rank < order.length; rank++) {
    const p = players[order[rank]];
    if (!p) continue;
    const cur =
      byId.get(p.id) ?? { id: p.id, name: p.name, played: 0, wins: 0, podiums: 0, points: 0 };
    const stake = bounty && p.id === bounty ? (rank === 0 ? 6 : rank < 3 ? 3 : 0) : 0;
    const next: SeasonRow = {
      ...cur,
      name: p.name,
      played: cur.played + 1,
      wins: cur.wins + (rank === 0 ? 1 : 0),
      podiums: cur.podiums + (rank < 3 ? 1 : 0),
      points: cur.points + (PAY[rank] ?? 0) + stake,
    };
    byId.set(p.id, next);
  }
  const out = [...byId.values()].sort((a, b) => b.points - a.points || b.wins - a.wins);
  persist(out);
  return out;
}

export function clearSeason(): SeasonRow[] {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return [];
}
