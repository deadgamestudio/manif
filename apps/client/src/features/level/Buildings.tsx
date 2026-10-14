import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, EdgesGeometry, LineBasicMaterial, MeshStandardMaterial, Vector3, type LineSegments } from "three";
import type { BoxObstacle } from "@manif/shared";
import { findOccluders, type OcclusionCamera, type Point3 } from "./occlusion.ts";

/*
 * The building blocks along the street (#80): each with its own material, so
 * the ones standing between the camera and someone who matters fade to see-
 * through, and only those. The test runs a few times a second; the opacity
 * moves every frame.
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

export interface BuildingSpec {
  box: BoxObstacle;
  color: string;
}

interface Building {
  spec: BuildingSpec;
  geometry: BoxGeometry;
  edges: EdgesGeometry;
  material: MeshStandardMaterial;
  edgeMaterial: LineBasicMaterial;
}

const reducedMotion = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

export function BuildingsView({
  buildings,
  targets,
}: {
  buildings: readonly BuildingSpec[];
  /** The characters that must stay visible, read a few times a second. None: nothing fades. */
  targets?: () => readonly Point3[];
}) {
  const items = useMemo(
    () =>
      buildings.map((spec): Building => {
        const { box } = spec;
        const geometry = new BoxGeometry(box.halfX * 2, box.height, box.halfZ * 2);
        return {
          spec,
          geometry,
          edges: new EdgesGeometry(geometry),
          material: new MeshStandardMaterial({ color: spec.color }),
          edgeMaterial: new LineBasicMaterial({ color: "#f4efe6", transparent: true, opacity: 0, depthWrite: false }),
        };
      }),
    [buildings],
  );
  // Each building's current opacity, by index; missing means solid.
  const opacities = useRef<number[]>([]);
  useEffect(() => {
    opacities.current = [];
    return () => {
      for (const b of items) {
        b.geometry.dispose();
        b.edges.dispose();
        b.material.dispose();
        b.edgeMaterial.dispose();
      }
    };
  }, [items]);

  const edgeRefs = useRef<(LineSegments | null)[]>([]);
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
      setOpacity(items[i]!, next, edgeRefs.current[i] ?? null);
    }
  });

  return (
    <>
      {items.map((b, i) => (
        <group key={b.spec.box.id} position={[b.spec.box.x, b.spec.box.height / 2, b.spec.box.z]}>
          <mesh geometry={b.geometry} material={b.material} castShadow receiveShadow />
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
 * Applies a building's opacity. Solid buildings stay opaque and write depth;
 * see-through ones stop writing depth so they never hide what is behind them
 * or sort wrongly against the ground. The material is only flagged for an
 * update when it switches between the two, never while the opacity moves.
 */
function setOpacity(b: Building, opacity: number, edge: LineSegments | null) {
  const solid = opacity >= 1;
  if (b.material.transparent === solid) {
    b.material.transparent = !solid;
    b.material.depthWrite = solid;
    b.material.needsUpdate = true;
  }
  b.material.opacity = opacity;
  const amount = (1 - opacity) / (1 - FADED);
  b.edgeMaterial.opacity = EDGE_OPACITY * amount;
  if (edge) edge.visible = !solid;
}
