export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function containedRect(
  width: number,
  height: number,
  sourceWidth: number,
  sourceHeight: number,
): Rect {
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const w = sourceWidth * scale,
    h = sourceHeight * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}
export function sourceCrop(
  selection: Rect,
  display: Rect,
  sourceWidth: number,
  sourceHeight: number,
): Rect {
  const clamp = (n: number, min: number, max: number) =>
    Math.max(min, Math.min(n, max));
  const x1 = clamp((selection.x - display.x) / display.width, 0, 1),
    y1 = clamp((selection.y - display.y) / display.height, 0, 1);
  const x2 = clamp(
      (selection.x + selection.width - display.x) / display.width,
      0,
      1,
    ),
    y2 = clamp(
      (selection.y + selection.height - display.y) / display.height,
      0,
      1,
    );
  const x = Math.floor(x1 * sourceWidth),
    y = Math.floor(y1 * sourceHeight);
  return {
    x,
    y,
    width: Math.max(0, Math.ceil(x2 * sourceWidth) - x),
    height: Math.max(0, Math.ceil(y2 * sourceHeight) - y),
  };
}
