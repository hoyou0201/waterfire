import { Client, type Room } from "@colyseus/sdk";
import {
  DEFAULT_LEVEL_ID,
  type Element,
  type JoinOptions,
  type LevelResult,
  type Phase,
  type PlayerInfo,
  type Progress,
  ROOM_NAME,
  type ServerMessages,
  TICK_RATE,
  createState,
  encodeInput,
  getLevel,
} from "@waterfire/shared";
import { Keyboard } from "./input.ts";
import { Predictor } from "./predictor.ts";
import { loadAtlas } from "./art.ts";
import { Renderer } from "./render.ts";
import { loadLogin, loadProgress, saveLogin, saveProgress } from "./storage.ts";
import { Ui } from "./ui.ts";

// 개발 중에는 Vite(5173)와 게임 서버(2567)가 따로 뜬다. 운영에서는 같은 주소.
const endpoint = import.meta.env.DEV ? `${location.protocol}//${location.hostname}:2567` : location.origin;
const TICK_MS = 1000 / TICK_RATE;
/** 탭이 잠깐 멈췄다 돌아왔을 때 한 번에 따라잡을 최대 틱 */
const MAX_CATCHUP_TICKS = 5;

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const statusEl = document.querySelector<HTMLDivElement>("#status")!;
const form = document.querySelector<HTMLFormElement>("#login")!;
const loginError = document.querySelector<HTMLParagraphElement>("#login-error")!;

const keyboard = new Keyboard(window);
const renderer = new Renderer(canvas);

/** 로비에서 배경으로 보여 줄 레벨 상태 (레벨마다 하나만 만든다) */
const lobbyStates = new Map<string, ReturnType<typeof createState>>();
function lobbyState(l: typeof level) {
  let s = lobbyStates.get(l.id);
  if (!s) lobbyStates.set(l.id, (s = createState(l)));
  return s;
}
let level = getLevel(DEFAULT_LEVEL_ID);
const predictor = new Predictor(level);

let room: Room | null = null;
let phase: Phase = "lobby";
let players: PlayerInfo[] = [];
let progress: Progress = loadProgress();
let countdown = 0;
let lastResult: LevelResult | null = null;

const send = <T>(type: string, payload?: T) => room?.send(type, payload);

const ui = new Ui({
  pickElement: (el) => send("pickElement", el),
  pickLevel: (id) => send("pickLevel", id),
  ready: (r) => send("ready", r),
  restart: () => send("restart"),
  nextLevel: () => send("nextLevel"),
  leaveLevel: () => send("leaveLevel"),
});

function myElement(): Element | null {
  return players.find((p) => p.sessionId === room?.sessionId)?.element ?? null;
}

function setLevel(id: string) {
  if (id === level.id) return;
  level = getLevel(id);
  predictor.reset(level);
  renderer.setLevel(level);
}

function setStatus(text: string | null) {
  statusEl.hidden = !text;
  statusEl.textContent = text ?? "";
}

function updateStatus() {
  if (!room) return;
  const partner = players.find((p) => p.sessionId !== room!.sessionId);
  if (phase !== "lobby" && partner && !partner.connected) setStatus(`${partner.name} 님 재접속 대기 중… (게임 일시정지)`);
  else setStatus(null);
}

function refreshUi() {
  const inLevel = phase !== "lobby";
  ui.showLobby(room && !inLevel ? { me: room.sessionId, players, levelId: level.id, progress } : null);
  const won = inLevel && predictor.auth?.status === "won" && lastResult?.levelId === level.id;
  ui.showResult(won ? lastResult : null, progress);
  if (!inLevel) ui.toggleMenu(false);
  updateStatus();
}

async function join(login: JoinOptions) {
  const client = new Client(endpoint);
  const r = await client.join(ROOM_NAME, login);
  room = r;

  r.onMessage("lobby", (msg: ServerMessages["lobby"]) => {
    const wasPhase = phase;
    phase = msg.phase;
    players = msg.players;
    progress = saveProgress(msg.progress);
    setLevel(msg.levelId);
    if (phase === "countdown" && wasPhase !== "countdown") {
      predictor.reset(level);
      lastResult = null;
    }
    refreshUi();
  });
  r.onMessage("snapshot", (msg: ServerMessages["snapshot"]) => {
    setLevel(msg.levelId);
    phase = msg.phase;
    countdown = msg.countdown;
    const wasWon = predictor.auth?.status === "won";
    predictor.onSnapshot(msg, r.sessionId, myElement());
    if (wasWon !== (msg.state.status === "won")) refreshUi();
  });
  r.onMessage("result", (msg: ServerMessages["result"]) => {
    lastResult = msg;
    refreshUi();
  });
  r.onDrop(() => setStatus("연결이 끊겼습니다. 재접속 중…"));
  r.onReconnect(() => updateStatus());
  r.onLeave(() => {
    room = null;
    setStatus("서버와 연결이 끊겼습니다. 새로고침해 주세요.");
  });

  // 내 기록을 보내서 상대 기록과 합친다
  r.send("progress", progress);
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
    refreshUi();
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

// 새로고침·탭 닫기는 정상 퇴장으로 알린다. 안 그러면 서버가 재접속을 60초 기다리며 자리를 잡아 둔다
window.addEventListener("pagehide", () => {
  void room?.leave(true);
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Escape" && phase === "playing" && !(e.target instanceof HTMLInputElement)) ui.toggleMenu();
});

/** 고정 60Hz 틱: 내 입력을 보내고 예측을 한 틱 진행한다 */
function localTick() {
  const me = myElement();
  if (!room || phase !== "playing" || !me) return;
  const bits = ui.menuOpen ? 0 : encodeInput(keyboard.read());
  const seq = predictor.tick(me, bits);
  if (seq !== null) room.send("input", { seq, bits });
}

let acc = 0;
let lastTime = performance.now();
let lastFrame = 0;

/** 지난 호출 이후 흐른 시간만큼 틱을 돌린다 */
function pump(now: number) {
  acc += now - lastTime;
  lastTime = now;
  if (acc > MAX_CATCHUP_TICKS * TICK_MS) acc = MAX_CATCHUP_TICKS * TICK_MS;
  while (acc >= TICK_MS) {
    acc -= TICK_MS;
    localTick();
  }
}

// 보통은 화면 갱신(requestAnimationFrame)마다 틱을 돌린다. 창이 가려져 화면 갱신이 멈추면
// 타이머로 대신 돌려서 입력 전송과 예측이 끊기지 않게 한다
setInterval(() => {
  const now = performance.now();
  if (now - lastFrame > 100) pump(now);
}, TICK_MS);

function frame(now: number) {
  lastFrame = now;
  pump(now);

  const restart = phase === "playing" ? keyboard.restartProgress(now) : { progress: 0, fired: false };
  if (restart.fired) send("restart");

  const inLevel = phase !== "lobby";
  const state = (inLevel && (phase === "playing" ? predictor.view() : predictor.auth)) || lobbyState(level);
  renderer.draw({
    level,
    state,
    auth: inLevel ? predictor.auth : null,
    now,
    players: inLevel ? players : [],
    me: room?.sessionId ?? "",
    countdown: phase === "countdown" ? Math.max(1, Math.ceil(countdown / TICK_RATE)) : null,
    restartProgress: restart.progress,
  });
  requestAnimationFrame(frame);
}

renderer.setLevel(level);
requestAnimationFrame(frame);
loadAtlas()
  .then((atlas) => renderer.setAtlas(atlas))
  .catch((err) => setStatus(`그림을 불러오지 못했습니다: ${(err as Error).message}`));

// 개발 중 브라우저 콘솔에서 상태를 들여다보기 위한 훅
if (import.meta.env.DEV) {
  Object.assign(window, {
    __wf: {
      predictor,
      keyboard,
      get phase() {
        return phase;
      },
      get players() {
        return players;
      },
      /** 로비 배경으로 다른 레벨을 그려 본다 */
      preview: setLevel,
    },
  });
}

// 저장된 로그인 정보가 있으면 바로 입장 시도
const saved = loadLogin();
(form.elements.namedItem("name") as HTMLInputElement).value = saved.name ?? "";
(form.elements.namedItem("password") as HTMLInputElement).value = saved.password ?? "";
if (saved.name && saved.password) form.requestSubmit();
