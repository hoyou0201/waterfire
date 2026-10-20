// 클라이언트 ↔ 서버 메시지 형식

import type { Element } from "./level.ts";
import type { LevelResult, Progress } from "./progress.ts";
import type { GameState } from "./sim.ts";

export const ROOM_NAME = "game";

/** 방에 들어올 때 보내는 옵션 */
export interface JoinOptions {
  password: string;
  name: string;
}

/** lobby: 캐릭터·레벨 고르는 중, countdown: 시작 전 3초, playing: 레벨 진행 중(클리어 화면 포함) */
export type Phase = "lobby" | "countdown" | "playing";

/** 클라이언트 → 서버 */
export interface ClientMessages {
  /** 매 틱 보내는 입력. seq는 클라이언트가 1씩 올리는 번호, bits는 encodeInput 값 */
  input: { seq: number; bits: number };
  pickElement: Element | null;
  pickLevel: string;
  ready: boolean;
  restart: void;
  nextLevel: void;
  leaveLevel: void;
  /** 내 브라우저에 저장된 기록. 입장할 때 보낸다 */
  progress: Progress;
}

export interface PlayerInfo {
  sessionId: string;
  name: string;
  element: Element | null;
  connected: boolean;
  ready: boolean;
}

/** 서버 → 클라이언트 */
export interface ServerMessages {
  /** 방 구성·진행 단계·기록이 바뀔 때마다 */
  lobby: { phase: Phase; players: PlayerInfo[]; levelId: string; progress: Progress };
  /** countdown·playing 단계에서 20Hz로 */
  snapshot: {
    frame: number;
    phase: Phase;
    levelId: string;
    /** 시작까지 남은 틱 */
    countdown: number;
    state: GameState;
    /** sessionId → 서버가 마지막으로 적용한 입력 seq */
    acks: Record<string, number>;
    /** 서버가 지금 적용 중인 각 캐릭터의 입력 bits */
    inputs: Record<Element, number>;
  };
  /** 레벨 클리어 */
  result: LevelResult;
}
