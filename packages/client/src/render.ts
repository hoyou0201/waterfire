import {
  CHAR_H,
  CHAR_W,
  ELEMENTS,
  type Element,
  type GameState,
  type Level,
  type PlayerInfo,
  TICK_RATE,
  TILE,
  Tile,
  tileAt,
} from "@waterfire/shared";

// 임시 아트: 코드로 그린 단순 도형 (SPEC Q2)
const COLORS = {
  bg: "#1b1e26",
  wall: "#4a4f5c",
  wallTop: "#5d6372",
  lava: "#ff6b3d",
  water: "#3da5ff",
  poison: "#5fd35f",
  fire: "#ff6b3d",
  waterChar: "#3da5ff",
  text: "#e8e6e3",
  muted: "#9aa0a6",
  overlay: "rgba(10, 12, 16, 0.6)",
};

const CHAR_COLOR: Record<Element, string> = { fire: COLORS.fire, water: COLORS.waterChar };
const ELEMENT_NAME: Record<Element, string> = { fire: "불", water: "물" };
const LIQUID_COLOR: Partial<Record<Tile, string>> = {
  [Tile.Lava]: COLORS.lava,
  [Tile.Water]: COLORS.water,
  [Tile.Poison]: COLORS.poison,
};
const LIQUID_DEPTH = 10;

export interface View {
  level: Level;
  state: GameState | null;
  players: PlayerInfo[];
  me: string;
  restartProgress: number;
}

export function resize(canvas: HTMLCanvasElement, level: Level) {
  canvas.width = level.w * TILE;
  canvas.height = level.h * TILE;
}

export function draw(ctx: CanvasRenderingContext2D, v: View) {
  const { level, state } = v;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  drawTiles(ctx, level);
  if (!state) return;

  drawExits(ctx, level, state);
  drawGems(ctx, level, state);
  for (const el of ELEMENTS) drawChar(ctx, v, el);
  drawHud(ctx, v);
  drawOverlay(ctx, v);
}

function drawTiles(ctx: CanvasRenderingContext2D, level: Level) {
  for (let ty = 0; ty < level.h; ty++) {
    for (let tx = 0; tx < level.w; tx++) {
      const t = tileAt(level, tx, ty);
      if (t === Tile.Empty) continue;
      const x = tx * TILE;
      const y = ty * TILE;
      ctx.fillStyle = COLORS.wall;
      ctx.fillRect(x, y, TILE, TILE);
      const liquid = LIQUID_COLOR[t];
      if (liquid) {
        ctx.fillStyle = liquid;
        ctx.fillRect(x, y, TILE, LIQUID_DEPTH);
      } else if (tileAt(level, tx, ty - 1) === Tile.Empty) {
        ctx.fillStyle = COLORS.wallTop;
        ctx.fillRect(x, y, TILE, 4);
      }
    }
  }
}

function drawExits(ctx: CanvasRenderingContext2D, level: Level, state: GameState) {
  for (const el of ELEMENTS) {
    const door = level.exits[el];
    const x = door.x - TILE / 2;
    const y = door.y - TILE * 1.75;
    ctx.fillStyle = state.chars[el].atExit ? CHAR_COLOR[el] : COLORS.bg;
    ctx.globalAlpha = state.chars[el].atExit ? 0.35 : 1;
    ctx.fillRect(x, y, TILE, TILE * 1.75);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = CHAR_COLOR[el];
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE * 1.75 - 1.5);
  }
}

function drawGems(ctx: CanvasRenderingContext2D, level: Level, state: GameState) {
  level.gems.forEach((g, i) => {
    if (state.gems[i]) return;
    ctx.fillStyle = CHAR_COLOR[g.color];
    ctx.beginPath();
    ctx.moveTo(g.x, g.y - 9);
    ctx.lineTo(g.x + 7, g.y);
    ctx.lineTo(g.x, g.y + 9);
    ctx.lineTo(g.x - 7, g.y);
    ctx.closePath();
    ctx.fill();
  });
}

function drawChar(ctx: CanvasRenderingContext2D, v: View, el: Element) {
  const c = v.state!.chars[el];
  const dead = v.state!.status === "dead" && v.state!.deadChar === el;
  ctx.globalAlpha = dead ? 0.35 : 1;
  ctx.fillStyle = CHAR_COLOR[el];
  ctx.beginPath();
  ctx.roundRect(c.x, c.y, CHAR_W, CHAR_H, 6);
  ctx.fill();
  // 눈: 이동 방향을 본다
  const look = Math.sign(c.vx) * 3;
  ctx.fillStyle = "#fff";
  ctx.fillRect(c.x + 6 + look, c.y + 10, 4, 6);
  ctx.fillRect(c.x + 14 + look, c.y + 10, 4, 6);
  ctx.globalAlpha = 1;

  const player = v.players.find((p) => p.element === el);
  if (player) {
    ctx.fillStyle = player.sessionId === v.me ? COLORS.text : COLORS.muted;
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";
    const label = player.sessionId === v.me ? `▼ ${player.name}` : player.name;
    ctx.fillText(label, c.x + CHAR_W / 2, c.y - 6);
  }
}

function formatTime(ticks: number): string {
  const sec = ticks / TICK_RATE;
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}

function drawHud(ctx: CanvasRenderingContext2D, v: View) {
  const state = v.state!;
  ctx.fillStyle = COLORS.text;
  ctx.font = "bold 18px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(formatTime(state.tick), ctx.canvas.width / 2, 24);

  if (v.restartProgress > 0) {
    const w = 120;
    const x = ctx.canvas.width / 2 - w / 2;
    ctx.fillStyle = COLORS.overlay;
    ctx.fillRect(x, 34, w, 6);
    ctx.fillStyle = COLORS.text;
    ctx.fillRect(x, 34, w * v.restartProgress, 6);
  }
}

function drawOverlay(ctx: CanvasRenderingContext2D, v: View) {
  const state = v.state!;
  let title: string | null = null;
  let sub = "";

  if (state.status === "dead" && state.deadChar) {
    title = `${ELEMENT_NAME[state.deadChar]} 캐릭터가 쓰러졌다!`;
  } else if (state.status === "won") {
    const got = state.gems.filter(Boolean).length;
    title = "클리어!";
    sub = `${formatTime(state.tick)} · 보석 ${got}/${state.gems.length} · R 길게 눌러 다시 하기`;
  }
  if (!title) return;

  const { width, height } = ctx.canvas;
  ctx.fillStyle = COLORS.overlay;
  ctx.fillRect(0, height / 2 - 50, width, 100);
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = "center";
  ctx.font = "bold 28px system-ui, sans-serif";
  ctx.fillText(title, width / 2, height / 2 + (sub ? -4 : 10));
  if (sub) {
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(sub, width / 2, height / 2 + 24);
  }
}
