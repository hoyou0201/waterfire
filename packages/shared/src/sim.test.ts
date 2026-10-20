import { describe, expect, it } from "vitest";
import { CHAR_H, DEATH_RESET_TICKS, TILE } from "./constants.ts";
import { type Level, type LevelData, parseLevel } from "./level.ts";
import { getLevel } from "./levels.ts";
import { type GameState, type Input, NO_INPUT, createState, step } from "./sim.ts";

const R: Input = { left: false, right: true, jump: false };
const J: Input = { left: false, right: false, jump: true };

function makeLevel(tiles: string[], extra: Partial<LevelData> = {}): Level {
  return parseLevel({
    id: "t",
    name: "t",
    targetTime: 10,
    tiles,
    spawns: { fire: [1, tiles.length - 2], water: [2, tiles.length - 2] },
    objects: [
      { type: "exit", color: "fire", pos: [7, tiles.length - 2] },
      { type: "exit", color: "water", pos: [8, tiles.length - 2] },
    ],
    ...extra,
  });
}

function run(level: Level, s: GameState, n: number, fire: Input = NO_INPUT, water: Input = NO_INPUT): GameState {
  for (let i = 0; i < n; i++) s = step(level, s, { fire, water });
  return s;
}

const FLAT = ["##########", "#........#", "#........#", "#........#", "#........#", "#........#", "#........#", "##########"];
const FLOOR_Y = 7 * TILE;

describe("sim", () => {
  it("캐릭터가 떨어져서 바닥에 선다", () => {
    const level = makeLevel(FLAT);
    const s = run(level, createState(level), 30);
    expect(s.chars.fire.onGround).toBe(true);
    expect(s.chars.fire.y + CHAR_H).toBe(FLOOR_Y);
  });

  it("벽에 막힌다", () => {
    const level = makeLevel(FLAT);
    const s = run(level, createState(level), 120, R);
    expect(s.chars.fire.x + 24).toBe(9 * TILE);
    expect(s.chars.fire.vx).toBe(0);
  });

  it("점프 높이는 2타일 이상 3타일 미만이다", () => {
    const level = makeLevel(FLAT);
    let s = run(level, createState(level), 10);
    let minY = s.chars.fire.y;
    for (let i = 0; i < 60; i++) {
      s = step(level, s, { fire: J, water: NO_INPUT });
      minY = Math.min(minY, s.chars.fire.y);
    }
    const rise = FLOOR_Y - CHAR_H - minY;
    expect(rise).toBeGreaterThan(2 * TILE);
    expect(rise).toBeLessThan(3 * TILE);
  });

  it("점프 키를 빨리 떼면 낮게 뛴다", () => {
    const level = makeLevel(FLAT);
    let s = run(level, createState(level), 10);
    s = run(level, s, 3, J);
    let minY = s.chars.fire.y;
    for (let i = 0; i < 60; i++) {
      s = step(level, s, { fire: NO_INPUT, water: NO_INPUT });
      minY = Math.min(minY, s.chars.fire.y);
    }
    expect(FLOOR_Y - CHAR_H - minY).toBeLessThan(1.5 * TILE);
  });

  it("불은 용암에서 살고 물에서 죽는다", () => {
    const spawns = { spawns: { fire: [1, 6], water: [6, 6] } } satisfies Partial<LevelData>;
    const lava = makeLevel(["##########", "#........#", "#........#", "#........#", "#........#", "#........#", "#........#", "#LLL######"], spawns);
    expect(run(lava, createState(lava), 30).status).toBe("playing");

    const water = makeLevel(["##########", "#........#", "#........#", "#........#", "#........#", "#........#", "#........#", "#WWW######"], spawns);
    const s = run(water, createState(water), 30);
    expect(s.status).toBe("dead");
    expect(s.deadChar).toBe("fire");
  });

  it("독은 둘 다 죽인다", () => {
    const level = makeLevel(["##########", "#........#", "#........#", "#........#", "#........#", "#........#", "#........#", "##GG######"]);
    const s = run(level, createState(level), 30);
    expect(s.status).toBe("dead");
    expect(s.deadChar).toBe("water");
  });

  it("죽으면 잠시 뒤 처음 상태로 돌아간다", () => {
    const level = makeLevel(["##########", "#........#", "#........#", "#........#", "#........#", "#........#", "#........#", "#WWW######"]);
    const start = createState(level);
    let s = start;
    while (s.status !== "dead") s = run(level, s, 1);
    s = run(level, s, DEATH_RESET_TICKS);
    expect(s).toEqual(start);
  });

  it("둘 다 출구에 서면 클리어", () => {
    const level = makeLevel(FLAT, {
      spawns: { fire: [7, 6], water: [8, 6] },
    });
    const s = run(level, createState(level), 30);
    expect(s.status).toBe("won");
  });

  it("같은 색 보석만 먹는다", () => {
    const level = makeLevel(FLAT, {
      objects: [
        { type: "gem", color: "fire", pos: [1, 6] },
        { type: "gem", color: "water", pos: [1, 6] },
        { type: "exit", color: "fire", pos: [7, 6] },
        { type: "exit", color: "water", pos: [8, 6] },
      ],
    });
    const s = run(level, createState(level), 30);
    expect(s.gems).toEqual([true, false]);
  });

  it("같은 입력이면 같은 결과가 나온다 (결정론)", () => {
    const level = getLevel("test-01");
    const script = (i: number): { fire: Input; water: Input } => ({
      fire: { left: i % 50 < 10, right: i % 37 > 5, jump: i % 23 < 4 },
      water: { left: i % 41 > 20, right: i % 29 < 12, jump: i % 31 < 6 },
    });
    const play = () => {
      let s = createState(level);
      for (let i = 0; i < 1000; i++) s = step(level, s, script(i));
      return JSON.stringify(s);
    };
    expect(play()).toBe(play());
  });
});
