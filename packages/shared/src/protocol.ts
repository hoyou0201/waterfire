// 클라이언트 ↔ 서버 메시지 형식

import type { Element } from "./level.ts";
import type { GameState } from "./sim.ts";

export const ROOM_NAME = "game";

/** 방에 들어올 때 보내는 옵션 */
export interface JoinOptions {
  password: string;
  name: string;
}

/** 클라이언트 → 서버 */
export interface ClientMessages {
  /** 현재 눌린 키 비트(encodeInput). 바뀔 때만 보낸다 */
  input: number;
  restart: void;
}

export interface PlayerInfo {
  sessionId: string;
  name: string;
  element: Element;
  connected: boolean;
}

/** 서버 → 클라이언트 */
export interface ServerMessages {
  /** 방 구성이 바뀔 때마다 */
  lobby: { players: PlayerInfo[]; levelId: string };
  /** 서버 프레임 번호와 시뮬레이션 상태 */
  snapshot: { frame: number; state: GameState };
}
