import { type Client, Room, type RoomException, type RoomMethodName, ServerError } from "@colyseus/core";
import {
  DEFAULT_LEVEL_ID,
  ELEMENTS,
  type Element,
  type GameState,
  type Input,
  type JoinOptions,
  type Level,
  NO_INPUT,
  type PlayerInfo,
  type ServerMessages,
  SNAPSHOT_EVERY,
  TICK_RATE,
  createState,
  decodeInput,
  getLevel,
  step,
} from "@waterfire/shared";

/** 연결이 끊긴 플레이어를 기다리는 시간(초) */
const RECONNECT_SECONDS = 60;
const MAX_NAME_LENGTH = 16;

interface Player extends PlayerInfo {
  input: Input;
}

export interface GameRoomOptions {
  password: string;
}

/** 서버에 하나만 존재하는 2인용 방. 시뮬레이션을 60Hz로 돌리고 스냅샷을 보낸다 */
export class GameRoom extends Room {
  maxClients = 2;
  autoDispose = false;

  private password = "";
  private level: Level = getLevel(DEFAULT_LEVEL_ID);
  private game: GameState = createState(this.level);
  private players = new Map<string, Player>();
  private frame = 0;

  messages = {
    input: (client: Client, bits: unknown) => {
      const p = this.players.get(client.sessionId);
      if (p && typeof bits === "number") p.input = decodeInput(bits);
    },
    restart: () => {
      this.game = createState(this.level);
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
    const taken = new Set([...this.players.values()].map((p) => p.element));
    const element = ELEMENTS.find((e) => !taken.has(e))!;
    this.players.set(client.sessionId, {
      sessionId: client.sessionId,
      name: (client.auth as { name: string }).name,
      element,
      connected: true,
      input: NO_INPUT,
    });
    this.game = createState(this.level);
    this.sendLobby();
  }

  onDrop(client: Client) {
    const p = this.players.get(client.sessionId);
    if (!p) return;
    p.connected = false;
    p.input = NO_INPUT;
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
    this.game = createState(this.level);
    this.sendLobby();
  }

  onUncaughtException(error: RoomException, methodName: RoomMethodName) {
    console.error(`[GameRoom] ${methodName} failed:`, error);
  }

  private sendLobby() {
    const msg: ServerMessages["lobby"] = {
      players: [...this.players.values()].map(({ input: _input, ...info }) => info),
      levelId: this.level.id,
    };
    this.broadcast("lobby", msg);
  }

  private update() {
    this.frame++;
    const players = [...this.players.values()];
    const running = players.length === 2 && players.every((p) => p.connected);

    if (running) {
      const inputs = { fire: NO_INPUT, water: NO_INPUT } as Record<Element, Input>;
      for (const p of players) inputs[p.element] = p.input;
      this.game = step(this.level, this.game, inputs);
    }

    if (this.frame % SNAPSHOT_EVERY === 0) {
      const msg: ServerMessages["snapshot"] = { frame: this.frame, state: this.game };
      this.broadcast("snapshot", msg);
    }
  }
}
