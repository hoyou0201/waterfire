import l01 from "../../../levels/01-first-steps.json" with { type: "json" };
import l02 from "../../../levels/02-poison.json" with { type: "json" };
import l03 from "../../../levels/03-buttons.json" with { type: "json" };
import l04 from "../../../levels/04-elevator.json" with { type: "json" };
import l05 from "../../../levels/05-boxes.json" with { type: "json" };
import l06 from "../../../levels/06-shoulders.json" with { type: "json" };
import l07 from "../../../levels/07-slopes.json" with { type: "json" };
import l08 from "../../../levels/08-piggyback.json" with { type: "json" };
import l09 from "../../../levels/09-two-levers.json" with { type: "json" };
import l10 from "../../../levels/10-final.json" with { type: "json" };
import { type Level, type LevelData, parseLevel } from "./level.ts";
import type { Progress } from "./progress.ts";

// JSON은 튜플 타입을 추론하지 못해서 LevelData로 단언한다. 형식 검사는 parseLevel이 한다.
/** 진행 순서대로 */
const LEVEL_DATA = [l01, l02, l03, l04, l05, l06, l07, l08, l09, l10] as unknown as LevelData[];

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
