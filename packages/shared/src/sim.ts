// 결정론적 게임 시뮬레이션. 서버와 클라이언트가 같은 코드를 쓴다.
// DOM·Node API에 의존하지 않고, 같은 입력이면 항상 같은 결과를 낸다.

import {
  AIR_CONTROL,
  CHAR_H,
  CHAR_W,
  COYOTE_TICKS,
  DEATH_RESET_TICKS,
  DT,
  GRAVITY,
  GROUND_ACCEL,
  GROUND_DECEL,
  JUMP_BUFFER_TICKS,
  JUMP_CUT,
  JUMP_SPEED,
  LIQUID_INSET,
  MAX_FALL_SPEED,
  MAX_RUN_SPEED,
  TILE,
} from "./constants.ts";
import { type Element, type Level, Tile, isLiquid, isSolid, tileAt } from "./level.ts";

export const ELEMENTS: readonly Element[] = ["fire", "water"];

export interface Input {
  left: boolean;
  right: boolean;
  jump: boolean;
}

export const NO_INPUT: Input = { left: false, right: false, jump: false };

export function encodeInput(i: Input): number {
  return (i.left ? 1 : 0) | (i.right ? 2 : 0) | (i.jump ? 4 : 0);
}

export function decodeInput(bits: number): Input {
  return { left: (bits & 1) !== 0, right: (bits & 2) !== 0, jump: (bits & 4) !== 0 };
}

export interface CharState {
  /** 히트박스 좌상단(px) */
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  /** 땅에서 떨어진 뒤에도 점프를 허용하는 남은 틱 */
  coyote: number;
  /** 착지 직전에 누른 점프를 기억하는 남은 틱 */
  jumpBuffer: number;
  jumpHeld: boolean;
  jumpCut: boolean;
  atExit: boolean;
}

export type Status = "playing" | "dead" | "won";

export interface GameState {
  /** 레벨 진행 시간(틱). playing 상태에서만 흐른다 */
  tick: number;
  status: Status;
  /** status가 바뀐 뒤 지난 틱 */
  statusTicks: number;
  deadChar: Element | null;
  chars: Record<Element, CharState>;
  /** 레벨의 gems와 같은 순서. 획득했으면 true */
  gems: boolean[];
}

function spawnChar(level: Level, el: Element): CharState {
  const s = level.spawns[el];
  return {
    x: s.x - CHAR_W / 2,
    y: s.y - CHAR_H,
    vx: 0,
    vy: 0,
    onGround: false,
    coyote: 0,
    jumpBuffer: 0,
    jumpHeld: false,
    jumpCut: false,
    atExit: false,
  };
}

export function createState(level: Level): GameState {
  return {
    tick: 0,
    status: "playing",
    statusTicks: 0,
    deadChar: null,
    chars: { fire: spawnChar(level, "fire"), water: spawnChar(level, "water") },
    gems: level.gems.map(() => false),
  };
}

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    chars: { fire: { ...s.chars.fire }, water: { ...s.chars.water } },
    gems: [...s.gems],
  };
}

/** 길이 size인 구간이 걸치는 타일 범위. 끝 경계에 딱 닿기만 하는 칸은 제외한다 */
function span(pos: number, size: number): [number, number] {
  return [Math.floor(pos / TILE), Math.ceil((pos + size) / TILE) - 1];
}

function approach(v: number, target: number, delta: number): number {
  return v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
}

function moveX(level: Level, c: CharState): void {
  c.x += c.vx * DT;
  if (c.vx === 0) return;
  const [x0, x1] = span(c.x, CHAR_W);
  const [y0, y1] = span(c.y, CHAR_H);
  let hit = false;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!isSolid(tileAt(level, tx, ty))) continue;
      hit = true;
      if (c.vx > 0) c.x = Math.min(c.x, tx * TILE - CHAR_W);
      else c.x = Math.max(c.x, (tx + 1) * TILE);
    }
  }
  if (hit) c.vx = 0;
}

function moveY(level: Level, c: CharState): void {
  c.y += c.vy * DT;
  c.onGround = false;
  if (c.vy === 0) return;
  const [x0, x1] = span(c.x, CHAR_W);
  const [y0, y1] = span(c.y, CHAR_H);
  let hit = false;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!isSolid(tileAt(level, tx, ty))) continue;
      hit = true;
      if (c.vy > 0) c.y = Math.min(c.y, ty * TILE - CHAR_H);
      else c.y = Math.max(c.y, (ty + 1) * TILE);
    }
  }
  if (hit) {
    if (c.vy > 0) c.onGround = true;
    c.vy = 0;
  }
}

function stepChar(level: Level, c: CharState, input: Input): void {
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let accel = dir !== 0 ? GROUND_ACCEL : GROUND_DECEL;
  if (!c.onGround) accel *= AIR_CONTROL;
  c.vx = approach(c.vx, dir * MAX_RUN_SPEED, accel * DT);

  // 점프: 입력 버퍼 + 코요테 타임
  if (input.jump && !c.jumpHeld) c.jumpBuffer = JUMP_BUFFER_TICKS;
  else if (c.jumpBuffer > 0) c.jumpBuffer--;
  if (c.onGround) c.coyote = COYOTE_TICKS;
  else if (c.coyote > 0) c.coyote--;
  if (c.jumpBuffer > 0 && c.coyote > 0) {
    c.vy = -JUMP_SPEED;
    c.jumpBuffer = 0;
    c.coyote = 0;
    c.jumpCut = false;
  }
  // 가변 점프: 상승 중에 키를 떼면 상승 속도를 깎는다
  if (!input.jump && c.vy < 0 && !c.jumpCut) {
    c.vy *= JUMP_CUT;
    c.jumpCut = true;
  }
  c.jumpHeld = input.jump;

  c.vy = Math.min(c.vy + GRAVITY * DT, MAX_FALL_SPEED);
  moveX(level, c);
  moveY(level, c);
}

/** 발밑 웅덩이 중 이 캐릭터를 죽이는 것이 있는가 */
function touchesDeadlyLiquid(level: Level, c: CharState, el: Element): boolean {
  if (!c.onGround) return false;
  const ty = Math.round((c.y + CHAR_H) / TILE);
  const [x0, x1] = span(c.x, CHAR_W);
  for (let tx = x0; tx <= x1; tx++) {
    const t = tileAt(level, tx, ty);
    if (!isLiquid(t)) continue;
    const safe = (el === "fire" && t === Tile.Lava) || (el === "water" && t === Tile.Water);
    if (safe) continue;
    const left = tx * TILE + LIQUID_INSET;
    const right = (tx + 1) * TILE - LIQUID_INSET;
    if (c.x < right && c.x + CHAR_W > left) return true;
  }
  return false;
}

const GEM_HALF = 8;
/** 출구 판정 여유(px). 캐릭터가 문 폭 안에 이만큼 삐져나와도 인정한다 */
const EXIT_SLACK = 4;

function isAtExit(level: Level, c: CharState, el: Element): boolean {
  const door = level.exits[el];
  return (
    c.onGround &&
    Math.abs(c.y + CHAR_H - door.y) < 1 &&
    c.x >= door.x - TILE / 2 - EXIT_SLACK &&
    c.x + CHAR_W <= door.x + TILE / 2 + EXIT_SLACK
  );
}

/** 한 틱 진행한 새 상태를 돌려준다. 입력 상태는 바꾸지 않는다 */
export function step(level: Level, prev: GameState, inputs: Record<Element, Input>): GameState {
  if (prev.status === "dead") {
    if (prev.statusTicks + 1 >= DEATH_RESET_TICKS) return createState(level);
    return { ...prev, statusTicks: prev.statusTicks + 1 };
  }
  if (prev.status === "won") return { ...prev, statusTicks: prev.statusTicks + 1 };

  const s = cloneState(prev);
  s.tick++;

  for (const el of ELEMENTS) stepChar(level, s.chars[el], inputs[el]);

  for (const el of ELEMENTS) {
    const c = s.chars[el];
    level.gems.forEach((g, i) => {
      if (s.gems[i] || g.color !== el) return;
      if (c.x < g.x + GEM_HALF && c.x + CHAR_W > g.x - GEM_HALF && c.y < g.y + GEM_HALF && c.y + CHAR_H > g.y - GEM_HALF) {
        s.gems[i] = true;
      }
    });
    c.atExit = isAtExit(level, c, el);
  }

  const dead = ELEMENTS.find((el) => touchesDeadlyLiquid(level, s.chars[el], el));
  if (dead) {
    s.status = "dead";
    s.statusTicks = 0;
    s.deadChar = dead;
  } else if (s.chars.fire.atExit && s.chars.water.atExit) {
    s.status = "won";
    s.statusTicks = 0;
  }
  return s;
}
