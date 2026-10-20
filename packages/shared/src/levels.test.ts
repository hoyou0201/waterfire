// 모든 레벨이 실제로 깰 수 있는지, 보석을 전부 모으고 목표 시간 안에 깰 수 있는지(★★★) 확인한다.

import { describe, expect, it } from "vitest";
import { play } from "./autopilot.ts";
import { TICK_RATE } from "./constants.ts";
import { LEVELS } from "./levels.ts";
import { resultOf } from "./progress.ts";
import { SOLUTIONS } from "./solutions.ts";

describe("레벨 풀이", () => {
  for (const level of LEVELS) {
    const solution = SOLUTIONS[level.id];
    it.skipIf(!solution)(`${level.id}: 보석을 모두 모으고 목표 시간 안에 깬다`, () => {
      const trace: string[] = [];
      let s;
      try {
        s = play(level, solution!, (l) => trace.push(l));
      } catch (e) {
        throw new Error(`${(e as Error).message}\n${trace.join("\n")}`);
      }
      const r = resultOf(level, s);
      expect(s.status, trace.join("\n")).toBe("won");
      const missed = level.gems.filter((_, i) => !s.gems[i]).map((g) => `${g.color}(${g.x / 32 - 0.5}, ${g.y / 32 - 0.5})`);
      expect(missed, "못 먹은 보석").toEqual([]);
      expect(s.tick / TICK_RATE, "걸린 시간(초)").toBeLessThanOrEqual(level.targetTime);
      if (process.env.LEVEL_TIMES) console.log(`${level.id}: ${(s.tick / TICK_RATE).toFixed(1)}s / 목표 ${level.targetTime}s`);
    });
  }
});
