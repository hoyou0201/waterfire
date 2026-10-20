import { describe, expect, it } from "vitest";
import { BOX_SIZE, CHAR_H, CHAR_W, TILE } from "./constants.ts";
import { type Level, type LevelData, type LevelObject, type Vec2, parseLevel } from "./level.ts";
import { type GameState, type Input, NO_INPUT, createState, step } from "./sim.ts";

const L: Input = { left: true, right: false, jump: false };
const R: Input = { left: false, right: true, jump: false };
const J: Input = { left: false, right: false, jump: true };
const RJ: Input = { left: false, right: true, jump: true };

/** 바닥이 7행(y=224)인 12×8 방 */
const ROOM = [
  "############",
  "#..........#",
  "#..........#",
  "#..........#",
  "#..........#",
  "#..........#",
  "#..........#",
  "############",
];
const FLOOR = 7 * TILE;

function makeLevel(opts: { tiles?: string[]; fire?: Vec2; water?: Vec2; objects?: LevelObject[] } = {}): Level {
  const data: LevelData = {
    id: "t",
    name: "t",
    targetTime: 10,
    tiles: opts.tiles ?? ROOM,
    spawns: { fire: opts.fire ?? [1, 6], water: opts.water ?? [9, 6] },
    objects: [
      { type: "exit", color: "fire", pos: [5, 1] },
      { type: "exit", color: "water", pos: [6, 1] },
      ...(opts.objects ?? []),
    ],
  };
  return parseLevel(data);
}

function run(level: Level, s: GameState, n: number, fire: Input = NO_INPUT, water: Input = NO_INPUT): GameState {
  for (let i = 0; i < n; i++) s = step(level, s, { fire, water });
  return s;
}

const bottom = (c: { y: number }) => c.y + CHAR_H;

describe("캐릭터끼리 충돌", () => {
  it("서로 통과하지 못하고 옆에서 막힌다", () => {
    const level = makeLevel({ fire: [1, 6], water: [4, 6] });
    const s = run(level, createState(level), 90, R);
    expect(s.chars.fire.x + CHAR_W).toBeCloseTo(s.chars.water.x, 5);
  });

  it("상대 머리 위에 착지해서 설 수 있다", () => {
    const level = makeLevel({ fire: [4, 3], water: [4, 6] });
    const s = run(level, createState(level), 60);
    expect(s.chars.fire.onGround).toBe(true);
    expect(bottom(s.chars.fire)).toBeCloseTo(s.chars.water.y, 5);
  });

  it("아래 캐릭터가 걸으면 위 캐릭터도 함께 이동한다", () => {
    const level = makeLevel({ fire: [4, 3], water: [4, 6] });
    let s = run(level, createState(level), 60);
    const dx0 = s.chars.fire.x - s.chars.water.x;
    s = run(level, s, 20, NO_INPUT, R);
    expect(s.chars.water.x).toBeGreaterThan(4 * TILE);
    expect(s.chars.fire.x - s.chars.water.x).toBeCloseTo(dx0, 5);
    expect(bottom(s.chars.fire)).toBeCloseTo(s.chars.water.y, 5);
  });

  it("상대를 밟고 3타일 벽을 넘는다", () => {
    // 3타일 높이 턱: 혼자서는 못 올라간다
    const tiles = [
      "############",
      "#..........#",
      "#..........#",
      "#..........#",
      "#......#####",
      "#......#####",
      "#......#####",
      "############",
    ];
    const solo = makeLevel({ tiles, fire: [5, 6], water: [1, 6] });
    let s = run(solo, createState(solo), 10);
    s = run(solo, s, 60, RJ);
    expect(s.chars.fire.x + CHAR_W).toBeLessThanOrEqual(7 * TILE + 0.01);

    const level = makeLevel({ tiles, fire: [6, 3], water: [6, 6] });
    s = run(level, createState(level), 60);
    expect(bottom(s.chars.fire)).toBeCloseTo(s.chars.water.y, 5);
    s = run(level, s, 40, RJ);
    expect(s.chars.fire.x).toBeGreaterThan(7 * TILE);
    expect(bottom(s.chars.fire)).toBeCloseTo(4 * TILE, 5);
  });

  it("아래 캐릭터는 위에 사람이 있으면 점프가 막힌다", () => {
    const level = makeLevel({ fire: [4, 3], water: [4, 6] });
    let s = run(level, createState(level), 60);
    const y0 = s.chars.water.y;
    s = run(level, s, 20, NO_INPUT, J);
    expect(s.chars.water.y).toBeCloseTo(y0, 5);
  });

  it("물 캐릭터가 불 캐릭터를 업고 물웅덩이를 건넌다", () => {
    const tiles = [
      "############",
      "#..........#",
      "#..........#",
      "#..........#",
      "#..........#",
      "#..........#",
      "#..........#",
      "###WWWW#####",
    ];
    const level = makeLevel({ tiles, fire: [2, 3], water: [2, 6] });
    let s = run(level, createState(level), 60);
    s = run(level, s, 60, NO_INPUT, R);
    expect(s.status).toBe("playing");
    expect(s.chars.water.x).toBeGreaterThan(7 * TILE);
    expect(bottom(s.chars.fire)).toBeCloseTo(s.chars.water.y, 5);
  });
});

describe("상자", () => {
  it("캐릭터가 밀면 움직이고, 벽에 닿으면 멈춘다", () => {
    // 물 캐릭터는 위쪽 선반에 비켜 둔다
    const tiles = [...ROOM];
    tiles[2] = "#.......####";
    const level = makeLevel({ tiles, fire: [1, 6], water: [9, 1], objects: [{ type: "box", pos: [3, 6] }] });
    let s = run(level, createState(level), 30, R);
    // 밀 때 속도가 크게 줄지 않는다
    expect(s.boxes[0]!.x).toBeGreaterThan(4 * TILE);
    expect(s.boxes[0]!.x).toBeCloseTo(s.chars.fire.x + CHAR_W, 5);
    s = run(level, s, 200, R);
    expect(s.boxes[0]!.x + BOX_SIZE).toBe(11 * TILE);
  });

  it("상자는 다른 캐릭터를 밀지 않는다", () => {
    const level = makeLevel({ fire: [1, 6], water: [4, 6], objects: [{ type: "box", pos: [2, 6] }] });
    const s = run(level, createState(level), 90, R);
    expect(s.boxes[0]!.x + BOX_SIZE).toBeCloseTo(s.chars.water.x, 5);
    expect(s.chars.water.x).toBe(4.5 * TILE - CHAR_W / 2);
  });

  it("상자 위에 올라설 수 있다", () => {
    const level = makeLevel({ fire: [3, 3], objects: [{ type: "box", pos: [3, 6] }] });
    const s = run(level, createState(level), 60);
    expect(bottom(s.chars.fire)).toBeCloseTo(FLOOR - BOX_SIZE, 5);
  });

  it("상자가 버튼을 누른다", () => {
    const level = makeLevel({
      fire: [1, 6],
      objects: [
        { type: "box", pos: [3, 6] },
        { type: "button", channel: "a", pos: [5, 6] },
      ],
    });
    let s = run(level, createState(level), 10);
    expect(s.buttons[0]).toBe(false);
    for (let i = 0; i < 200 && s.boxes[0]!.x + BOX_SIZE / 2 < 5.5 * TILE; i++) s = step(level, s, { fire: R, water: NO_INPUT });
    s = run(level, s, 2);
    expect(s.buttons[0]).toBe(true);
  });
});

describe("스위치와 발판", () => {
  const gate: LevelObject = { type: "platform", channel: "a", from: [6, 4], to: [6, 1], size: [1, 3] };

  it("버튼을 밟고 있는 동안만 게이트가 열린다", () => {
    const level = makeLevel({
      fire: [3, 6],
      water: [9, 1],
      objects: [{ type: "button", channel: "a", pos: [3, 6] }, gate],
    });
    let s = run(level, createState(level), 120);
    expect(s.buttons[0]).toBe(true);
    expect(s.platforms[0]!.y).toBe(1 * TILE);
    s = run(level, s, 60, L);
    expect(s.buttons[0]).toBe(false);
    s = run(level, s, 120);
    expect(s.platforms[0]!.y).toBe(4 * TILE);
  });

  it("레버는 민 방향으로 바뀌고 그대로 유지된다", () => {
    const level = makeLevel({
      fire: [1, 6],
      water: [9, 1],
      objects: [{ type: "lever", channel: "a", pos: [3, 6] }, gate],
    });
    let s = run(level, createState(level), 40, R);
    expect(s.levers[0]).toBe(true);
    s = run(level, s, 200);
    expect(s.levers[0]).toBe(true);
    expect(s.platforms[0]!.y).toBe(1 * TILE);
  });

  it("발판 위 캐릭터는 함께 올라간다", () => {
    const level = makeLevel({
      fire: [8, 5],
      water: [1, 6],
      objects: [
        { type: "button", channel: "a", pos: [1, 6] },
        { type: "platform", channel: "a", from: [7, 6], to: [7, 3], size: [3, 1] },
      ],
    });
    const s = run(level, createState(level), 200);
    expect(s.platforms[0]!.y).toBe(3 * TILE);
    expect(bottom(s.chars.fire)).toBeCloseTo(3 * TILE, 5);
  });

  it("내려오는 게이트에 깔리지 않고 게이트가 멈춘다", () => {
    const level = makeLevel({
      fire: [6, 6],
      water: [9, 6],
      objects: [{ type: "lever", channel: "a", pos: [1, 6], initial: "right" }, { ...gate, from: [6, 1], to: [6, 4] }],
    });
    const s = run(level, createState(level), 200);
    expect(s.status).toBe("playing");
    // 발판은 한 틱 이동 거리(약 1px)보다 가까이 오면 멈춘다
    const gap = s.chars.fire.y - (s.platforms[0]!.y + 3 * TILE);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(2);
    expect(bottom(s.chars.fire)).toBe(FLOOR);
  });
});

describe("경사면", () => {
  const tiles = [
    "############",
    "#..........#",
    "#..........#",
    "#..........#",
    "#..........#",
    "#..../####.#",
    "#.../######.",
    "############",
  ];

  it("걸어서 경사를 오르고 위에 선다", () => {
    const level = makeLevel({ tiles, fire: [1, 6], water: [10, 1] });
    let s = run(level, createState(level), 10);
    for (let i = 0; i < 200 && s.chars.fire.x < 7 * TILE; i++) s = step(level, s, { fire: R, water: NO_INPUT });
    s = run(level, s, 10);
    expect(s.chars.fire.onGround).toBe(true);
    expect(bottom(s.chars.fire)).toBeCloseTo(5 * TILE, 5);
  });

  it("경사를 걸어 내려온다", () => {
    const level = makeLevel({ tiles, fire: [8, 4], water: [10, 1] });
    let s = run(level, createState(level), 30);
    expect(bottom(s.chars.fire)).toBeCloseTo(5 * TILE, 5);
    s = run(level, s, 90, L);
    expect(s.chars.fire.onGround).toBe(true);
    expect(bottom(s.chars.fire)).toBeCloseTo(FLOOR, 5);
    expect(s.chars.fire.x).toBeLessThan(3 * TILE);
  });

  it("경사면 위에서 점프할 수 있다", () => {
    const level = makeLevel({ tiles, fire: [5, 5], water: [10, 1] });
    let s = run(level, createState(level), 30);
    expect(s.chars.fire.onGround).toBe(true);
    const y0 = s.chars.fire.y;
    s = run(level, s, 10, J);
    expect(s.chars.fire.y).toBeLessThan(y0 - TILE);
  });
});
