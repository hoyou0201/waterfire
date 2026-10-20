import { describe, expect, it } from "vitest";
import { TICK_RATE } from "./constants.ts";
import { LEVELS, isUnlocked } from "./levels.ts";
import { applyResult, mergeProgress, resultOf, sanitizeProgress } from "./progress.ts";
import { createState } from "./sim.ts";

describe("progress", () => {
  const level = LEVELS[0]!;

  it("별 등급: 보석 전부 + 시간 안 = 3, 하나만 = 2, 클리어만 = 1", () => {
    const s = createState(level);
    s.tick = level.targetTime * TICK_RATE;
    s.gems = s.gems.map(() => true);
    expect(resultOf(level, s).stars).toBe(3);
    s.tick += 1;
    expect(resultOf(level, s).stars).toBe(2);
    s.gems[0] = false;
    expect(resultOf(level, s).stars).toBe(1);
  });

  it("두 사람 기록을 합치면 깬 레벨은 합집합, 기록은 좋은 쪽", () => {
    const a = { x: { stars: 1, bestTicks: 500, bestGems: 3 } };
    const b = { x: { stars: 3, bestTicks: 700, bestGems: 1 }, y: { stars: 2, bestTicks: 100, bestGems: 0 } };
    expect(mergeProgress(a, b)).toEqual({
      x: { stars: 3, bestTicks: 500, bestGems: 3 },
      y: { stars: 2, bestTicks: 100, bestGems: 0 },
    });
  });

  it("결과를 기록에 반영한다", () => {
    const p = applyResult({}, { levelId: "x", ticks: 300, gems: 2, totalGems: 4, stars: 2 });
    expect(p.x).toEqual({ stars: 2, bestTicks: 300, bestGems: 2 });
  });

  it("이상한 데이터는 버린다", () => {
    expect(sanitizeProgress({ a: { stars: 9, bestTicks: 1, bestGems: 0 }, b: "x", c: { stars: 1 } })).toEqual({
      a: { stars: 3, bestTicks: 1, bestGems: 0 },
    });
    expect(sanitizeProgress(null)).toEqual({});
  });

  it("첫 레벨은 열려 있고, 다음 레벨은 앞 레벨을 깨야 열린다", () => {
    expect(isUnlocked({}, LEVELS[0]!.id)).toBe(true);
    if (LEVELS[1]) {
      expect(isUnlocked({}, LEVELS[1].id)).toBe(false);
      expect(isUnlocked({ [LEVELS[0]!.id]: { stars: 1, bestTicks: 1, bestGems: 0 } }, LEVELS[1].id)).toBe(true);
    }
  });
});
