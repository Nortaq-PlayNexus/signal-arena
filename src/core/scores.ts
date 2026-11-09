import type { GameId } from "./engine";

export interface ScoreRow {
  date: string;
  champion: string;
  championId: string;
  game: string;
  gameId: GameId;
  points: number;
  runnerUp: string;
  duration: number;
  engine: string;
}

const KEY = "signal-arena.scores.v1";
const MAX = 8;

export function loadScores(): ScoreRow[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as ScoreRow[]).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function saveScore(row: ScoreRow): ScoreRow[] {
  const rows = [...loadScores(), row].sort((a, b) => b.points - a.points).slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    /* storage disabled — table just stays in memory */
  }
  return rows;
}

export function clearScores(): ScoreRow[] {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return [];
}
