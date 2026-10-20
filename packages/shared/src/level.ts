import { TILE } from "./constants.ts";

export type Element = "fire" | "water";

export const Tile = {
  Empty: 0,
  Wall: 1,
  Lava: 2,
  Water: 3,
  Poison: 4,
} as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

export type Vec2 = [number, number];

export type LevelObject =
  | { type: "gem"; color: Element; pos: Vec2 }
  | { type: "exit"; color: Element; pos: Vec2 };

export interface LevelData {
  id: string;
  name: string;
  targetTime: number;
  tiles: string[];
  spawns: Record<Element, Vec2>;
  objects: LevelObject[];
}

export interface Level {
  id: string;
  name: string;
  targetTime: number;
  /** 타일 단위 크기 */
  w: number;
  h: number;
  tiles: Uint8Array;
  /** 스폰·출구 위치는 발밑 중앙(px) 기준 */
  spawns: Record<Element, { x: number; y: number }>;
  gems: { color: Element; x: number; y: number }[];
  exits: Record<Element, { x: number; y: number }>;
}

const TILE_CHARS: Record<string, Tile> = {
  ".": Tile.Empty,
  "#": Tile.Wall,
  "=": Tile.Wall,
  // 경사면은 아직 지원하지 않아 벽으로 취급한다
  "/": Tile.Wall,
  "\\": Tile.Wall,
  L: Tile.Lava,
  W: Tile.Water,
  G: Tile.Poison,
};

export function parseLevel(data: LevelData): Level {
  const h = data.tiles.length;
  const w = data.tiles[0]?.length ?? 0;
  const tiles = new Uint8Array(w * h);
  data.tiles.forEach((row, y) => {
    if (row.length !== w) throw new Error(`level ${data.id}: row ${y} has length ${row.length}, expected ${w}`);
    for (let x = 0; x < w; x++) {
      const t = TILE_CHARS[row[x]!];
      if (t === undefined) throw new Error(`level ${data.id}: unknown tile '${row[x]}' at ${x},${y}`);
      tiles[y * w + x] = t;
    }
  });

  // 타일 좌표 [x, y]는 "그 칸 바닥에 서 있다"는 뜻으로 쓴다
  const foot = ([x, y]: Vec2) => ({ x: (x + 0.5) * TILE, y: (y + 1) * TILE });

  const gems: Level["gems"] = [];
  const exits: Partial<Level["exits"]> = {};
  for (const o of data.objects) {
    if (o.type === "gem") gems.push({ color: o.color, x: (o.pos[0] + 0.5) * TILE, y: (o.pos[1] + 0.5) * TILE });
    else exits[o.color] = foot(o.pos);
  }
  if (!exits.fire || !exits.water) throw new Error(`level ${data.id}: needs one exit per element`);

  return {
    id: data.id,
    name: data.name,
    targetTime: data.targetTime,
    w,
    h,
    tiles,
    spawns: { fire: foot(data.spawns.fire), water: foot(data.spawns.water) },
    gems,
    exits: exits as Level["exits"],
  };
}

export function tileAt(level: Level, tx: number, ty: number): Tile {
  if (tx < 0 || ty < 0 || tx >= level.w || ty >= level.h) return Tile.Wall;
  return level.tiles[ty * level.w + tx] as Tile;
}

/** 웅덩이 타일도 발판 역할을 한다. 액체 표면은 타일 윗면과 같은 높이다 */
export function isSolid(t: Tile): boolean {
  return t !== Tile.Empty;
}

export function isLiquid(t: Tile): boolean {
  return t === Tile.Lava || t === Tile.Water || t === Tile.Poison;
}
