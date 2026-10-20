import { type JoinOptions, type Progress, mergeProgress, sanitizeProgress } from "@waterfire/shared";

// 브라우저 저장소. 사생활 보호 모드 등에서는 실패할 수 있어서 항상 try/catch로 감싼다.

const LOGIN_KEY = "waterfire.login";
const PROGRESS_KEY = "waterfire.progress";

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장이 안 되는 환경이면 다음에 다시 입력하면 된다
  }
}

export function loadLogin(): Partial<JoinOptions> {
  const v = read(LOGIN_KEY);
  return typeof v === "object" && v !== null ? (v as Partial<JoinOptions>) : {};
}

export function saveLogin(login: JoinOptions) {
  write(LOGIN_KEY, login);
}

export function loadProgress(): Progress {
  return sanitizeProgress(read(PROGRESS_KEY));
}

/** 받은 기록을 내 기록과 합쳐서 저장한다 */
export function saveProgress(p: Progress): Progress {
  const merged = mergeProgress(loadProgress(), p);
  write(PROGRESS_KEY, merged);
  return merged;
}
