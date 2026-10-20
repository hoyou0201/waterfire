import { Client, type Room } from "@colyseus/sdk";
import {
  type JoinOptions,
  type PlayerInfo,
  ROOM_NAME,
  type ServerMessages,
  encodeInput,
  getLevel,
} from "@waterfire/shared";
import { Keyboard } from "./input.ts";
import { draw, resize } from "./render.ts";
import { SnapshotBuffer } from "./snapshots.ts";

const STORAGE_KEY = "waterfire.login";

// 개발 중에는 Vite(5173)와 게임 서버(2567)가 따로 뜬다. 운영에서는 같은 주소.
const endpoint = import.meta.env.DEV ? `${location.protocol}//${location.hostname}:2567` : location.origin;

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const ctx = canvas.getContext("2d")!;
const statusEl = document.querySelector<HTMLDivElement>("#status")!;
const form = document.querySelector<HTMLFormElement>("#login")!;
const loginError = document.querySelector<HTMLParagraphElement>("#login-error")!;

const keyboard = new Keyboard(window);
const snapshots = new SnapshotBuffer();
let room: Room | null = null;
let players: PlayerInfo[] = [];
let level = getLevel("test-01");
let lastSentInput = -1;
resize(canvas, level);

function loadLogin(): Partial<JoinOptions> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveLogin(login: JoinOptions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(login));
  } catch {
    // 저장이 안 되는 환경이면 다음에 다시 입력하면 된다
  }
}

function setStatus(text: string | null) {
  statusEl.hidden = !text;
  statusEl.textContent = text ?? "";
}

function updateStatus() {
  if (!room) return;
  const partner = players.find((p) => p.sessionId !== room!.sessionId);
  if (!partner) setStatus("상대를 기다리는 중…");
  else if (!partner.connected) setStatus(`${partner.name} 님 재접속 대기 중…`);
  else setStatus(null);
}

async function join(login: JoinOptions) {
  const client = new Client(endpoint);
  const r = await client.join(ROOM_NAME, login);
  room = r;

  r.onMessage("lobby", (msg: ServerMessages["lobby"]) => {
    players = msg.players;
    if (msg.levelId !== level.id) {
      level = getLevel(msg.levelId);
      resize(canvas, level);
      snapshots.clear();
    }
    updateStatus();
  });
  r.onMessage("snapshot", (msg: ServerMessages["snapshot"]) => {
    snapshots.push(msg.frame, msg.state, performance.now());
  });
  r.onDrop(() => setStatus("연결이 끊겼습니다. 재접속 중…"));
  r.onReconnect(() => {
    lastSentInput = -1;
    updateStatus();
  });
  r.onLeave(() => {
    room = null;
    setStatus("서버와 연결이 끊겼습니다. 새로고침해 주세요.");
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = new FormData(form);
  const login: JoinOptions = { name: String(data.get("name")), password: String(data.get("password")) };
  const button = form.querySelector("button")!;
  button.disabled = true;
  loginError.textContent = "";
  try {
    await join(login);
    saveLogin(login);
    form.hidden = true;
  } catch (err) {
    loginError.textContent = describeJoinError(err);
  } finally {
    button.disabled = false;
  }
});

function describeJoinError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/암호/.test(message)) return "암호가 틀렸습니다.";
  if (/full|locked|not found|no rooms/i.test(message)) return "방이 꽉 찼습니다.";
  return `접속하지 못했습니다: ${message}`;
}

function frame(now: number) {
  if (room) {
    const bits = encodeInput(keyboard.read());
    if (bits !== lastSentInput) {
      room.send("input", bits);
      lastSentInput = bits;
    }
  }
  const restart = keyboard.restartProgress(now);
  if (restart.fired) room?.send("restart");

  draw(ctx, {
    level,
    state: snapshots.sample(now),
    players,
    me: room?.sessionId ?? "",
    restartProgress: restart.progress,
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 저장된 로그인 정보가 있으면 바로 입장 시도
const saved = loadLogin();
(form.elements.namedItem("name") as HTMLInputElement).value = saved.name ?? "";
(form.elements.namedItem("password") as HTMLInputElement).value = saved.password ?? "";
if (saved.name && saved.password) form.requestSubmit();
