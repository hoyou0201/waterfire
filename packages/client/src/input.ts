import type { Input } from "@waterfire/shared";

const LEFT = new Set(["ArrowLeft", "KeyA"]);
const RIGHT = new Set(["ArrowRight", "KeyD"]);
const JUMP = new Set(["ArrowUp", "KeyW", "Space"]);
const GAME_KEYS = new Set([...LEFT, ...RIGHT, ...JUMP, "KeyR"]);

/** R을 이 시간(ms) 이상 누르면 재시작 */
const RESTART_HOLD_MS = 1000;

/** 키보드 상태 추적. 두 플레이어 모두 방향키와 WASD 중 편한 쪽을 쓴다 */
export class Keyboard {
  private down = new Set<string>();
  private restartSince: number | null = null;
  private restartFired = false;

  constructor(target: Window) {
    target.addEventListener("keydown", (e) => {
      if (!GAME_KEYS.has(e.code) || isTyping(e)) return;
      e.preventDefault();
      this.down.add(e.code);
      if (e.code === "KeyR" && this.restartSince === null) this.restartSince = performance.now();
    });
    target.addEventListener("keyup", (e) => {
      this.down.delete(e.code);
      if (e.code === "KeyR") {
        this.restartSince = null;
        this.restartFired = false;
      }
    });
    // 창이 포커스를 잃으면 keyup이 오지 않으므로 모두 뗀 것으로 본다
    target.addEventListener("blur", () => {
      this.down.clear();
      this.restartSince = null;
      this.restartFired = false;
    });
  }

  read(): Input {
    const any = (keys: Set<string>) => [...keys].some((k) => this.down.has(k));
    return { left: any(LEFT), right: any(RIGHT), jump: any(JUMP) };
  }

  /** R 길게 누르기 진행도(0~1). 재시작이 막 확정된 프레임에만 fired가 true */
  restartProgress(now: number): { progress: number; fired: boolean } {
    if (this.restartSince === null) return { progress: 0, fired: false };
    const progress = Math.min((now - this.restartSince) / RESTART_HOLD_MS, 1);
    const fired = progress >= 1 && !this.restartFired;
    if (fired) this.restartFired = true;
    return { progress: this.restartFired ? 0 : progress, fired };
  }
}

function isTyping(e: KeyboardEvent): boolean {
  return e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
}
