// 런타임 아틀라스(public/art/atlas.png, tools/build-art.mjs로 생성) 불러오기와 그리기 도우미

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  /** "bottom": 기준점이 아래 가운데, "center": 가운데 */
  anchor: "bottom" | "center";
}

export interface Atlas {
  image: HTMLImageElement;
  background: HTMLImageElement;
  /** 아틀라스 픽셀 / 논리 px */
  scale: number;
  frames: Record<string, Frame>;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`이미지를 불러오지 못했습니다: ${src}`));
    img.src = src;
  });
}

export async function loadAtlas(base = "/art"): Promise<Atlas> {
  const [json, image, background] = await Promise.all([
    fetch(`${base}/atlas.json`).then((r) => r.json() as Promise<{ scale: number; frames: Record<string, Frame> }>),
    loadImage(`${base}/atlas.png`),
    loadImage(`${base}/background.webp`),
  ]);
  return { image, background, scale: json.scale, frames: json.frames };
}

export function frameSize(atlas: Atlas, name: string): { w: number; h: number } {
  const f = atlas.frames[name];
  if (!f) throw new Error(`unknown frame ${name}`);
  return { w: f.w / atlas.scale, h: f.h / atlas.scale };
}

/** 프레임을 기준점(x, y)에 원래 크기로 그린다. flip이면 좌우 반전 */
export function drawFrame(ctx: CanvasRenderingContext2D, atlas: Atlas, name: string, x: number, y: number, flip = false) {
  const f = atlas.frames[name];
  if (!f) return;
  const w = f.w / atlas.scale;
  const h = f.h / atlas.scale;
  const top = f.anchor === "bottom" ? y - h : y - h / 2;
  if (!flip) {
    ctx.drawImage(atlas.image, f.x, f.y, f.w, f.h, x - w / 2, top, w, h);
    return;
  }
  ctx.save();
  ctx.translate(x, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(atlas.image, f.x, f.y, f.w, f.h, -w / 2, top, w, h);
  ctx.restore();
}

/** 프레임을 사각형에 맞춰 늘려 그린다 */
export function drawFrameRect(ctx: CanvasRenderingContext2D, atlas: Atlas, name: string, x: number, y: number, w: number, h: number) {
  const f = atlas.frames[name];
  if (f) ctx.drawImage(atlas.image, f.x, f.y, f.w, f.h, x, y, w, h);
}

/**
 * 3분할 늘이기: 양 끝(cap 비율)은 그대로 두고 가운데만 늘린다.
 * 가로로 긴 발판은 axis "x", 세로로 긴 게이트는 axis "y"
 */
export function drawThreeSlice(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  axis: "x" | "y",
  cap = 0.25,
) {
  const f = atlas.frames[name];
  if (!f) return;
  const img = atlas.image;
  if (axis === "x") {
    const sc = Math.round(f.w * cap);
    const dc = Math.min((sc / f.h) * h, w / 2);
    ctx.drawImage(img, f.x, f.y, sc, f.h, x, y, dc, h);
    ctx.drawImage(img, f.x + sc, f.y, f.w - 2 * sc, f.h, x + dc, y, w - 2 * dc, h);
    ctx.drawImage(img, f.x + f.w - sc, f.y, sc, f.h, x + w - dc, y, dc, h);
  } else {
    const sc = Math.round(f.h * cap);
    const dc = Math.min((sc / f.w) * w, h / 2);
    ctx.drawImage(img, f.x, f.y, f.w, sc, x, y, w, dc);
    ctx.drawImage(img, f.x, f.y + sc, f.w, f.h - 2 * sc, x, y + dc, w, h - 2 * dc);
    ctx.drawImage(img, f.x, f.y + f.h - sc, f.w, sc, x, y + h - dc, w, dc);
  }
}
