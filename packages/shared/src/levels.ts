import test01 from "../../../levels/test-01.json" with { type: "json" };
import { type Level, type LevelData, parseLevel } from "./level.ts";

// JSON은 튜플 타입을 추론하지 못해서 LevelData로 단언한다. 형식 검사는 parseLevel이 한다.
const LEVEL_DATA = [test01] as unknown as LevelData[];

export const LEVELS: ReadonlyMap<string, Level> = new Map(LEVEL_DATA.map((d) => [d.id, parseLevel(d)]));

export function getLevel(id: string): Level {
  const level = LEVELS.get(id);
  if (!level) throw new Error(`unknown level: ${id}`);
  return level;
}

export const DEFAULT_LEVEL_ID = "test-01";
