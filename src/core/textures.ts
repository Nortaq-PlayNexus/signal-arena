import concreteImg from "../../public/images/concrete.jpg";
import steelImg from "../../public/images/steel.jpg";
import tarmacImg from "../../public/images/tarmac.jpg";

// World surfaces. Loaded from inlined data URLs, so nothing is fetched at
// runtime; every draw call degrades to a flat fill until the bitmap decodes.

function mk(src: string): HTMLImageElement {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  return img;
}

export const TEX = {
  tarmac: mk(tarmacImg),
  concrete: mk(concreteImg),
  steel: mk(steelImg),
};

export const texReady = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0;

/** Draw an image to cover a rect, preserving aspect ratio (CSS object-fit: cover). */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha = 1,
) {
  if (!texReady(img)) return;
  const ir = img.naturalWidth / img.naturalHeight;
  const r = w / h;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (ir > r) sw = img.naturalHeight * r;
  else sh = img.naturalWidth / r;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

/** Fill a rect with a repeating texture at a fixed world scale. */
export function drawTiled(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  tile: number,
  alpha = 1,
) {
  if (!texReady(img)) return;
  const pat = ctx.createPattern(img, "repeat");
  if (!pat) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const s = tile / img.naturalWidth;
  try {
    pat.setTransform(new DOMMatrix().scale(s));
    ctx.fillStyle = pat;
    ctx.fillRect(x, y, w, h);
  } catch {
    // no DOMMatrix: fall back to an unstretched cover draw rather than dying
    ctx.restore();
    drawCover(ctx, img, x, y, w, h, alpha);
    return;
  }
  ctx.restore();
}
