// 시뮬레이션 상수. 길이는 px, 시간은 초 단위다. 수치는 docs/SPEC.md 4장의 시작값.

export const TILE = 32;
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
/** 서버가 스냅샷을 보내는 간격(틱). 60Hz / 3 = 20Hz */
export const SNAPSHOT_EVERY = 3;

export const CHAR_W = 24;
export const CHAR_H = 40;

export const MAX_RUN_SPEED = 6 * TILE;
export const GROUND_ACCEL = 2000;
export const GROUND_DECEL = 2400;
export const AIR_CONTROL = 0.6;

export const GRAVITY = 1800;
export const MAX_FALL_SPEED = 700;
/** 점프 높이 약 2.5타일: v0 = sqrt(2 * g * h) */
export const JUMP_SPEED = Math.sqrt(2 * GRAVITY * 2.5 * TILE);
/** 점프 키를 일찍 떼면 상승 속도에 곱하는 값 */
export const JUMP_CUT = 0.45;
export const COYOTE_TICKS = Math.round(0.08 * TICK_RATE);
export const JUMP_BUFFER_TICKS = Math.round(0.1 * TICK_RATE);

/** 사망 연출 후 재시작까지 걸리는 틱 */
export const DEATH_RESET_TICKS = Math.round(0.5 * TICK_RATE);
/** 웅덩이 판정 영역을 타일 양옆에서 안쪽으로 줄이는 폭. 가장자리를 밟는 건 봐준다 */
export const LIQUID_INSET = 4;
