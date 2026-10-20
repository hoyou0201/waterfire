import test01 from "../../../levels/test-01.json" with { type: "json" };
import { type Level, type LevelData, parseLevel } from "./level.ts";
import type { Progress } from "./progress.ts";

// JSON은 튜플 타입을 추론하지 못해서 LevelData로 단언한다. 형식 검사는 parseLevel이 한다.
/** 진행 순서대로 */
const LEVEL_DATA = [test01] as unknown as LevelData[];

export const LEVELS: readonly Level[] = LEVEL_DATA.map(parseLevel);

export function getLevel(id: string): Level {
  const level = LEVELS.find((l) => l.id === id);
  if (!level) throw new Error(`unknown level: ${id}`);
  return level;
}

export function hasLevel(id: string): boolean {
  return LEVELS.some((l) => l.id === id);
}

/** 첫 레벨이거나 바로 앞 레벨을 깼으면 열린다 */
export function isUnlocked(progress: Progress, id: string): boolean {
  const i = LEVELS.findIndex((l) => l.id === id);
  if (i <= 0) return i === 0;
  return progress[LEVELS[i - 1]!.id] !== undefined;
}

export function nextLevelId(id: string): string | null {
  const i = LEVELS.findIndex((l) => l.id === id);
  return LEVELS[i + 1]?.id ?? null;
}

export const DEFAULT_LEVEL_ID = LEVELS[0]!.id;
