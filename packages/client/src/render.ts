import {
  BOX_SIZE,
  CHAR_H,
  CHAR_W,
  DEATH_RESET_TICKS,
  ELEMENTS,
  type Element,
  type GameState,
  type Level,
  type PlayerInfo,
  TICK_RATE,
  TILE,
  Tile,
  isLiquid,
  isSolid,
  tileAt,
} from "@waterfire/shared";
import { type Atlas, drawFrame, drawFrameRect, drawThreeSlice, frameSize } from "./art.ts";

/** 캔버스 내부 해상도 배율. 아틀라스도 이 배율로 만들어져 있다 */
const RENDER_SCALE = 2;

const COLORS = {
  bg: "#14161c",
  text: "#e8e6e3",
  muted: "#b8bec6",
  overlay: "rgba(10, 12, 16, 0.6)",
  shade: "rgba(8, 10, 20, 0.35)",
};

export const ELEMENT_NAME: Record<Element, string> = { fire: "불", water: "물" };
/** 채널 번호 → 장치 색. 아트에는 노랑·보라 두 가지가 있다 */
const CHANNEL_ART = ["yellow", "purple"] as const;
const LIQUID_ART: Partial<Record<Tile, string>> = { [Tile.Lava]: "lava", [Tile.Water]: "water", [Tile.Poison]: "poison" };

/** 웅덩이 표면 띠: 타일 윗면 위로 솟는 높이와 전체 높이 */
const LIQUID_RISE = 6;
const LIQUID_H = 18;

export interface View {
  level: Level;
  state: GameState;
  /** 사망·클리어 표시는 서버가 확정한 상태로 한다 */
  auth: GameState | null;
  players: PlayerInfo[];
  me: string;
  /** 카운트다운 중이면 남은 초 */
  countdown: number | null;
  restartProgress: number;
  now: number;
}

interface Effect {
  prefix: string;
  x: number;
  y: number;
  start: number;
  duration: number;
}

interface LiquidRun {
  kind: string;
  x: number;
  y: number;
  w: number;
}

export function formatTime(ticks: number): string {
  const sec = ticks / TICK_RATE;
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}

/** 이웃 타일을 보고 지형 그림을 고른다 */
function tileArt(level: Level, tx: number, ty: number): string {
  const solid = (x: number, y: number) => {
    const t = tileAt(level, x, y);
    return isSolid(t) || t === Tile.SlopeUp || t === Tile.SlopeDown;
  };
  const up = solid(tx, ty - 1);
  const left = solid(tx - 1, ty);
  const right = solid(tx + 1, ty);
  if (!up) {
    if (!left && right) return "tile-top-left";
    if (!right && left) return "tile-top-right";
    return (tx * 7 + ty * 3) % 5 === 0 ? "tile-moss-top" : "tile-top-center";
  }
  if (!left) return "tile-left-wall";
  if (!right) return "tile-right-wall";
  if (!solid(tx, ty + 1)) return "tile-bottom-edge";
  return (tx * 13 + ty * 7) % 6 === 0 ? "tile-cracked-interior" : "tile-interior";
}

export class Renderer {
  private atlas: Atlas | null = null;
  private ctx: CanvasRenderingContext2D;
  private staticLayer: HTMLCanvasElement | null = null;
  private staticFor: string | null = null;
  private liquids: LiquidRun[] = [];
  private facing: Record<Element, 1 | -1> = { fire: 1, water: 1 };
  private airFrames: Record<Element, number> = { fire: 0, water: 0 };
  private effects: Effect[] = [];
  private prevGems: boolean[] | null = null;
  private prevTick = 0;
  private level: Level | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    window.addEventListener("resize", () => this.fit());
  }

  setAtlas(atlas: Atlas) {
    this.atlas = atlas;
    this.staticFor = null;
  }

  /** 레벨 크기에 맞춰 캔버스 해상도와 화면 크기를 정한다 */
  setLevel(level: Level) {
    if (this.level?.id === level.id) return;
    this.level = level;
    this.canvas.width = level.w * TILE * RENDER_SCALE;
    this.canvas.height = level.h * TILE * RENDER_SCALE;
    this.staticFor = null;
    this.effects = [];
    this.prevGems = null;
    this.liquids = this.findLiquids(level);
    this.fit();
  }

  /** 창 크기 안에서 비율을 유지하며 최대한 크게 */
  private fit() {
    if (!this.level) return;
    const lw = this.level.w * TILE;
    const lh = this.level.h * TILE;
    const k = Math.min((window.innerWidth - 32) / lw, (window.innerHeight - 32) / lh);
    this.canvas.style.width = `${Math.floor(lw * k)}px`;
    this.canvas.style.height = `${Math.floor(lh * k)}px`;
  }

  private findLiquids(level: Level): LiquidRun[] {
    const runs: LiquidRun[] = [];
    for (let ty = 0; ty < level.h; ty++) {
      let tx = 0;
      while (tx < level.w) {
        const t = tileAt(level, tx, ty);
        if (!isLiquid(t)) {
          tx++;
          continue;
        }
        const start = tx;
        while (tx < level.w && tileAt(level, tx, ty) === t) tx++;
        runs.push({ kind: LIQUID_ART[t]!, x: start * TILE, y: ty * TILE, w: (tx - start) * TILE });
      }
    }
    return runs;
  }

  /** 배경과 지형은 레벨마다 한 번만 그려 둔다 */
  private buildStatic(level: Level, atlas: Atlas) {
    const c = document.createElement("canvas");
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext("2d")!;
    g.scale(RENDER_SCALE, RENDER_SCALE);
    const w = level.w * TILE;
    const h = level.h * TILE;
    const bg = atlas.background;
    const k = Math.max(w / bg.width, h / bg.height);
    g.drawImage(bg, (w - bg.width * k) / 2, (h - bg.height * k) / 2, bg.width * k, bg.height * k);
    g.fillStyle = COLORS.shade;
    g.fillRect(0, 0, w, h);

    for (let ty = 0; ty < level.h; ty++) {
      for (let tx = 0; tx < level.w; tx++) {
        const t = tileAt(level, tx, ty);
        if (t === Tile.Empty) continue;
        const x = tx * TILE;
        const y = ty * TILE;
        if (t === Tile.SlopeUp || t === Tile.SlopeDown) {
          drawFrameRect(g, atlas, t === Tile.SlopeUp ? "tile-slope-up" : "tile-slope-down", x - 1, y - 1, TILE + 2, TILE + 2);
          continue;
        }
        // 웅덩이 칸은 아래쪽 돌만 그리고 표면은 매 프레임 따로 그린다
        const name = isLiquid(t) ? "tile-interior" : tileArt(level, tx, ty);
        drawFrameRect(g, atlas, name, x - 1, y - 1, TILE + 2, TILE + 2);
      }
    }
    this.staticLayer = c;
    this.staticFor = level.id;
  }

  draw(v: View) {
    const ctx = this.ctx;
    const atlas = this.atlas;
    this.setLevel(v.level);
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    ctx.imageSmoothingQuality = "high";
    if (!atlas) {
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, v.level.w * TILE, v.level.h * TILE);
      return;
    }
    if (this.staticFor !== v.level.id) this.buildStatic(v.level, atlas);
    ctx.drawImage(this.staticLayer!, 0, 0, v.level.w * TILE, v.level.h * TILE);

    this.trackEvents(v);
    this.drawExits(v, atlas);
    this.drawSwitches(v, atlas);
    this.drawPlatforms(v, atlas);
    this.drawBoxes(v, atlas);
    this.drawGems(v, atlas);
    for (const el of ELEMENTS) this.drawChar(v, atlas, el);
    this.drawLiquids(v, atlas);
    this.drawDeath(v, atlas);
    this.drawEffects(v, atlas);
    this.drawLabels(v);
    this.drawHud(v);
    this.drawOverlay(v);
  }

  /** 보석 획득·착지 같은 순간 효과를 상태 변화에서 찾아낸다 */
  private trackEvents(v: View) {
    const s = v.state;
    if (this.prevGems && s.tick >= this.prevTick && this.prevGems.length === s.gems.length) {
      s.gems.forEach((got, i) => {
        if (got && !this.prevGems![i]) {
          const g = v.level.gems[i]!;
          this.effects.push({ prefix: "fx-sparkle-", x: g.x, y: g.y, start: v.now, duration: 400 });
        }
      });
    }
    this.prevGems = [...s.gems];
    this.prevTick = s.tick;

    for (const el of ELEMENTS) {
      const c = s.chars[el];
      // 시작 전(카운트다운·로비)에는 막 생성된 캐릭터가 공중으로 잡히므로 세지 않는다
      if (!c.onGround) {
        if (s.tick > 0) this.airFrames[el]++;
        continue;
      }
      if (this.airFrames[el] > 12) {
        this.effects.push({ prefix: "fx-dust-", x: c.x + CHAR_W / 2, y: c.y + CHAR_H - 6, start: v.now, duration: 300 });
      }
      this.airFrames[el] = 0;
    }
  }

  private drawExits({ level, state }: View, atlas: Atlas) {
    for (const el of ELEMENTS) {
      const door = level.exits[el];
      drawFrame(this.ctx, atlas, state.chars[el].atExit ? `${el}-exit-active` : `${el}-exit`, door.x, door.y + 2);
    }
  }

  private drawSwitches({ level, state }: View, atlas: Atlas) {
    level.levers.forEach((l, i) => {
      const color = CHANNEL_ART[l.channel % CHANNEL_ART.length];
      drawFrame(this.ctx, atlas, `lever-${color}-${state.levers[i] ? "on" : "off"}`, l.x, l.y + 1);
    });
    level.buttons.forEach((b, i) => {
      const color = CHANNEL_ART[b.channel % CHANNEL_ART.length];
      drawFrame(this.ctx, atlas, `button-${color}-${state.buttons[i] ? "down" : "up"}`, b.x, b.y + 2);
    });
  }

  private drawPlatforms({ level, state }: View, atlas: Atlas) {
    level.platforms.forEach((def, i) => {
      const p = state.platforms[i]!;
      const color = CHANNEL_ART[def.channel % CHANNEL_ART.length];
      if (def.w >= def.h) drawThreeSlice(this.ctx, atlas, `platform-${color}`, p.x, p.y, def.w, def.h, "x", 0.2);
      else drawThreeSlice(this.ctx, atlas, `gate-${color}`, p.x, p.y, def.w, def.h, "y", 0.22);
    });
  }

  private drawBoxes({ state }: View, atlas: Atlas) {
    for (const b of state.boxes) drawFrameRect(this.ctx, atlas, "crate", b.x, b.y, BOX_SIZE, BOX_SIZE);
  }

  private drawGems({ level, state, now }: View, atlas: Atlas) {
    level.gems.forEach((g, i) => {
      if (state.gems[i]) return;
      const bob = Math.sin(now / 400 + i) * 2;
      // 보석마다 시차를 두고 가끔 반짝인다
      const glint = (now + i * 700) % 2600 < 160;
      drawFrame(this.ctx, atlas, `${g.color}-gem${glint ? "-glint" : ""}`, g.x, g.y + 11 + bob);
    });
  }

  private isPushing(s: GameState, el: Element): boolean {
    const c = s.chars[el];
    if (!c.onGround || Math.abs(c.vx) < 1) return false;
    const dir = Math.sign(c.vx);
    return s.boxes.some(
      (b) =>
        b.y < c.y + CHAR_H &&
        b.y + BOX_SIZE > c.y &&
        (dir > 0 ? Math.abs(b.x - (c.x + CHAR_W)) < 1 : Math.abs(b.x + BOX_SIZE - c.x) < 1),
    );
  }

  private charFrame(v: View, el: Element): string {
    const c = v.state.chars[el];
    if (v.auth?.status === "won") return "victory";
    // 막 생성된 상태(아직 한 틱도 안 지남)는 서 있는 것으로 그린다
    if (!c.onGround && c.vy !== 0) return c.vy < 0 ? "jump" : "fall";
    if (this.isPushing(v.state, el)) return "push";
    if (Math.abs(c.vx) > 20) return `run-${"abcd"[Math.floor(v.now / 90) % 4]}`;
    return `idle-${Math.floor(v.now / 600) % 2 ? "b" : "a"}`;
  }

  private drawChar(v: View, atlas: Atlas, el: Element) {
    if (v.auth?.status === "dead" && v.auth.deadChar === el) return;
    const c = v.state.chars[el];
    if (Math.abs(c.vx) > 1) this.facing[el] = c.vx > 0 ? 1 : -1;
    drawFrame(this.ctx, atlas, `${el}-${this.charFrame(v, el)}`, c.x + CHAR_W / 2, c.y + CHAR_H + 1, this.facing[el] < 0);
  }

  private drawLiquids({ now }: View, atlas: Atlas) {
    const frame = (Math.floor(now / 180) % 4) + 1;
    for (const r of this.liquids) drawFrameRect(this.ctx, atlas, `${r.kind}-${frame}`, r.x, r.y - LIQUID_RISE, r.w, LIQUID_H);
  }

  /** 서버가 확정한 사망: 쓰러진 자리에 원소별 효과 */
  private drawDeath(v: View, atlas: Atlas) {
    const a = v.auth;
    if (a?.status !== "dead" || !a.deadChar) return;
    const c = a.chars[a.deadChar];
    const cx = c.x + CHAR_W / 2;
    const feet = c.y + CHAR_H;
    const under = tileAt(v.level, Math.floor(cx / TILE), Math.round(feet / TILE));
    const kind = under === Tile.Poison ? "poison" : a.deadChar;
    const i = Math.min(3, Math.floor((a.statusTicks / DEATH_RESET_TICKS) * 4));
    if (i < 2) {
      this.ctx.globalAlpha = 1 - i * 0.5;
      drawFrame(this.ctx, atlas, `${a.deadChar}-hurt`, cx, feet + 1, this.facing[a.deadChar] < 0);
      this.ctx.globalAlpha = 1;
    }
    drawFrame(this.ctx, atlas, `fx-${kind}-out-${i + 1}`, cx, feet - 18);
  }

  private drawEffects({ now }: View, atlas: Atlas) {
    this.effects = this.effects.filter((e) => now - e.start < e.duration);
    for (const e of this.effects) {
      const i = Math.min(3, Math.floor(((now - e.start) / e.duration) * 4));
      drawFrame(this.ctx, atlas, `${e.prefix}${i + 1}`, e.x, e.y);
    }
  }

  private drawLabels(v: View) {
    const ctx = this.ctx;
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    for (const el of ELEMENTS) {
      const player = v.players.find((p) => p.element === el);
      if (!player || (v.auth?.status === "dead" && v.auth.deadChar === el)) continue;
      const c = v.state.chars[el];
      const mine = player.sessionId === v.me;
      const top = c.y + CHAR_H - (this.atlas ? frameSize(this.atlas, `${el}-idle-a`).h : CHAR_H);
      // 내 캐릭터는 ▼ 표시만, 상대는 이름을 띄운다 (붙어 있을 때 글자가 겹치지 않게)
      text(ctx, mine ? "▼" : player.name, c.x + CHAR_W / 2, top - 4, mine ? COLORS.text : COLORS.muted);
    }
  }

  private drawHud(v: View) {
    const ctx = this.ctx;
    const w = v.level.w * TILE;
    ctx.font = "bold 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    text(ctx, formatTime(v.state.tick), w / 2, 24, COLORS.text);

    if (v.restartProgress > 0) {
      const bw = 120;
      const x = w / 2 - bw / 2;
      ctx.fillStyle = COLORS.overlay;
      ctx.fillRect(x, 34, bw, 6);
      ctx.fillStyle = COLORS.text;
      ctx.fillRect(x, 34, bw * v.restartProgress, 6);
    }
  }

  private banner(title: string, size: number) {
    const ctx = this.ctx;
    const w = this.canvas.width / RENDER_SCALE;
    const h = this.canvas.height / RENDER_SCALE;
    ctx.fillStyle = COLORS.overlay;
    ctx.fillRect(0, h / 2 - 44, w, 88);
    ctx.textAlign = "center";
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    text(ctx, title, w / 2, h / 2 + size / 3, COLORS.text);
  }

  private drawOverlay(v: View) {
    if (v.countdown !== null) this.banner(String(v.countdown), 48);
    else if (v.auth?.status === "dead" && v.auth.deadChar) this.banner(`${ELEMENT_NAME[v.auth.deadChar]} 캐릭터가 쓰러졌다!`, 26);
  }
}

/** 배경 위에서도 읽히게 그림자를 넣은 글자 */
function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.fillText(s, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}
