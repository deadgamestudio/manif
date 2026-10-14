import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, EdgesGeometry, LineBasicMaterial, MeshStandardMaterial, Vector3, type BufferGeometry, type LineSegments, type Mesh } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BoxObstacle, ShopRoom } from "@manif/shared";
import { findOccluders, type OcclusionCamera, type Point3 } from "./occlusion.ts";

/*
 * The building blocks along the street (#80, #84). Each block is drawn as the
 * pieces left around its shop rooms (the very boxes the server collides
 * with), plus a ceiling slab over each room up to the block's roof, so from
 * outside the facade still reads as one building. A block is one mesh with
 * its own material: the blocks standing between the camera and someone who
 * matters fade to see-through, and only those. A target inside a room sits
 * inside its block's whole box, so the same test fades the block for it.
 * The test runs a few times a second; the opacity moves every frame.
 */

/** Opacity of a building in the way. */
const FADED = 0.3;
/** Seconds to fade out, and to come back solid. */
const FADE_OUT = 0.15;
const FADE_IN = 0.3;
/** Seconds between two occlusion tests. */
const TEST_EVERY = 0.1;
/** Opacity of the outline at full fade, so the street still reads. */
const EDGE_OPACITY = 0.55;

/** One building block of the level, with what is left of it around this round's shop rooms. */
export interface BuildingSpec {
  /** The whole block, as the level has it: the occlusion test runs on it, so a target inside one of its rooms fades it. */
  box: BoxObstacle;
  /** What is drawn: the pieces around its rooms (just `box` when it has none), from `carveLevel`. */
  pieces: readonly BoxObstacle[];
  /** The shop rooms carved out of it. Each gets a ceiling slab from its height up to the block's roof. */
  rooms: readonly ShopRoom[];
  color: string;
}

interface Building {
  spec: BuildingSpec;
  geometry: BufferGeometry;
  edges: EdgesGeometry;
  material: MeshStandardMaterial;
  edgeMaterial: LineBasicMaterial;
}

const reducedMotion = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

/** A box from y = 0 to `height` (or between two heights), in world coordinates. */
function boxAt(minX: number, maxX: number, minZ: number, maxZ: number, minY: number, maxY: number): BoxGeometry {
  const g = new BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ);
  g.translate((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  return g;
}

/** A block's pieces and room ceilings, merged into one geometry in world coordinates. */
function blockGeometry(spec: BuildingSpec): BufferGeometry {
  const parts: BoxGeometry[] = spec.pieces.map((p) => boxAt(p.x - p.halfX, p.x + p.halfX, p.z - p.halfZ, p.z + p.halfZ, 0, p.height));
  for (const r of spec.rooms) {
    if (spec.box.height > r.height) parts.push(boxAt(r.rect.minX, r.rect.maxX, r.rect.minZ, r.rect.maxZ, r.height, spec.box.height));
  }
  if (parts.length === 1) return parts[0]!;
  const merged = mergeGeometries(parts) ?? boxAt(0, 0, 0, 0, 0, 0);
  for (const p of parts) p.dispose();
  return merged;
}

export function BuildingsView({
  buildings,
  targets,
}: {
  /** Rebuilt once per round layout at most, never per frame. */
  buildings: readonly BuildingSpec[];
  /** The characters that must stay visible, read a few times a second. None: nothing fades. */
  targets?: () => readonly Point3[];
}) {
  const items = useMemo(
    () =>
      buildings.map((spec): Building => {
        const { box } = spec;
        // The outline is the whole block's, so a faded block shows no seams between its pieces.
        const outline = boxAt(box.x - box.halfX, box.x + box.halfX, box.z - box.halfZ, box.z + box.halfZ, 0, box.height);
        const edges = new EdgesGeometry(outline);
        outline.dispose();
        return {
          spec,
          geometry: blockGeometry(spec),
          edges,
          material: new MeshStandardMaterial({ color: spec.color }),
          edgeMaterial: new LineBasicMaterial({ color: "#f4efe6", transparent: true, opacity: 0, depthWrite: false }),
        };
      }),
    [buildings],
  );
  // Each building's current opacity, by index; missing means solid.
  const opacities = useRef<number[]>([]);
  const meshRefs = useRef<(Mesh | null)[]>([]);
  const edgeRefs = useRef<(LineSegments | null)[]>([]);
  useEffect(() => {
    // A new layout keeps the meshes (same keys) with fresh, solid materials: put the flags back to match.
    opacities.current = [];
    for (const m of meshRefs.current) if (m) m.castShadow = true;
    for (const e of edgeRefs.current) if (e) e.visible = false;
    return () => {
      for (const b of items) {
        b.geometry.dispose();
        b.edges.dispose();
        b.material.dispose();
        b.edgeMaterial.dispose();
      }
    };
  }, [items]);

  const occluded = useRef(new Set<number>());
  const sinceTest = useRef(TEST_EVERY);
  const boxes = useMemo(() => items.map((b) => b.spec.box), [items]);
  const cam = useRef({ position: new Vector3(), direction: new Vector3(), orthographic: true as boolean } satisfies OcclusionCamera);

  useFrame(({ camera }, dt) => {
    sinceTest.current += dt;
    if (sinceTest.current >= TEST_EVERY) {
      sinceTest.current = 0;
      const list = targets?.() ?? [];
      // The actual camera every time, not the iso offset: a third-person camera (#20) must work too.
      const c = cam.current;
      c.position.copy(camera.position);
      camera.getWorldDirection(c.direction);
      c.orthographic = "isOrthographicCamera" in camera;
      findOccluders(boxes, list, c, occluded.current);
    }

    const instant = reducedMotion?.matches === true;
    for (let i = 0; i < items.length; i++) {
      const was = opacities.current[i] ?? 1;
      const goal = occluded.current.has(i) ? FADED : 1;
      if (was === goal) continue;
      // prefers-reduced-motion: switch at once.
      const step = ((1 - FADED) / (goal < was ? FADE_OUT : FADE_IN)) * dt;
      const next = instant ? goal : goal < was ? Math.max(goal, was - step) : Math.min(goal, was + step);
      opacities.current[i] = next;
      setOpacity(items[i]!, next, meshRefs.current[i] ?? null, edgeRefs.current[i] ?? null);
    }
  });

  return (
    <>
      {items.map((b, i) => (
        <group key={b.spec.box.id}>
          <mesh
            ref={(el) => {
              meshRefs.current[i] = el;
            }}
            geometry={b.geometry}
            material={b.material}
            castShadow
            receiveShadow
          />
          <lineSegments
            ref={(el) => {
              edgeRefs.current[i] = el;
            }}
            geometry={b.edges}
            material={b.edgeMaterial}
            visible={false}
          />
        </group>
      ))}
    </>
  );
}

/**
 * Applies a building's opacity. Solid buildings stay opaque, write depth and
 * cast shadows; see-through ones stop writing depth (so they never hide what
 * is behind them or sort wrongly against the ground) and stop casting shadows
 * (a faded block left striped shadows on the street, #80). The material and
 * the shadow flag only change when it switches between the two, never while
 * the opacity moves.
 */
function setOpacity(b: Building, opacity: number, mesh: Mesh | null, edge: LineSegments | null) {
  const solid = opacity >= 1;
  if (b.material.transparent === solid) {
    b.material.transparent = !solid;
    b.material.depthWrite = solid;
    b.material.needsUpdate = true;
    if (mesh) mesh.castShadow = solid;
  }
  b.material.opacity = opacity;
  const amount = (1 - opacity) / (1 - FADED);
  b.edgeMaterial.opacity = EDGE_OPACITY * amount;
  if (edge) edge.visible = !solid;
}
