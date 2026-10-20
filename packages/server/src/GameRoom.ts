import { type Client, Room, type RoomException, type RoomMethodName, ServerError } from "@colyseus/core";
import {
  COUNTDOWN_TICKS,
  DEFAULT_LEVEL_ID,
  ELEMENTS,
  type Element,
  type GameState,
  type Input,
  type JoinOptions,
  type Level,
  NO_INPUT,
  type Phase,
  type PlayerInfo,
  type Progress,
  type ServerMessages,
  SNAPSHOT_EVERY,
  TICK_RATE,
  applyResult,
  createState,
  decodeInput,
  encodeInput,
  getLevel,
  hasLevel,
  isUnlocked,
  mergeProgress,
  nextLevelId,
  resultOf,
  sanitizeProgress,
  step,
} from "@waterfire/shared";

/** 연결이 끊긴 플레이어를 기다리는 시간(초) */
const RECONNECT_SECONDS = 60;
const MAX_NAME_LENGTH = 16;
/** 입력 대기열 최대 길이. 넘치면 오래된 입력을 버려서 지연이 쌓이지 않게 한다 */
const MAX_INPUT_QUEUE = 8;
/** 이 틱 동안 입력이 안 오면 키를 뗀 것으로 본다 (탭이 숨겨진 경우 등) */
const STALE_INPUT_TICKS = 15;

interface Player extends PlayerInfo {
  queue: { seq: number; bits: number }[];
  input: Input;
  ack: number;
  starved: number;
}

export interface GameRoomOptions {
  password: string;
}

/** 서버에 하나만 존재하는 2인용 방. 로비 → 카운트다운 → 플레이를 관리하고 60Hz로 시뮬레이션한다 */
export class GameRoom extends Room {
  maxClients = 2;
  autoDispose = false;
  maxMessagesPerSecond = 240;

  private password = "";
  private phase: Phase = "lobby";
  private level: Level = getLevel(DEFAULT_LEVEL_ID);
  private game: GameState = createState(this.level);
  private countdown = 0;
  private progress: Progress = {};
  private players = new Map<string, Player>();
  private frame = 0;

  messages = {
    input: (client: Client, msg: unknown) => {
      const p = this.players.get(client.sessionId);
      if (!p || typeof msg !== "object" || msg === null) return;
      const { seq, bits } = msg as { seq: unknown; bits: unknown };
      if (typeof seq !== "number" || typeof bits !== "number" || seq <= p.ack) return;
      p.queue.push({ seq, bits });
      if (p.queue.length > MAX_INPUT_QUEUE) p.queue.splice(0, p.queue.length - MAX_INPUT_QUEUE);
    },

    pickElement: (client: Client, el: unknown) => {
      const p = this.players.get(client.sessionId);
      if (!p || this.phase !== "lobby") return;
      if (el === null) {
        p.element = null;
      } else {
        if (!ELEMENTS.includes(el as Element) || this.otherPlayer(p)?.element === el) return;
        p.element = el as Element;
      }
      p.ready = false;
      this.sendLobby();
    },

    pickLevel: (_client: Client, id: unknown) => {
      if (this.phase !== "lobby" || typeof id !== "string" || !hasLevel(id) || !isUnlocked(this.progress, id)) return;
      this.level = getLevel(id);
      for (const p of this.players.values()) p.ready = false;
      this.sendLobby();
    },

    ready: (client: Client, ready: unknown) => {
      const p = this.players.get(client.sessionId);
      if (!p || this.phase !== "lobby") return;
      p.ready = ready === true && p.element !== null;
      this.sendLobby();
      this.maybeStart();
    },

    restart: () => {
      if (this.phase === "playing") this.game = createState(this.level);
    },

    nextLevel: () => {
      if (this.phase !== "playing" || this.game.status !== "won") return;
      const next = nextLevelId(this.level.id);
      if (next && isUnlocked(this.progress, next)) this.startLevel(next);
    },

    leaveLevel: () => {
      if (this.phase !== "lobby") this.toLobby();
    },

    progress: (_client: Client, raw: unknown) => {
      this.progress = mergeProgress(this.progress, sanitizeProgress(raw));
      this.sendLobby();
    },
  };

  onCreate(options: GameRoomOptions) {
    this.password = options.password;
    this.setFixedTimestep(() => this.update(), TICK_RATE);
  }

  onAuth(_client: Client, options: Partial<JoinOptions>) {
    if (options?.password !== this.password) throw new ServerError(401, "암호가 틀렸습니다");
    const name = String(options.name ?? "").trim().slice(0, MAX_NAME_LENGTH) || "플레이어";
    return { name };
  }

  onJoin(client: Client) {
    this.players.set(client.sessionId, {
      sessionId: client.sessionId,
      name: (client.auth as { name: string }).name,
      element: null,
      connected: true,
      ready: false,
      queue: [],
      input: NO_INPUT,
      ack: 0,
      starved: 0,
    });
    this.sendLobby();
  }

  onDrop(client: Client) {
    const p = this.players.get(client.sessionId);
    if (!p) return;
    p.connected = false;
    p.input = NO_INPUT;
    p.queue = [];
    this.sendLobby();
    this.allowReconnection(client, RECONNECT_SECONDS);
  }

  onReconnect(client: Client) {
    const p = this.players.get(client.sessionId);
    if (p) p.connected = true;
    this.sendLobby();
  }

  onLeave(client: Client) {
    this.players.delete(client.sessionId);
    this.toLobby();
  }

  onUncaughtException(error: RoomException, methodName: RoomMethodName) {
    console.error(`[GameRoom] ${methodName} failed:`, error);
  }

  private otherPlayer(p: Player): Player | undefined {
    return [...this.players.values()].find((o) => o !== p);
  }

  private bothConnected(): boolean {
    const players = [...this.players.values()];
    return players.length === 2 && players.every((p) => p.connected);
  }

  private maybeStart() {
    const [a, b] = [...this.players.values()];
    if (!a || !b || !this.bothConnected()) return;
    if (!a.ready || !b.ready || !a.element || !b.element || a.element === b.element) return;
    this.startLevel(this.level.id);
  }

  private startLevel(id: string) {
    this.level = getLevel(id);
    this.game = createState(this.level);
    this.phase = "countdown";
    this.countdown = COUNTDOWN_TICKS;
    for (const p of this.players.values()) {
      p.queue = [];
      p.input = NO_INPUT;
    }
    this.sendLobby();
  }

  private toLobby() {
    this.phase = "lobby";
    for (const p of this.players.values()) p.ready = false;
    this.sendLobby();
  }

  private sendLobby() {
    const msg: ServerMessages["lobby"] = {
      phase: this.phase,
      players: [...this.players.values()].map(({ sessionId, name, element, connected, ready }) => ({
        sessionId,
        name,
        element,
        connected,
        ready,
      })),
      levelId: this.level.id,
      progress: this.progress,
    };
    this.broadcast("lobby", msg);
  }

  /** 각 플레이어의 입력 대기열에서 이번 틱 입력을 하나 꺼낸다 */
  private consumeInputs(): Record<Element, Input> {
    const inputs: Record<Element, Input> = { fire: NO_INPUT, water: NO_INPUT };
    for (const p of this.players.values()) {
      const next = p.queue.shift();
      if (next) {
        p.input = decodeInput(next.bits);
        p.ack = next.seq;
        p.starved = 0;
      } else if (++p.starved > STALE_INPUT_TICKS) {
        p.input = NO_INPUT;
      }
      if (p.element) inputs[p.element] = p.input;
    }
    return inputs;
  }

  private update() {
    this.frame++;
    if (this.phase === "lobby") return;

    if (this.bothConnected()) {
      if (this.phase === "countdown") {
        if (--this.countdown <= 0) this.phase = "playing";
        for (const p of this.players.values()) p.queue = [];
      } else {
        const wasWon = this.game.status === "won";
        this.game = step(this.level, this.game, this.consumeInputs());
        if (!wasWon && this.game.status === "won") this.onWin();
      }
    }

    if (this.frame % SNAPSHOT_EVERY === 0) this.sendSnapshot();
  }

  private onWin() {
    const result = resultOf(this.level, this.game);
    this.progress = applyResult(this.progress, result);
    this.broadcast("result", result);
    this.sendLobby();
  }

  private sendSnapshot() {
    const acks: Record<string, number> = {};
    const inputs: Record<Element, number> = { fire: 0, water: 0 };
    for (const p of this.players.values()) {
      acks[p.sessionId] = p.ack;
      if (p.element) inputs[p.element] = encodeInput(p.input);
    }
    const msg: ServerMessages["snapshot"] = {
      frame: this.frame,
      phase: this.phase,
      levelId: this.level.id,
      countdown: this.countdown,
      state: this.game,
      acks,
      inputs,
    };
    this.broadcast("snapshot", msg);
  }
}
