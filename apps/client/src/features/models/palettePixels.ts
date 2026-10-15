/**
 * The pixel side of skin recolouring (#28), pure. Jordan's models colour
 * everything from a 16×1 palette strip: one cell per colour, and the skin is
 * cell 6 (zero-based) on every model, whatever the role.
 */

export const PALETTE_CELLS = 16;
export const SKIN_CELL = 6;

/** A palette strip: 16 cells across (one pixel each in Jordan's files), at most a cell tall. */
export function isPaletteSize(width: number, height: number): boolean {
  return width >= PALETTE_CELLS && width % PALETTE_CELLS === 0 && height >= 1 && height * PALETTE_CELLS <= width;
}

/** `#8d6e63` or `8d6e63` → [141, 110, 99]. Throws on anything else. */
export function parseHexColour(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Palette cells to repaint: cell index → `#rrggbb` (#109: the police uniform). */
export type CellPaint = Readonly<Record<number, string>>;

/** A stable key for `paint` (cells in order, colours lower-cased), for caching one texture per distinct set. Throws on a bad cell or colour. */
export function paintKey(paint: CellPaint): string {
  return Object.entries(paint)
    .map(([cell, colour]) => {
      const n = Number(cell);
      if (!Number.isInteger(n) || n < 0 || n >= PALETTE_CELLS) throw new Error(`not a palette cell: ${cell}`);
      parseHexColour(colour);
      return [n, colour.trim().toLowerCase().replace(/^#?/, "#")] as const;
    })
    .sort((a, b) => a[0] - b[0])
    .map(([n, c]) => `${n}:${c}`)
    .join(",");
}

/** A copy of `rgba` (width × height) with every cell of `paint` painted its colour. */
export function paintCells(rgba: ArrayLike<number>, width: number, height: number, paint: CellPaint): Uint8Array {
  const out = Uint8Array.from(rgba);
  for (const [cell, colour] of Object.entries(paint)) paintInto(out, width, height, Number(cell), parseHexColour(colour));
  return out;
}

/**
 * A copy of the RGBA pixels `rgba` (width × height) with every pixel of cell
 * `cell` painted `rgb`, alpha opaque. The other cells are untouched.
 */
export function paintCell(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  cell: number,
  rgb: readonly [number, number, number],
): Uint8Array {
  return paintInto(Uint8Array.from(rgba), width, height, cell, rgb);
}

/** paintCell, in place on `out`. */
function paintInto(out: Uint8Array, width: number, height: number, cell: number, rgb: readonly [number, number, number]): Uint8Array {
  if (out.length !== width * height * 4) throw new Error(`expected ${width * height * 4} bytes, got ${out.length}`);
  const cellWidth = width / PALETTE_CELLS;
  const x0 = Math.round(cell * cellWidth);
  const x1 = Math.round((cell + 1) * cellWidth);
  for (let y = 0; y < height; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      out[i] = rgb[0];
      out[i + 1] = rgb[1];
      out[i + 2] = rgb[2];
      out[i + 3] = 255;
    }
  }
  return out;
}
