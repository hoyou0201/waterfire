// 레벨 풀이 스크립트를 실제 시뮬레이션으로 돌려 보는 테스트 도구.
// 레벨마다 "정말 깰 수 있는가"를 자동 테스트로 보장하는 데 쓴다.

import { CHAR_W, GROUND_DECEL, TILE } from "./constants.ts";
import type { Element, Level } from "./level.ts";
import { type GameState, type Input, NO_INPUT, createState, step } from "./sim.ts";

export type Cmd =
  /** 땅에서 걸어서 발밑 중앙이 x(타일 단위)에 오게 한다 */
  | { c: Element; walk: number }
  /**
   * dir 방향으로 점프하고 착지할 때까지 기다린다.
   * runup(타일)만큼 먼저 달려서 속도를 붙인 뒤 뛴다. to(타일)를 지나면 방향키를 뗀다. release틱 뒤 점프키를 떼면 낮게 뛴다
   */
  | { c: Element; jump: -1 | 0 | 1; runup?: number; to?: number; release?: number }
  /** 아무것도 누르지 않고 기다린다 */
  | { wait: number };

export class AutopilotError extends Error {}

const MAX_TICKS_PER_CMD = 900;

function press(dir: number, jump = false): Input {
  return { left: dir < 0, right: dir > 0, jump };
}

export function describe(s: GameState): string {
  const c = (el: Element) => {
    const ch = s.chars[el];
    return `${el}(${((ch.x + CHAR_W / 2) / TILE).toFixed(2)}, ${(ch.y / TILE).toFixed(2)}${ch.onGround ? " ground" : ""})`;
  };
  return `tick ${s.tick} ${s.status} ${c("fire")} ${c("water")}`;
}

/**
 * 풀이를 실행하고 마지막 상태를 돌려준다. 누가 죽거나 명령이 끝나지 않으면 AutopilotError.
 * onInputs로 틱마다 넣은 입력을 받아 볼 수 있다 (서버 통합 테스트용 녹화)
 */
export function play(
  level: Level,
  cmds: Cmd[],
  trace?: (line: string) => void,
  onInputs?: (inputs: Record<Element, Input>) => void,
): GameState {
  let s = createState(level);
  const tick = (el: Element | null, input: Input) => {
    const inputs = { fire: NO_INPUT, water: NO_INPUT };
    if (el) inputs[el] = input;
    onInputs?.(inputs);
    s = step(level, s, inputs);
    if (s.status === "dead") throw new AutopilotError(`${s.deadChar} died: ${describe(s)}`);
  };
  // 떨어지는 중인 캐릭터가 자리 잡게 한다
  for (let i = 0; i < 30; i++) tick(null, NO_INPUT);

  cmds.forEach((cmd, idx) => {
    const fail = (why: string) => new AutopilotError(`cmd #${idx} ${JSON.stringify(cmd)}: ${why}: ${describe(s)}`);
    if ("wait" in cmd) {
      for (let i = 0; i < cmd.wait; i++) tick(null, NO_INPUT);
    } else if ("walk" in cmd) {
      const target = cmd.walk * TILE;
      let n = 0;
      for (; n < MAX_TICKS_PER_CMD; n++) {
        const c = s.chars[cmd.c];
        const d = target - (c.x + CHAR_W / 2);
        if (Math.abs(d) < 1.5) {
          if (Math.abs(c.vx) < 1) break;
          tick(cmd.c, NO_INPUT);
          continue;
        }
        const stopDist = (c.vx * c.vx) / (2 * GROUND_DECEL);
        const dir = Math.sign(d);
        const braking = Math.sign(c.vx) === dir && Math.abs(d) <= stopDist;
        tick(cmd.c, press(braking ? 0 : dir));
        if (s.status === "won") return;
      }
      if (n === MAX_TICKS_PER_CMD) throw fail("could not reach");
    } else {
      // 점프는 키를 새로 눌러야 하므로 이전 점프키를 한 틱 뗀다
      if (s.chars[cmd.c].jumpHeld) tick(null, NO_INPUT);
      if (cmd.runup) {
        const start = s.chars[cmd.c].x;
        let n = 0;
        while (Math.abs(s.chars[cmd.c].x - start) < cmd.runup * TILE) {
          if (++n > MAX_TICKS_PER_CMD) throw fail("run-up blocked");
          tick(cmd.c, press(cmd.jump));
        }
      }
      let airborne = false;
      let n = 0;
      for (; n < MAX_TICKS_PER_CMD; n++) {
        const c = s.chars[cmd.c];
        const cx = (c.x + CHAR_W / 2) / TILE;
        const passed = cmd.to !== undefined && (cmd.jump > 0 ? cx >= cmd.to : cx <= cmd.to);
        const holdJump = cmd.release === undefined || n < cmd.release;
        tick(cmd.c, press(passed ? 0 : cmd.jump, holdJump && !(airborne && s.chars[cmd.c].onGround)));
        if (s.status === "won") return;
        if (!s.chars[cmd.c].onGround) airborne = true;
        else if (airborne) break;
      }
      if (!airborne) throw fail("never left the ground");
      if (n === MAX_TICKS_PER_CMD) throw fail("never landed");
      // 착지 후 미끄러짐이 멈출 때까지
      for (let i = 0; i < 20 && Math.abs(s.chars[cmd.c].vx) > 0; i++) tick(null, NO_INPUT);
    }
    trace?.(`#${idx} ${JSON.stringify(cmd)} → ${describe(s)}`);
  });

  for (let i = 0; i < 5 && s.status === "playing"; i++) tick(null, NO_INPUT);
  return s;
}
