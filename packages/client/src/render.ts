import {
  BOX_SIZE,
  BUTTON_W,
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
  activeChannels,
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
  box: "#a07a4f",
  boxEdge: "#7a5a37",
  text: "#e8e6e3",
  muted: "#9aa0a6",
  overlay: "rgba(10, 12, 16, 0.6)",
};

/** 스위치·발판 채널 색. 불·물 색과 겹치지 않게 고른다 */
const CHANNEL_COLORS = ["#f2c94c", "#bb6bd9", "#e0e0e0", "#f78fb3", "#2bd9c4", "#c9a227"];

export const CHAR_COLOR: Record<Element, string> = { fire: COLORS.lava, water: COLORS.water };
export const ELEMENT_NAME: Record<Element, string> = { fire: "불", water: "물" };
const LIQUID_COLOR: Partial<Record<Tile, string>> = {
  [Tile.Lava]: COLORS.lava,
  [Tile.Water]: COLORS.water,
  [Tile.Poison]: COLORS.poison,
};
const LIQUID_DEPTH = 10;

export interface View {
  level: Level;
  state: GameState;
  /** 사망·클리어 표시는 서버가 확정한 상태로 한다 */
  authStatus: GameState["status"];
  authDead: Element | null;
  players: PlayerInfo[];
  me: string;
  /** 카운트다운 중이면 남은 초 */
  countdown: number | null;
  restartProgress: number;
}

export function resize(canvas: HTMLCanvasElement, level: Level) {
  if (canvas.width !== level.w * TILE) canvas.width = level.w * TILE;
  if (canvas.height !== level.h * TILE) canvas.height = level.h * TILE;
}

export function draw(ctx: CanvasRenderingContext2D, v: View) {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  drawTiles(ctx, v.level);
  drawExits(ctx, v);
  drawSwitches(ctx, v);
  drawPlatforms(ctx, v);
  drawBoxes(ctx, v);
  drawGems(ctx, v);
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
      if (t === Tile.SlopeUp || t === Tile.SlopeDown) {
        ctx.beginPath();
        ctx.moveTo(x, y + TILE);
        ctx.lineTo(x + TILE, y + TILE);
        ctx.lineTo(t === Tile.SlopeUp ? x + TILE : x, y);
        ctx.closePath();
        ctx.fill();
        continue;
      }
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

function drawExits(ctx: CanvasRenderingContext2D, { level, state }: View) {
  for (const el of ELEMENTS) {
    const door = level.exits[el];
    const x = door.x - TILE / 2;
    const y = door.y - TILE * 1.75;
    const open = state.chars[el].atExit;
    ctx.fillStyle = open ? CHAR_COLOR[el] : COLORS.bg;
    ctx.globalAlpha = open ? 0.35 : 1;
    ctx.fillRect(x, y, TILE, TILE * 1.75);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = CHAR_COLOR[el];
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE * 1.75 - 1.5);
  }
}

function channelColor(i: number): string {
  return CHANNEL_COLORS[i % CHANNEL_COLORS.length]!;
}

function drawSwitches(ctx: CanvasRenderingContext2D, { level, state }: View) {
  level.levers.forEach((l, i) => {
    const on = state.levers[i];
    ctx.fillStyle = COLORS.wallTop;
    ctx.fillRect(l.x - 10, l.y - 6, 20, 6);
    ctx.strokeStyle = channelColor(l.channel);
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(l.x, l.y - 4);
    ctx.lineTo(l.x + (on ? 12 : -12), l.y - 22);
    ctx.stroke();
    ctx.fillStyle = channelColor(l.channel);
    ctx.beginPath();
    ctx.arc(l.x + (on ? 12 : -12), l.y - 22, 4, 0, Math.PI * 2);
    ctx.fill();
  });
  level.buttons.forEach((b, i) => {
    const h = state.buttons[i] ? 2 : 6;
    ctx.fillStyle = channelColor(b.channel);
    ctx.fillRect(b.x - BUTTON_W / 2, b.y - h, BUTTON_W, h);
  });
}

function drawPlatforms(ctx: CanvasRenderingContext2D, { level, state }: View) {
  const active = activeChannels(level, state);
  level.platforms.forEach((def, i) => {
    const p = state.platforms[i]!;
    ctx.fillStyle = COLORS.wall;
    ctx.fillRect(p.x, p.y, def.w, def.h);
    ctx.strokeStyle = channelColor(def.channel);
    ctx.lineWidth = active[def.channel] ? 3 : 2;
    ctx.strokeRect(p.x + 1, p.y + 1, def.w - 2, def.h - 2);
  });
}

function drawBoxes(ctx: CanvasRenderingContext2D, { state }: View) {
  for (const b of state.boxes) {
    ctx.fillStyle = COLORS.box;
    ctx.fillRect(b.x, b.y, BOX_SIZE, BOX_SIZE);
    ctx.strokeStyle = COLORS.boxEdge;
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x + 1.5, b.y + 1.5, BOX_SIZE - 3, BOX_SIZE - 3);
    ctx.beginPath();
    ctx.moveTo(b.x + 4, b.y + 4);
    ctx.lineTo(b.x + BOX_SIZE - 4, b.y + BOX_SIZE - 4);
    ctx.stroke();
  }
}

function drawGems(ctx: CanvasRenderingContext2D, { level, state }: View) {
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
  const c = v.state.chars[el];
  const dead = v.authStatus === "dead" && v.authDead === el;
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
    const mine = player.sessionId === v.me;
    ctx.fillStyle = mine ? COLORS.text : COLORS.muted;
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(mine ? `▼ ${player.name}` : player.name, c.x + CHAR_W / 2, c.y - 6);
  }
}

export function formatTime(ticks: number): string {
  const sec = ticks / TICK_RATE;
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}

function drawHud(ctx: CanvasRenderingContext2D, v: View) {
  ctx.fillStyle = COLORS.text;
  ctx.font = "bold 18px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(formatTime(v.state.tick), ctx.canvas.width / 2, 24);

  if (v.restartProgress > 0) {
    const w = 120;
    const x = ctx.canvas.width / 2 - w / 2;
    ctx.fillStyle = COLORS.overlay;
    ctx.fillRect(x, 34, w, 6);
    ctx.fillStyle = COLORS.text;
    ctx.fillRect(x, 34, w * v.restartProgress, 6);
  }
}

function banner(ctx: CanvasRenderingContext2D, title: string, size = 28) {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = COLORS.overlay;
  ctx.fillRect(0, height / 2 - 44, width, 88);
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = "center";
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.fillText(title, width / 2, height / 2 + size / 3);
}

function drawOverlay(ctx: CanvasRenderingContext2D, v: View) {
  if (v.countdown !== null) banner(ctx, String(v.countdown), 48);
  else if (v.authStatus === "dead" && v.authDead) banner(ctx, `${ELEMENT_NAME[v.authDead]} 캐릭터가 쓰러졌다!`);
}
