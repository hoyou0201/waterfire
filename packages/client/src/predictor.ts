import {
  ELEMENTS,
  type Element,
  type GameState,
  type Input,
  type Level,
  type ServerMessages,
  TILE,
  decodeInput,
  step,
} from "@waterfire/shared";

/** 예측을 되돌릴 때 이보다 많이 어긋나면 부드럽게 잇지 않고 바로 옮긴다 (재시작 등) */
const TELEPORT_DIST = 2 * TILE;
/** 보정 오차가 틱마다 줄어드는 비율 */
const SMOOTH_DECAY = 0.8;
/** 서버 확인을 못 받은 입력을 이 이상 쌓아 두지 않는다 */
const MAX_PENDING = 120;

/**
 * 클라이언트 예측.
 * 서버 스냅샷(확정 상태)에서 출발해 아직 서버가 적용하지 않은 내 입력을 다시 적용하고,
 * 이후 매 틱 내 입력으로 한 틱씩 앞서 계산한다. 상대 입력은 서버가 마지막으로 적용한 값이 계속된다고 가정한다.
 */
export class Predictor {
  /** 서버가 확정한 마지막 상태 */
  auth: GameState | null = null;
  /** 내 입력까지 반영해 앞서 계산한 상태 */
  predicted: GameState | null = null;

  private pending: { seq: number; bits: number }[] = [];
  private seq = 0;
  private partnerBits = 0;
  /** 화면 보정용 오차. 그릴 때 위치에 더한다 */
  private offsets: Record<Element, { x: number; y: number }> = { fire: { x: 0, y: 0 }, water: { x: 0, y: 0 } };

  constructor(private level: Level) {}

  reset(level: Level) {
    this.level = level;
    this.auth = null;
    this.predicted = null;
    this.pending = [];
    for (const el of ELEMENTS) this.offsets[el] = { x: 0, y: 0 };
  }

  private inputs(me: Element, myBits: number): Record<Element, Input> {
    const mine = decodeInput(myBits);
    const partner = decodeInput(this.partnerBits);
    return me === "fire" ? { fire: mine, water: partner } : { fire: partner, water: mine };
  }

  onSnapshot(snap: ServerMessages["snapshot"], sessionId: string, me: Element | null) {
    this.auth = snap.state;
    if (!me) {
      this.predicted = snap.state;
      return;
    }
    const partner: Element = me === "fire" ? "water" : "fire";
    const ack = snap.acks[sessionId] ?? 0;
    this.pending = this.pending.filter((p) => p.seq > ack);
    this.partnerBits = snap.inputs[partner];

    let s = snap.state;
    for (const p of this.pending) s = step(this.level, s, this.inputs(me, p.bits));

    // 예측이 틀렸던 만큼을 화면에서 서서히 메운다
    const before = this.predicted;
    for (const el of ELEMENTS) {
      if (!before) break;
      const dx = before.chars[el].x - s.chars[el].x;
      const dy = before.chars[el].y - s.chars[el].y;
      const o = this.offsets[el];
      if (Math.abs(dx + o.x) > TELEPORT_DIST || Math.abs(dy + o.y) > TELEPORT_DIST) this.offsets[el] = { x: 0, y: 0 };
      else this.offsets[el] = { x: o.x + dx, y: o.y + dy };
    }
    this.predicted = s;
  }

  /** 내 입력으로 한 틱 앞서 계산하고 서버에 보낼 seq를 돌려준다 */
  tick(me: Element, bits: number): number | null {
    if (!this.predicted) return null;
    this.seq++;
    this.pending.push({ seq: this.seq, bits });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    this.predicted = step(this.level, this.predicted, this.inputs(me, bits));
    for (const el of ELEMENTS) {
      this.offsets[el].x *= SMOOTH_DECAY;
      this.offsets[el].y *= SMOOTH_DECAY;
    }
    return this.seq;
  }

  /** 화면에 그릴 상태: 예측 상태 + 보정 오차 */
  view(): GameState | null {
    const s = this.predicted;
    if (!s) return null;
    const chars = { ...s.chars };
    for (const el of ELEMENTS) {
      const o = this.offsets[el];
      chars[el] = { ...chars[el], x: chars[el].x + o.x, y: chars[el].y + o.y };
    }
    return { ...s, chars };
  }
}
