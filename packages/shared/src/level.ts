import { BOX_SIZE, PLATFORM_SPEED, TILE } from "./constants.ts";

export type Element = "fire" | "water";

export const Tile = {
  Empty: 0,
  Wall: 1,
  Lava: 2,
  Water: 3,
  Poison: 4,
  /** '/' 오른쪽으로 올라가는 45° 경사 */
  SlopeUp: 5,
  /** '\' 왼쪽으로 올라가는 45° 경사 */
  SlopeDown: 6,
} as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

export type Vec2 = [number, number];

/** 레벨 JSON의 오브젝트. 좌표는 모두 타일 단위 */
export type LevelObject =
  | { type: "gem"; color: Element; pos: Vec2 }
  | { type: "exit"; color: Element; pos: Vec2 }
  | { type: "lever"; channel: string; pos: Vec2; initial?: "left" | "right" }
  | { type: "button"; channel: string; pos: Vec2 }
  /** from/to는 발판 좌상단 타일, size는 타일 단위 [w, h], speed는 타일/초 */
  | { type: "platform"; channel: string; from: Vec2; to: Vec2; size: Vec2; speed?: number }
  | { type: "box"; pos: Vec2 };

export interface LevelData {
  id: string;
  name: string;
  /** 레벨 선택 화면에 보여줄 한 줄 힌트 */
  hint?: string;
  targetTime: number;
  tiles: string[];
  spawns: Record<Element, Vec2>;
  objects: LevelObject[];
}

export interface Point {
  x: number;
  y: number;
}

export interface Level {
  id: string;
  name: string;
  hint: string;
  targetTime: number;
  /** 타일 단위 크기 */
  w: number;
  h: number;
  tiles: Uint8Array;
  /** 스폰·출구·레버·버튼 위치는 발밑 중앙(px) 기준 */
  spawns: Record<Element, Point>;
  exits: Record<Element, Point>;
  gems: { color: Element; x: number; y: number }[];
  /** 채널 이름 목록. 스위치·발판은 이 배열의 인덱스로 채널을 가리킨다 */
  channels: string[];
  levers: { channel: number; x: number; y: number; initialOn: boolean }[];
  buttons: { channel: number; x: number; y: number }[];
  /** 위치는 좌상단(px), 속도는 px/초 */
  platforms: { channel: number; from: Point; to: Point; w: number; h: number; speed: number }[];
  /** 상자 초기 위치(좌상단 px) */
  boxes: Point[];
}

const TILE_CHARS: Record<string, Tile> = {
  ".": Tile.Empty,
  "#": Tile.Wall,
  "=": Tile.Wall,
  "/": Tile.SlopeUp,
  "\\": Tile.SlopeDown,
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
  const foot = ([x, y]: Vec2): Point => ({ x: (x + 0.5) * TILE, y: (y + 1) * TILE });
  const corner = ([x, y]: Vec2): Point => ({ x: x * TILE, y: y * TILE });

  const channels: string[] = [];
  const channel = (name: string) => {
    const i = channels.indexOf(name);
    if (i !== -1) return i;
    channels.push(name);
    return channels.length - 1;
  };

  const level: Level = {
    id: data.id,
    name: data.name,
    hint: data.hint ?? "",
    targetTime: data.targetTime,
    w,
    h,
    tiles,
    spawns: { fire: foot(data.spawns.fire), water: foot(data.spawns.water) },
    exits: {} as Level["exits"],
    gems: [],
    channels,
    levers: [],
    buttons: [],
    platforms: [],
    boxes: [],
  };

  for (const o of data.objects) {
    switch (o.type) {
      case "gem":
        level.gems.push({ color: o.color, x: (o.pos[0] + 0.5) * TILE, y: (o.pos[1] + 0.5) * TILE });
        break;
      case "exit":
        level.exits[o.color] = foot(o.pos);
        break;
      case "lever":
        level.levers.push({ channel: channel(o.channel), ...foot(o.pos), initialOn: o.initial === "right" });
        break;
      case "button":
        level.buttons.push({ channel: channel(o.channel), ...foot(o.pos) });
        break;
      case "platform":
        level.platforms.push({
          channel: channel(o.channel),
          from: corner(o.from),
          to: corner(o.to),
          w: o.size[0] * TILE,
          h: o.size[1] * TILE,
          speed: (o.speed ?? PLATFORM_SPEED) * TILE,
        });
        break;
      case "box": {
        const f = foot(o.pos);
        level.boxes.push({ x: f.x - BOX_SIZE / 2, y: f.y - BOX_SIZE });
        break;
      }
    }
  }
  if (!level.exits.fire || !level.exits.water) throw new Error(`level ${data.id}: needs one exit per element`);
  return level;
}

export function tileAt(level: Level, tx: number, ty: number): Tile {
  if (tx < 0 || ty < 0 || tx >= level.w || ty >= level.h) return Tile.Wall;
  return level.tiles[ty * level.w + tx] as Tile;
}

/** 사각형 충돌 대상인 타일. 웅덩이도 발판 역할을 한다(액체 표면 = 타일 윗면). 경사면은 따로 처리 */
export function isSolid(t: Tile): boolean {
  return t === Tile.Wall || isLiquid(t);
}

export function isLiquid(t: Tile): boolean {
  return t === Tile.Lava || t === Tile.Water || t === Tile.Poison;
}

export function isSlope(t: Tile): boolean {
  return t === Tile.SlopeUp || t === Tile.SlopeDown;
}
