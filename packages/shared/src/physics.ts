// 사각형(AABB) 몸들의 이동과 충돌.
// - 타일: 벽·웅덩이는 사각형 충돌, 경사면은 몸의 발밑 중앙점으로 따로 처리
// - 몸: 캐릭터와 상자(동적), 이동 발판(키네마틱). 모두 서로에게 단단하다
// - 캐릭터는 상자를 옆으로 밀 수 있고, 몸 위에 올라탄 몸은 아래 몸이 옆으로 움직이면 함께 움직인다

import { STEP_UP, TILE } from "./constants.ts";
import { type Level, Tile, isSlope, isSolid, tileAt } from "./level.ts";

export type BodyKind = "char" | "box" | "plat";

export interface Body {
  kind: BodyKind;
  /** 위치(좌상단 px)를 담은 상태 객체. 이동하면 직접 바꾼다 */
  pos: { x: number; y: number };
  w: number;
  h: number;
}

export interface World {
  level: Level;
  bodies: Body[];
}

/** 이 정도 차이는 "맞닿아 있다"로 본다 (부동소수 오차 흡수) */
const TOUCH = 0.01;

/** moveAxis가 요청한 거리를 다 못 갔는가 (부동소수 오차는 무시) */
export function wasBlocked(requested: number, moved: number): boolean {
  return Math.abs(requested - moved) > 1e-9;
}

type Axis = "x" | "y";

interface MoveOptions {
  /** 캐릭터가 상자를 밀 수 있는가 */
  push: boolean;
  /** 옆으로 움직일 때 위에 탄 몸도 함께 옮기는가 */
  carry: boolean;
  /** 땅에 서 있어서 낮은 타일 턱을 넘을 수 있는가 */
  stepUp: boolean;
  /** 충돌에서 제외할 몸 */
  ignore?: ReadonlySet<Body>;
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 - TOUCH && a1 > b0 + TOUCH;
}

function bodiesOverlap(a: Body, b: Body): boolean {
  return (
    rangesOverlap(a.pos.x, a.pos.x + a.w, b.pos.x, b.pos.x + b.w) &&
    rangesOverlap(a.pos.y, a.pos.y + a.h, b.pos.y, b.pos.y + b.h)
  );
}

/** b의 윗면에 서 있는 동적 몸들 */
export function ridersOf(world: World, b: Body): Body[] {
  return world.bodies.filter(
    (r) =>
      r !== b &&
      r.kind !== "plat" &&
      Math.abs(r.pos.y + r.h - b.pos.y) < TOUCH &&
      rangesOverlap(r.pos.x, r.pos.x + r.w, b.pos.x, b.pos.x + b.w),
  );
}

/** 사각형과 겹치는 단단한 타일이나 몸이 있는가 */
function blocked(world: World, x: number, y: number, w: number, h: number, self: Body, ignore?: ReadonlySet<Body>): boolean {
  const tx0 = Math.floor(x / TILE);
  const tx1 = Math.ceil((x + w) / TILE) - 1;
  const ty0 = Math.floor(y / TILE);
  const ty1 = Math.ceil((y + h) / TILE) - 1;
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (!isSolid(tileAt(world.level, tx, ty))) continue;
      if (rangesOverlap(x, x + w, tx * TILE, (tx + 1) * TILE) && rangesOverlap(y, y + h, ty * TILE, (ty + 1) * TILE)) return true;
    }
  }
  return world.bodies.some(
    (o) =>
      o !== self &&
      !ignore?.has(o) &&
      rangesOverlap(x, x + w, o.pos.x, o.pos.x + o.w) &&
      rangesOverlap(y, y + h, o.pos.y, o.pos.y + o.h),
  );
}

/**
 * 몸을 한 축으로 d만큼 옮기되 막히면 닿는 곳까지만 옮긴다. 실제로 움직인 거리를 돌려준다.
 */
export function moveAxis(world: World, b: Body, axis: Axis, d: number, opts: MoveOptions): number {
  if (d === 0) return 0;
  const riders = opts.carry && axis === "x" ? ridersOf(world, b) : [];
  const dir = Math.sign(d);
  // 진행 방향 앞쪽 면과 옆 범위
  const lead = axis === "x" ? (dir > 0 ? b.pos.x + b.w : b.pos.x) : dir > 0 ? b.pos.y + b.h : b.pos.y;
  const side0 = axis === "x" ? b.pos.y : b.pos.x;
  const side1 = side0 + (axis === "x" ? b.h : b.w);
  const bottom = b.pos.y + b.h;
  let allowed = Math.abs(d);

  // 타일
  const reach = lead + d;
  const [a0, a1] = dir > 0 ? [lead, reach] : [reach, lead];
  const t0 = Math.floor(a0 / TILE);
  const t1 = Math.ceil(a1 / TILE) - 1;
  const s0 = Math.floor(side0 / TILE);
  const s1 = Math.ceil(side1 / TILE) - 1;
  for (let t = t0; t <= t1; t++) {
    for (let s = s0; s <= s1; s++) {
      const [tx, ty] = axis === "x" ? [t, s] : [s, t];
      if (!isSolid(tileAt(world.level, tx, ty))) continue;
      if (!rangesOverlap(side0, side1, s * TILE, (s + 1) * TILE)) continue;
      // 발목 높이의 턱은 넘는다 (아래에서 들어 올린다)
      if (opts.stepUp && axis === "x" && ty * TILE >= bottom - STEP_UP && ty * TILE < bottom) continue;
      const face = dir > 0 ? t * TILE : (t + 1) * TILE;
      const gap = (face - lead) * dir;
      if (gap >= -TOUCH) allowed = Math.min(allowed, Math.max(0, gap));
    }
  }

  // 다른 몸
  for (const o of world.bodies) {
    if (o === b || opts.ignore?.has(o)) continue;
    const o0 = axis === "x" ? o.pos.y : o.pos.x;
    const o1 = o0 + (axis === "x" ? o.h : o.w);
    if (!rangesOverlap(side0, side1, o0, o1)) continue;
    const near = () => (axis === "x" ? (dir > 0 ? o.pos.x : o.pos.x + o.w) : dir > 0 ? o.pos.y : o.pos.y + o.h);
    let gap = (near() - lead) * dir;
    if (gap < -TOUCH || gap >= allowed) continue;
    if (opts.push && axis === "x" && b.kind === "char" && o.kind === "box") {
      moveAxis(world, o, "x", (allowed - Math.max(0, gap)) * dir, { push: false, carry: true, stepUp: false, ignore: opts.ignore });
      gap = (near() - lead) * dir;
    }
    allowed = Math.min(allowed, Math.max(0, gap));
  }

  const moved = allowed * dir;
  if (axis === "x") b.pos.x += moved;
  else b.pos.y += moved;

  if (opts.stepUp && axis === "x" && moved !== 0) liftOntoStep(world, b, opts.ignore);
  for (const r of riders) moveAxis(world, r, "x", moved, { push: false, carry: true, stepUp: true, ignore: opts.ignore });
  return moved;
}

/** 턱을 넘으며 타일에 살짝 파묻혔으면 그 위로 올린다. 머리 위가 막혀 있으면 그대로 둔다 */
function liftOntoStep(world: World, b: Body, ignore?: ReadonlySet<Body>) {
  const bottom = b.pos.y + b.h;
  const tx0 = Math.floor(b.pos.x / TILE);
  const tx1 = Math.ceil((b.pos.x + b.w) / TILE) - 1;
  const ty = Math.floor((bottom - TOUCH) / TILE);
  let top = bottom;
  for (let tx = tx0; tx <= tx1; tx++) {
    if (!isSolid(tileAt(world.level, tx, ty))) continue;
    if (!rangesOverlap(b.pos.x, b.pos.x + b.w, tx * TILE, (tx + 1) * TILE)) continue;
    if (ty * TILE >= bottom - STEP_UP) top = Math.min(top, ty * TILE);
  }
  if (top < bottom && !blocked(world, b.pos.x, top - b.h, b.w, b.h, b, ignore)) b.pos.y = top - b.h;
}

/** 발밑 중앙(cx)에 경사면이 있으면 그 표면 높이(px) */
export function slopeSurface(level: Level, cx: number, bottom: number): number | null {
  const tx = Math.floor(cx / TILE);
  const ty0 = Math.floor((bottom - STEP_UP) / TILE);
  const ty1 = Math.floor((bottom + STEP_UP) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) {
    const t = tileAt(level, tx, ty);
    if (!isSlope(t)) continue;
    const lx = cx - tx * TILE;
    return ty * TILE + (t === Tile.SlopeUp ? TILE - lx : lx);
  }
  return null;
}

/**
 * 경사면 위에 몸을 붙인다. 경사를 오르내리는 중이면 표면 높이로 옮기고 true.
 * maxDrop: 아래쪽으로 몇 px까지 끌어내릴지 (걸어 내려갈 때 공중에 뜨지 않게)
 */
export function snapToSlope(world: World, b: Body, maxDrop: number, ignore?: ReadonlySet<Body>): boolean {
  const bottom = b.pos.y + b.h;
  const sy = slopeSurface(world.level, b.pos.x + b.w / 2, bottom);
  if (sy === null) return false;
  const diff = sy - bottom;
  if (diff < -STEP_UP || diff > maxDrop) return false;
  if (diff !== 0 && blocked(world, b.pos.x, sy - b.h, b.w, b.h, b, ignore)) return false;
  b.pos.y = sy - b.h;
  return true;
}

/**
 * 키네마틱 발판을 한 축으로 옮긴다. 위에 탄 몸은 함께 옮기고, 앞을 막는 몸은 민다.
 * 밀린 몸이 더 갈 곳이 없으면(끼임) 발판은 이번 틱에 움직이지 않는다.
 */
export function movePlatform(world: World, p: Body, axis: Axis, d: number): boolean {
  if (d === 0) return true;
  const saved = world.bodies.map((b) => ({ x: b.pos.x, y: b.pos.y }));
  const restore = () => world.bodies.forEach((b, i) => Object.assign(b.pos, saved[i]));

  const nx = p.pos.x + (axis === "x" ? d : 0);
  const ny = p.pos.y + (axis === "y" ? d : 0);
  const group = new Set<Body>();
  const add = (b: Body) => {
    if (b.kind === "plat" || group.has(b)) return;
    group.add(b);
    for (const r of ridersOf(world, b)) add(r);
  };
  for (const r of ridersOf(world, p)) add(r);
  for (const b of world.bodies) {
    if (b.kind !== "plat" && rangesOverlap(nx, nx + p.w, b.pos.x, b.pos.x + b.w) && rangesOverlap(ny, ny + p.h, b.pos.y, b.pos.y + b.h)) add(b);
  }

  // 진행 방향 맨 앞의 몸부터 옮겨야 서로 막지 않는다
  const dir = Math.sign(d);
  const key = (b: Body) => (axis === "x" ? b.pos.x : b.pos.y) * dir;
  const ordered = [...group].sort((a, b) => key(b) - key(a));
  const ignore = new Set([p]);
  for (const b of ordered) moveAxis(world, b, axis, d, { push: false, carry: false, stepUp: false, ignore });

  if (axis === "x") p.pos.x = nx;
  else p.pos.y = ny;
  if (world.bodies.some((b) => b !== p && bodiesOverlap(b, p))) {
    restore();
    return false;
  }
  return true;
}
