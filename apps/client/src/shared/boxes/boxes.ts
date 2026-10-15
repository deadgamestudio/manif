/*
 * Many coloured boxes as ONE mesh (#117). The shop fronts and the shop rooms
 * are built from dozens of plain boxes each; drawn one mesh per box, a street
 * of 17 shops costs hundreds of draw calls (twice that with shadows). Here
 * every box of a layer is baked into one geometry with its colour per vertex,
 * so a whole front is a handful of draws, whatever its kind.
 *
 * Built once per layout (per round, or when a shop breaks), never per frame.
 * Pure three.js, no React; only 3D code imports it, so it stays out of the
 * entry chunk.
 */
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, Euler, Matrix3, Matrix4, Quaternion, Vector3 } from "three";

export type V3 = readonly [number, number, number];

/** One box: its transform (unit box to where it stands) and its colour. */
export interface BoxPiece {
  matrix: Matrix4;
  color: Color;
}

const TEMPLATE = new BoxGeometry(1, 1, 1);

/** The matrix taking the unit box to a box of `size`, turned by `rot` (Euler XYZ), centred on `at`, inside `parent` if given. */
export function boxMatrix(at: V3, size: V3, rot?: V3, parent?: Matrix4): Matrix4 {
  const m = new Matrix4().compose(
    new Vector3(at[0], at[1], at[2]),
    new Quaternion().setFromEuler(new Euler(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0)),
    new Vector3(size[0], size[1], size[2]),
  );
  return parent ? m.premultiply(parent) : m;
}

/** A transform for a group of boxes: move to `at`, turn by `rot`, then scale (applied to the boxes first). */
export function groupMatrix(at: V3, rot?: V3, scale?: V3, parent?: Matrix4): Matrix4 {
  return boxMatrix(at, scale ?? [1, 1, 1], rot, parent);
}

/** Collects boxes for one merged mesh. */
export class BoxBatch {
  readonly pieces: BoxPiece[] = [];
  private readonly colors = new Map<string, Color>();

  add(at: V3, size: V3, color: string, rot?: V3, parent?: Matrix4): void {
    let c = this.colors.get(color);
    if (!c) {
      c = new Color(color);
      this.colors.set(color, c);
    }
    this.pieces.push({ matrix: boxMatrix(at, size, rot, parent), color: c });
  }
}

/**
 * Every box of `pieces` in one indexed geometry, with positions, normals and
 * vertex colours (`color`, for a material with `vertexColors`). Null for no
 * box, so the caller draws nothing. `template` swaps the unit box for another
 * unit shape (a plane, for one-sided walls), each piece being a copy of it.
 */
export function mergeBoxes(pieces: readonly BoxPiece[], template: BufferGeometry = TEMPLATE): BufferGeometry | null {
  if (pieces.length === 0) return null;
  const T_POS = template.getAttribute("position");
  const T_NORMAL = template.getAttribute("normal");
  const T_INDEX = template.getIndex()!;
  const vPer = T_POS.count;
  const iPer = T_INDEX.count;
  const positions = new Float32Array(pieces.length * vPer * 3);
  const normals = new Float32Array(pieces.length * vPer * 3);
  const colors = new Float32Array(pieces.length * vPer * 3);
  const index = new Uint32Array(pieces.length * iPer);
  const v = new Vector3();
  const normalMatrix = new Matrix3();
  pieces.forEach((p, n) => {
    normalMatrix.getNormalMatrix(p.matrix);
    for (let i = 0; i < vPer; i++) {
      const o = (n * vPer + i) * 3;
      v.fromBufferAttribute(T_POS, i).applyMatrix4(p.matrix);
      positions[o] = v.x;
      positions[o + 1] = v.y;
      positions[o + 2] = v.z;
      v.fromBufferAttribute(T_NORMAL, i).applyMatrix3(normalMatrix).normalize();
      normals[o] = v.x;
      normals[o + 1] = v.y;
      normals[o + 2] = v.z;
      colors[o] = p.color.r;
      colors[o + 1] = p.color.g;
      colors[o + 2] = p.color.b;
    }
    for (let i = 0; i < iPer; i++) index[n * iPer + i] = T_INDEX.getX(i) + n * vPer;
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(positions, 3));
  g.setAttribute("normal", new BufferAttribute(normals, 3));
  g.setAttribute("color", new BufferAttribute(colors, 3));
  g.setIndex(new BufferAttribute(index, 1));
  g.computeBoundingSphere();
  return g;
}
