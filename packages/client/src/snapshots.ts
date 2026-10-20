import { ELEMENTS, type GameState, TICK_RATE, TILE } from "@waterfire/shared";

/** 화면은 서버보다 이만큼(프레임) 늦게 그린다. 스냅샷 사이를 보간할 여유 */
const INTERP_DELAY_FRAMES = 6;
const MAX_BUFFER = 30;
/** 이보다 멀리 움직였으면 재시작 등으로 순간이동한 것이라 보간하지 않는다 */
const TELEPORT_DIST = 2 * TILE;

interface Snapshot {
  frame: number;
  state: GameState;
}

/** 서버 스냅샷을 모아 두었다가 약간 과거 시점을 보간해서 돌려준다 */
export class SnapshotBuffer {
  private buf: Snapshot[] = [];
  /** 서버 프레임과 로컬 시계(ms)의 차이 추정치 */
  private offset: number | null = null;

  push(frame: number, state: GameState, now: number) {
    const last = this.buf.at(-1);
    if (last && frame <= last.frame) return;
    this.buf.push({ frame, state });
    if (this.buf.length > MAX_BUFFER) this.buf.shift();

    // 가장 빨리 도착한 스냅샷 기준으로 시계를 맞춘다 (네트워크 지연이 튀어도 덜 흔들림)
    const estimate = frame - (now * TICK_RATE) / 1000;
    this.offset = this.offset === null ? estimate : Math.max(this.offset, estimate);
  }

  clear() {
    this.buf = [];
    this.offset = null;
  }

  latest(): GameState | null {
    return this.buf.at(-1)?.state ?? null;
  }

  /** 지금 그릴 상태. 스냅샷이 없으면 null */
  sample(now: number): GameState | null {
    const last = this.buf.at(-1);
    if (!last || this.offset === null) return null;
    const target = (now * TICK_RATE) / 1000 + this.offset - INTERP_DELAY_FRAMES;

    const i = this.buf.findIndex((s) => s.frame > target);
    if (i === -1) return last.state;
    if (i === 0) return this.buf[0]!.state;
    const a = this.buf[i - 1]!;
    const b = this.buf[i]!;
    const t = (target - a.frame) / (b.frame - a.frame);

    // 위치만 보간하고 나머지(보석, 상태 등)는 이전 스냅샷 값을 쓴다
    const out: GameState = { ...a.state, chars: { ...a.state.chars } };
    for (const el of ELEMENTS) {
      const ca = a.state.chars[el];
      const cb = b.state.chars[el];
      if (Math.abs(cb.x - ca.x) > TELEPORT_DIST || Math.abs(cb.y - ca.y) > TELEPORT_DIST) continue;
      out.chars[el] = { ...ca, x: ca.x + (cb.x - ca.x) * t, y: ca.y + (cb.y - ca.y) * t };
    }
    return out;
  }
}
