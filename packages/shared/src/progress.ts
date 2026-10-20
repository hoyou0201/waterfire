// 레벨 기록, 별 등급, 두 사람 기록 합치기

import { TICK_RATE } from "./constants.ts";
import type { Level } from "./level.ts";
import type { GameState } from "./sim.ts";

export interface LevelRecord {
  /** 1~3 */
  stars: number;
  bestTicks: number;
  bestGems: number;
}

/** 레벨 id → 기록. 기록이 있으면 클리어한 레벨이다 */
export type Progress = Record<string, LevelRecord>;

export interface LevelResult {
  levelId: string;
  ticks: number;
  gems: number;
  totalGems: number;
  stars: number;
}

/** ★★★ 보석 전부 + 목표 시간 이내, ★★ 둘 중 하나, ★ 클리어 */
export function resultOf(level: Level, s: GameState): LevelResult {
  const gems = s.gems.filter(Boolean).length;
  const allGems = gems === s.gems.length;
  const inTime = s.tick <= level.targetTime * TICK_RATE;
  return {
    levelId: level.id,
    ticks: s.tick,
    gems,
    totalGems: s.gems.length,
    stars: 1 + (allGems ? 1 : 0) + (inTime ? 1 : 0),
  };
}

export function mergeRecord(a: LevelRecord | undefined, b: LevelRecord | undefined): LevelRecord | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    stars: Math.max(a.stars, b.stars),
    bestTicks: Math.min(a.bestTicks, b.bestTicks),
    bestGems: Math.max(a.bestGems, b.bestGems),
  };
}

/** 깬 레벨은 합집합, 기록은 더 좋은 쪽 */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const out: Progress = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const r = mergeRecord(a[id], b[id]);
    if (r) out[id] = r;
  }
  return out;
}

export function applyResult(p: Progress, r: LevelResult): Progress {
  const rec = mergeRecord(p[r.levelId], { stars: r.stars, bestTicks: r.ticks, bestGems: r.gems })!;
  return { ...p, [r.levelId]: rec };
}

/** 받은 값이 Progress 모양인지 확인하고 이상한 항목은 버린다 (상대 브라우저에서 온 데이터라서) */
export function sanitizeProgress(raw: unknown): Progress {
  const out: Progress = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const [id, v] of Object.entries(raw)) {
    if (typeof v !== "object" || v === null) continue;
    const { stars, bestTicks, bestGems } = v as Record<string, unknown>;
    if (typeof stars !== "number" || typeof bestTicks !== "number" || typeof bestGems !== "number") continue;
    out[id] = { stars: Math.min(3, Math.max(1, Math.round(stars))), bestTicks, bestGems };
  }
  return out;
}
