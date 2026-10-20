// 아트 원본(assets/art/v1)을 게임에서 쓰는 런타임 아틀라스로 만든다.
//
// 원본 시트는 정확한 픽셀 그리드가 아니라서(assets/art/v1/README.md) 균등 분할하지 않고,
// 불투명 픽셀의 연결 영역을 찾아 무게중심이 속한 칸으로 묶은 뒤 그 경계로 자른다.
// 출력은 게임 논리 크기의 2배 해상도다 (화면을 2배로 그린다).
//
//   node tools/build-art.mjs
//
// 출력: packages/client/public/art/{atlas.png, atlas.json, background.webp, ui/*.png}

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "assets/art/v1");
const OUT = join(ROOT, "packages/client/public/art");
/** 런타임 해상도 배율 (논리 px × SCALE) */
const SCALE = 2;
/** 이보다 옅은 픽셀(빛 번짐)은 지운다 */
const ALPHA_CLEAN = 48;
/** 그림 경계를 찾을 때 쓰는 알파 기준 */
const ALPHA_SOLID = 128;
const PAD = 2;

/**
 * 시트 정의. names는 왼쪽→오른쪽, 위→아래 순서 (README의 프레임 순서).
 * size: 프레임을 줄이는 방법
 *   { fill: [w, h] }      정확히 이 크기로 늘이거나 줄임 (논리 px)
 *   { width: w } / { height: h }  비율 유지
 *   { uniform: "height"|"width"|"max", ref: 프레임이름, to: 논리 px }  시트 전체를 같은 배율로 (포즈 크기 차이 유지)
 * anchor: "bottom" (발밑 중앙) | "center"
 */
const SHEETS = [
  {
    file: "characters/fire-motion.png",
    prefix: "fire-",
    grid: [4, 3],
    names: ["idle-a", "idle-b", "run-a", "run-b", "run-c", "run-d", "jump", "fall", "land", "push", "hurt", "victory"],
    size: { uniform: "height", ref: "idle-a", to: 54 },
    anchor: "bottom",
  },
  {
    file: "characters/water-motion.png",
    prefix: "water-",
    grid: [4, 3],
    names: ["idle-a", "idle-b", "run-a", "run-b", "run-c", "run-d", "jump", "fall", "land", "push", "hurt", "victory"],
    size: { uniform: "height", ref: "idle-a", to: 54 },
    anchor: "bottom",
  },
  {
    file: "world/terrain.png",
    prefix: "tile-",
    grid: [4, 4],
    names: [
      "top-left", "top-center", "top-right", "interior",
      "left-wall", "right-wall", "bottom-edge", "isolated-block",
      "slope-up", "slope-down", "platform-left", "platform-right",
      "moss-top", "cracked-interior", "pillar-cap", "pillar-body",
    ],
    size: { fill: [32, 32] },
    anchor: "center",
    skip: ["platform-left", "platform-right", "pillar-cap", "pillar-body"],
  },
  {
    file: "world/liquids.png",
    prefix: "",
    grid: [4, 3],
    names: ["lava-1", "lava-2", "lava-3", "lava-4", "water-1", "water-2", "water-3", "water-4", "poison-1", "poison-2", "poison-3", "poison-4"],
    size: { width: 96 },
    anchor: "center",
  },
  {
    file: "objects/collectibles-exits.png",
    prefix: "",
    grid: [4, 2],
    names: ["fire-gem", "water-gem", "fire-exit", "water-exit", "fire-gem-glint", "water-gem-glint", "fire-exit-active", "water-exit-active"],
    size: { perFrame: { gem: { height: 22 }, exit: { height: 64 } } },
    anchor: "bottom",
  },
  {
    file: "objects/mechanisms.png",
    prefix: "",
    grid: [4, 3],
    names: [
      "lever-yellow-off", "lever-yellow-on", "button-yellow-up", "button-yellow-down",
      "lever-purple-off", "lever-purple-on", "button-purple-up", "button-purple-down",
      "crate", "platform-yellow", "platform-purple", "gate-yellow",
    ],
    size: { perFrame: { lever: { width: 30 }, button: { width: 30 }, crate: { fill: [32, 32] }, platform: { width: 96 }, gate: { width: 32 } } },
    anchor: "bottom",
  },
  {
    file: "effects/events.png",
    prefix: "fx-",
    grid: [4, 5],
    names: [
      "fire-out-1", "fire-out-2", "fire-out-3", "fire-out-4",
      "water-out-1", "water-out-2", "water-out-3", "water-out-4",
      "poison-out-1", "poison-out-2", "poison-out-3", "poison-out-4",
      "sparkle-1", "sparkle-2", "sparkle-3", "sparkle-4",
      "dust-1", "dust-2", "dust-3", "dust-4",
    ],
    size: { uniform: "max", ref: "fire-out-2", to: 56 },
    anchor: "center",
  },
];

/** UI에서 쓰는 개별 아이콘 (ui/*.png, 64px) */
const ICONS = {
  file: "ui/icons.png",
  grid: [4, 4],
  names: [
    "fire", "water", "clock", "restart",
    "menu", "sound-on", "sound-off", "ready",
    "connected", "disconnected", "locked", "unlocked",
    "star-full", "star-empty", "back", "next",
  ],
  keep: ["star-full", "star-empty", "locked"],
};

async function loadClean(file) {
  const { data, info } = await sharp(join(SRC, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < ALPHA_CLEAN) data[i - 3] = data[i - 2] = data[i - 1] = data[i] = 0;
  }
  return { data, w: info.width, h: info.height };
}

/** 불투명 픽셀의 연결 영역마다 경계 상자와 무게중심 */
function components({ data, w, h }) {
  const label = new Int32Array(w * h).fill(-1);
  const comps = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || data[start * 4 + 3] < ALPHA_SOLID) continue;
    const c = { x0: w, y0: h, x1: 0, y1: 0, sx: 0, sy: 0, n: 0 };
    let sp = 0;
    stack[sp++] = start;
    label[start] = comps.length;
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p - x) / w;
      c.n++;
      c.sx += x;
      c.sy += y;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === w - 1)) continue;
        if (label[q] !== -1 || data[q * 4 + 3] < ALPHA_SOLID) continue;
        label[q] = comps.length;
        stack[sp++] = q;
      }
    }
    comps.push(c);
  }
  return comps.filter((c) => c.n >= 12);
}

/** 연결 영역을 무게중심이 속한 격자 칸으로 묶어 칸마다 경계 상자를 만든다 */
function cellBoxes(img, [cols, rows]) {
  const boxes = Array.from({ length: cols * rows }, () => null);
  for (const c of components(img)) {
    const col = Math.min(cols - 1, Math.floor((c.sx / c.n / img.w) * cols));
    const row = Math.min(rows - 1, Math.floor((c.sy / c.n / img.h) * rows));
    const i = row * cols + col;
    const b = boxes[i] ?? { x0: img.w, y0: img.h, x1: 0, y1: 0 };
    boxes[i] = { x0: Math.min(b.x0, c.x0), y0: Math.min(b.y0, c.y0), x1: Math.max(b.x1, c.x1), y1: Math.max(b.y1, c.y1) };
  }
  return boxes.map((b, i) => {
    if (!b) throw new Error(`empty cell ${i}`);
    const x0 = Math.max(0, b.x0 - PAD);
    const y0 = Math.max(0, b.y0 - PAD);
    return { left: x0, top: y0, width: Math.min(img.w, b.x1 + PAD + 1) - x0, height: Math.min(img.h, b.y1 + PAD + 1) - y0 };
  });
}

function targetSize(sheet, name, box, boxes) {
  let spec = sheet.size;
  if (spec.perFrame) spec = Object.entries(spec.perFrame).find(([k]) => name.includes(k))[1];
  const px = (v) => Math.max(1, Math.round(v * SCALE));
  if (spec.fill) return [px(spec.fill[0]), px(spec.fill[1])];
  if (spec.width) return [px(spec.width), px((spec.width * box.height) / box.width)];
  if (spec.height) return [px((spec.height * box.width) / box.height), px(spec.height)];
  const ref = boxes[sheet.names.indexOf(spec.ref)];
  const refLen = spec.uniform === "height" ? ref.height : spec.uniform === "width" ? ref.width : Math.max(ref.width, ref.height);
  const k = spec.to / refLen;
  return [px(box.width * k), px(box.height * k)];
}

async function cut(img, box, [w, h]) {
  return sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } })
    .extract(box)
    .resize(w, h, { fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();
}

/** 단순 선반(shelf) 배치 */
function pack(frames, maxW = 2048, gap = 2) {
  const sorted = [...frames].sort((a, b) => b.h - a.h);
  let x = gap;
  let y = gap;
  let rowH = 0;
  for (const f of sorted) {
    if (x + f.w + gap > maxW) {
      x = gap;
      y += rowH + gap;
      rowH = 0;
    }
    f.x = x;
    f.y = y;
    x += f.w + gap;
    rowH = Math.max(rowH, f.h);
  }
  return { width: maxW, height: y + rowH + gap };
}

async function main() {
  await mkdir(join(OUT, "ui"), { recursive: true });
  const frames = [];

  for (const sheet of SHEETS) {
    const img = await loadClean(sheet.file);
    const boxes = cellBoxes(img, sheet.grid);
    for (const [i, name] of sheet.names.entries()) {
      if (sheet.skip?.includes(name)) continue;
      const [w, h] = targetSize(sheet, name, boxes[i], boxes);
      const buf = await cut(img, boxes[i], [w, h]);
      frames.push({ name: sheet.prefix + name, buf, w, h, anchor: sheet.anchor });
    }
    console.log(`${sheet.file}: ${sheet.names.length - (sheet.skip?.length ?? 0)} frames`);
  }

  // 원본에는 노란 게이트만 있어서 색상을 돌려 보라 게이트를 만든다 (돌 부분은 무채색이라 그대로)
  const gate = frames.find((f) => f.name === "gate-yellow");
  frames.push({ ...gate, name: "gate-purple", buf: await sharp(gate.buf).modulate({ hue: 225 }).png().toBuffer() });

  const { width, height } = pack(frames);
  const atlas = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(frames.map((f) => ({ input: f.buf, left: f.x, top: f.y })))
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  await writeFile(join(OUT, "atlas.png"), atlas);

  const json = {
    scale: SCALE,
    frames: Object.fromEntries(
      frames
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((f) => [f.name, { x: f.x, y: f.y, w: f.w, h: f.h, anchor: f.anchor }]),
    ),
  };
  await writeFile(join(OUT, "atlas.json"), JSON.stringify(json, null, 1) + "\n");
  console.log(`atlas ${width}x${height}, ${frames.length} frames, ${(atlas.length / 1024).toFixed(0)} KB`);

  // 배경: 30×17 타일(960×544)을 덮도록
  await sharp(join(SRC, "world/temple-background.png"))
    .resize(960 * SCALE, 544 * SCALE, { fit: "cover" })
    .webp({ quality: 82 })
    .toFile(join(OUT, "background.webp"));

  // UI 아이콘과 캐릭터 얼굴
  const icons = await loadClean(ICONS.file);
  const iconBoxes = cellBoxes(icons, ICONS.grid);
  for (const [i, name] of ICONS.names.entries()) {
    if (!ICONS.keep.includes(name)) continue;
    await sharp(icons.data, { raw: { width: icons.w, height: icons.h, channels: 4 } })
      .extract(iconBoxes[i])
      .resize(64, 64, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(join(OUT, "ui", `${name}.png`));
  }
  for (const el of ["fire", "water"]) {
    const f = frames.find((fr) => fr.name === `${el}-idle-a`);
    await sharp(f.buf).png().toFile(join(OUT, "ui", `${el}.png`));
  }
  console.log(`ui icons: ${ICONS.keep.length + 2}`);
}

await main();
