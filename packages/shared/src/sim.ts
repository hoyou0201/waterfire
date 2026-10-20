// 결정론적 게임 시뮬레이션. 서버와 클라이언트가 같은 코드를 쓴다.
// DOM·Node API에 의존하지 않고, 같은 입력이면 항상 같은 결과를 낸다.

import {
  AIR_CONTROL,
  BOX_SIZE,
  BUTTON_W,
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
import { type Element, type Level, Tile, isLiquid, tileAt } from "./level.ts";
import { type Body, type World, moveAxis, movePlatform, snapToSlope, wasBlocked } from "./physics.ts";

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

export interface BoxState {
  x: number;
  y: number;
  vy: number;
}

export interface PlatformState {
  x: number;
  y: number;
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
  /** 아래 배열들은 레벨의 같은 이름 배열과 순서가 같다 */
  gems: boolean[];
  levers: boolean[];
  buttons: boolean[];
  platforms: PlatformState[];
  boxes: BoxState[];
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
    levers: level.levers.map((l) => l.initialOn),
    buttons: level.buttons.map(() => false),
    platforms: level.platforms.map((p) => ({ ...p.from })),
    boxes: level.boxes.map((b) => ({ ...b, vy: 0 })),
  };
}

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    chars: { fire: { ...s.chars.fire }, water: { ...s.chars.water } },
    gems: [...s.gems],
    levers: [...s.levers],
    buttons: [...s.buttons],
    platforms: s.platforms.map((p) => ({ ...p })),
    boxes: s.boxes.map((b) => ({ ...b })),
  };
}

/** 채널별로 켜져 있는가. 같은 채널의 스위치 중 하나라도 켜지면 켜진다 */
export function activeChannels(level: Level, s: GameState): boolean[] {
  const on = level.channels.map(() => false);
  level.levers.forEach((l, i) => {
    if (s.levers[i]) on[l.channel] = true;
  });
  level.buttons.forEach((b, i) => {
    if (s.buttons[i]) on[b.channel] = true;
  });
  return on;
}

interface Bodies {
  world: World;
  chars: Record<Element, Body>;
  boxes: Body[];
  platforms: Body[];
}

function buildWorld(level: Level, s: GameState): Bodies {
  const chars = {
    fire: { kind: "char", pos: s.chars.fire, w: CHAR_W, h: CHAR_H },
    water: { kind: "char", pos: s.chars.water, w: CHAR_W, h: CHAR_H },
  } satisfies Record<Element, Body>;
  const boxes: Body[] = s.boxes.map((b) => ({ kind: "box", pos: b, w: BOX_SIZE, h: BOX_SIZE }));
  const platforms: Body[] = s.platforms.map((p, i) => ({ kind: "plat", pos: p, w: level.platforms[i]!.w, h: level.platforms[i]!.h }));
  return { world: { level, bodies: [...platforms, chars.fire, chars.water, ...boxes] }, chars, boxes, platforms };
}

function approach(v: number, target: number, delta: number): number {
  return v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
}

function stepPlatforms(level: Level, s: GameState, b: Bodies) {
  const active = activeChannels(level, s);
  level.platforms.forEach((def, i) => {
    const p = s.platforms[i]!;
    const target = active[def.channel] ? def.to : def.from;
    const step = def.speed * DT;
    const dx = approach(p.x, target.x, step) - p.x;
    const dy = approach(p.y, target.y, step) - p.y;
    movePlatform(b.world, b.platforms[i]!, "x", dx);
    movePlatform(b.world, b.platforms[i]!, "y", dy);
  });
}

/** 수직 이동 후 착지·천장 판정과 경사면 붙이기 */
function fall(world: World, body: Body, vy: number): { vy: number; onGround: boolean } {
  const dy = vy * DT;
  const moved = moveAxis(world, body, "y", dy, { push: false, carry: false, stepUp: false });
  let onGround = false;
  if (wasBlocked(dy, moved)) {
    if (dy > 0) onGround = true;
    vy = 0;
  }
  if (vy >= 0 && snapToSlope(world, body, 0)) {
    onGround = true;
    vy = 0;
  }
  return { vy, onGround };
}

function stepChar(world: World, body: Body, c: CharState, input: Input): void {
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

  const wasGrounded = c.onGround;
  const dx = c.vx * DT;
  const movedX = moveAxis(world, body, "x", dx, { push: true, carry: true, stepUp: wasGrounded });
  if (wasBlocked(dx, movedX)) c.vx = 0;
  if (wasGrounded && c.vy >= 0) snapToSlope(world, body, Math.abs(dx) + 2);

  const r = fall(world, body, c.vy);
  c.vy = r.vy;
  c.onGround = r.onGround;
}

function stepBox(world: World, body: Body, box: BoxState) {
  box.vy = Math.min(box.vy + GRAVITY * DT, MAX_FALL_SPEED);
  box.vy = fall(world, body, box.vy).vy;
}

function overlapsRect(c: { x: number; y: number }, w: number, h: number, x0: number, y0: number, x1: number, y1: number) {
  return c.x < x1 && c.x + w > x0 && c.y < y1 && c.y + h > y0;
}

function stepSwitches(level: Level, s: GameState, b: Bodies) {
  level.levers.forEach((l, i) => {
    for (const el of ELEMENTS) {
      const c = s.chars[el];
      if (c.vx === 0 || !overlapsRect(c, CHAR_W, CHAR_H, l.x - TILE / 4, l.y - TILE, l.x + TILE / 4, l.y)) continue;
      s.levers[i] = c.vx > 0;
    }
  });
  level.buttons.forEach((btn, i) => {
    s.buttons[i] = b.world.bodies.some(
      (body) =>
        body.kind !== "plat" &&
        Math.abs(body.pos.y + body.h - btn.y) < 0.5 &&
        body.pos.x < btn.x + BUTTON_W / 2 &&
        body.pos.x + body.w > btn.x - BUTTON_W / 2,
    );
  });
}

/** 발밑 웅덩이 중 이 캐릭터를 죽이는 것이 있는가 */
function touchesDeadlyLiquid(level: Level, c: CharState, el: Element): boolean {
  if (!c.onGround) return false;
  const bottom = c.y + CHAR_H;
  const ty = Math.round(bottom / TILE);
  if (Math.abs(bottom - ty * TILE) > 0.5) return false;
  const tx0 = Math.floor(c.x / TILE);
  const tx1 = Math.ceil((c.x + CHAR_W) / TILE) - 1;
  for (let tx = tx0; tx <= tx1; tx++) {
    const t = tileAt(level, tx, ty);
    if (!isLiquid(t)) continue;
    const safe = (el === "fire" && t === Tile.Lava) || (el === "water" && t === Tile.Water);
    if (safe) continue;
    if (c.x < (tx + 1) * TILE - LIQUID_INSET && c.x + CHAR_W > tx * TILE + LIQUID_INSET) return true;
  }
  return false;
}

const GEM_HALF = 8;
/** 출구 판정 여유(px). 캐릭터가 문 폭 밖으로 이만큼 삐져나와도 인정한다 */
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

/** 한 틱 진행한 새 상태를 돌려준다. 이전 상태는 바꾸지 않는다 */
export function step(level: Level, prev: GameState, inputs: Record<Element, Input>): GameState {
  if (prev.status === "dead") {
    if (prev.statusTicks + 1 >= DEATH_RESET_TICKS) return createState(level);
    return { ...prev, statusTicks: prev.statusTicks + 1 };
  }
  if (prev.status === "won") return { ...prev, statusTicks: prev.statusTicks + 1 };

  const s = cloneState(prev);
  s.tick++;
  const b = buildWorld(level, s);

  stepPlatforms(level, s, b);
  for (const el of ELEMENTS) stepChar(b.world, b.chars[el], s.chars[el], inputs[el]);
  s.boxes.forEach((box, i) => stepBox(b.world, b.boxes[i]!, box));
  stepSwitches(level, s, b);

  for (const el of ELEMENTS) {
    const c = s.chars[el];
    level.gems.forEach((g, i) => {
      if (s.gems[i] || g.color !== el) return;
      if (overlapsRect(c, CHAR_W, CHAR_H, g.x - GEM_HALF, g.y - GEM_HALF, g.x + GEM_HALF, g.y + GEM_HALF)) s.gems[i] = true;
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
