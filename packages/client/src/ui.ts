import {
  ELEMENTS,
  type Element,
  LEVELS,
  type LevelResult,
  type PlayerInfo,
  type Progress,
  isUnlocked,
  nextLevelId,
} from "@waterfire/shared";
import { formatTime } from "./render.ts";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

export interface UiHandlers {
  pickElement(el: Element | null): void;
  pickLevel(id: string): void;
  ready(ready: boolean): void;
  restart(): void;
  nextLevel(): void;
  leaveLevel(): void;
}

export interface LobbyView {
  me: string;
  players: PlayerInfo[];
  levelId: string;
  progress: Progress;
}

function stars(n: number): string {
  return "★".repeat(n) + `<span class="off">${"★".repeat(3 - n)}</span>`;
}

/** 로비·결과·메뉴 패널 */
export class Ui {
  private lobby = $<HTMLElement>("#lobby");
  private levels = $<HTMLOListElement>("#levels");
  private hint = $<HTMLParagraphElement>("#level-hint");
  private partnerState = $<HTMLSpanElement>("#partner-state");
  private readyBtn = $<HTMLButtonElement>("#ready-btn");
  private result = $<HTMLElement>("#result");
  private menu = $<HTMLElement>("#menu");
  private last: LobbyView | null = null;

  constructor(private h: UiHandlers) {
    for (const el of ELEMENTS) {
      $<HTMLButtonElement>(`.char-card[data-el="${el}"]`).addEventListener("click", () => {
        const me = this.mePlayer();
        h.pickElement(me?.element === el ? null : el);
      });
    }
    this.levels.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-id]");
      if (btn && !btn.disabled) h.pickLevel(btn.dataset.id!);
    });
    this.readyBtn.addEventListener("click", () => h.ready(!this.mePlayer()?.ready));

    this.result.addEventListener("click", (e) => {
      const act = (e.target as HTMLElement).closest<HTMLButtonElement>("button")?.dataset.act;
      if (act === "restart") h.restart();
      else if (act === "next") h.nextLevel();
      else if (act === "lobby") h.leaveLevel();
    });
    this.menu.addEventListener("click", (e) => {
      const act = (e.target as HTMLElement).closest<HTMLButtonElement>("button")?.dataset.act;
      if (act === "resume") this.toggleMenu(false);
      else if (act === "restart") {
        h.restart();
        this.toggleMenu(false);
      } else if (act === "leave" && confirm("레벨을 나가서 레벨 선택으로 돌아갈까요? 두 사람 모두 나가게 됩니다.")) {
        h.leaveLevel();
        this.toggleMenu(false);
      }
    });
  }

  private mePlayer(): PlayerInfo | undefined {
    return this.last?.players.find((p) => p.sessionId === this.last!.me);
  }

  get menuOpen(): boolean {
    return !this.menu.hidden;
  }

  toggleMenu(open = this.menu.hidden) {
    this.menu.hidden = !open;
  }

  showLobby(v: LobbyView | null) {
    this.lobby.hidden = !v;
    if (!v) return;
    this.last = v;
    const me = v.players.find((p) => p.sessionId === v.me);
    const partner = v.players.find((p) => p.sessionId !== v.me);

    for (const el of ELEMENTS) {
      const card = $<HTMLButtonElement>(`.char-card[data-el="${el}"]`);
      const owner = v.players.find((p) => p.element === el);
      card.classList.toggle("mine", owner === me && !!owner);
      card.disabled = !!owner && owner !== me;
      card.querySelector(".char-owner")!.textContent = owner ? owner.name + (owner === me ? " (나)" : "") : "비어 있음";
    }

    this.levels.innerHTML = LEVELS.map((l, i) => {
      const rec = v.progress[l.id];
      const open = isUnlocked(v.progress, l.id);
      const sel = l.id === v.levelId ? " selected" : "";
      return `<li><button type="button" data-id="${l.id}" class="${sel}" ${open ? "" : "disabled"}>
        <span class="num">${i + 1}${open ? "" : " · 잠김"}</span>
        <span>${l.name}</span>
        <span class="stars">${rec ? stars(rec.stars) : open ? '<span class="off">★★★</span>' : ""}</span>
      </button></li>`;
    }).join("");
    const level = LEVELS.find((l) => l.id === v.levelId);
    const rec = v.progress[v.levelId];
    this.hint.textContent = [level?.hint, rec ? `최고 기록 ${formatTime(rec.bestTicks)}` : ""].filter(Boolean).join(" · ");

    if (!partner) this.partnerState.textContent = "상대를 기다리는 중…";
    else if (!partner.connected) this.partnerState.textContent = `${partner.name} 님 재접속 대기 중…`;
    else if (!partner.element) this.partnerState.textContent = `${partner.name} 님이 캐릭터를 고르는 중`;
    else this.partnerState.textContent = `${partner.name} 님 ${partner.ready ? "준비 완료" : "준비 중"}`;

    this.readyBtn.disabled = !me?.element;
    this.readyBtn.textContent = me?.ready ? "준비 취소" : "준비";
    this.readyBtn.classList.toggle("is-ready", !!me?.ready);
    this.readyBtn.classList.toggle("primary", !me?.ready);
  }

  showResult(r: LevelResult | null, progress: Progress) {
    this.result.hidden = !r;
    if (!r) return;
    $("#result-stars").innerHTML = stars(r.stars);
    $("#result-detail").textContent = `${formatTime(r.ticks)} · 보석 ${r.gems}/${r.totalGems}`;
    const next = nextLevelId(r.levelId);
    const nextBtn = this.result.querySelector<HTMLButtonElement>('[data-act="next"]')!;
    nextBtn.hidden = !next;
    nextBtn.disabled = !next || !isUnlocked(progress, next);
  }
}
