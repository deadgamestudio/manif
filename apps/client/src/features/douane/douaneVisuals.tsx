/*
 * LOOK for La Douane (#120): a small cartoon kid, shirtless, in bright
 * shorts, holding an oversized blue-and-white water gun (made in Blender for
 * #120, `accessories.waterGun`). A cartoon only: no face, no likeness, nothing
 * about his body but that he is small.
 *
 * The body is the neutral protester (the shared rig and clips) scaled down,
 * its top painted his skin (shirtless) and its trousers a bright colour, so
 * no new body file. The gun rides the `spine` bone, held at the waist in
 * front of him (the `carry-light` clip puts both hands there), so it follows
 * every step. Primitives show while the models load, and for good if they fail.
 *
 * Drawn like a protester: feet at y = 0, up +Y, front +Z.
 */
import { useMemo, useRef, useState } from "react";
import { createPortal, useFrame } from "@react-three/fiber";
import { Vector3, type Group } from "three";
import { DOUANE } from "@manif/shared";
import { MODELS, useStaticModel } from "../models/index.ts";
import { BodyMotion, MOVE_FROM, PEOPLE, WALK_AUTHORED_SPEED, useProtesterBody } from "../player/index.ts";
import { damp } from "../../shared/iso/index.ts";
import { SHORTS, douanePaint } from "./look.ts";

/** The neutral body, this much smaller: a kid of about 1.1 m. */
export const KID_SCALE = 0.62;
/** The neutral body's height at scale 1, feet to the top of the head. */
const BODY_HEIGHT = 1.75;
export const DOUANE_HEIGHT = BODY_HEIGHT * KID_SCALE;

/** The gun on the `spine` bone (unrotated at rest: Y up, +Z front), at the hands of `carry-light`, in body units. */
const GUN_BONE = "spine";
const GUN_AT: readonly [number, number, number] = [0.04, -0.08, 0.24];
/** On top of the kid's scale, so it looks properly oversized. */
const GUN_SCALE = 1.5;
/** The gun's `muzzle` node, in its own units (+Z forward, Y up). */
const MUZZLE: readonly [number, number, number] = [0, 0.06, 0.595];
/** The spine bone's height at rest, body units. */
const SPINE_Y = 1.07;

/** Where the water leaves the gun, in the body's facing group (world units), for the jet. */
export const DOUANE_MUZZLE = {
  y: (SPINE_Y + GUN_AT[1] + MUZZLE[1] * GUN_SCALE) * KID_SCALE,
  z: (GUN_AT[2] + MUZZLE[2] * GUN_SCALE) * KID_SCALE,
} as const;

const PLACEHOLDER_SKIN = "#c58c64";
const GUN_BLUE = "#2e86d8";
const GUN_WHITE = "#e2dac6";

/** The body and his gun. `spraying()` is read each frame. */
export function DouaneModel({ skin, spraying }: { skin: number; spraying: () => boolean }) {
  const paint = useMemo(() => douanePaint(skin, PEOPLE), [skin]);
  const model = useProtesterBody(MODELS.characters.neutral, paint);
  const gun = useStaticModel(MODELS.props.waterGun);
  const spine = useMemo(() => model?.root.getObjectByName(GUN_BONE) ?? null, [model]);
  const motion = useMemo(() => (model ? new BodyMotion(model.animator) : null), [model]);
  const anchor = useRef<Group>(null);
  const [last] = useState(() => new Vector3(Number.NaN, 0, 0));
  const [here] = useState(() => new Vector3());
  const speed = useRef(0);

  useFrame((_, dt) => {
    const a = anchor.current;
    if (!motion || !a) return;
    a.getWorldPosition(here);
    if (Number.isFinite(last.x) && dt > 0) speed.current += (here.distanceTo(last) / dt - speed.current) * damp(10, dt);
    last.copy(here);
    // His stride is a kid's, so the same speed is a quicker walk.
    const pace = speed.current / KID_SCALE;
    const moving = pace >= MOVE_FROM && !spraying();
    // Both hands on the gun: carry-light walking, and nearly still (a little sway) while standing to fire.
    const timeScale = moving ? Math.min(2.2, Math.max(0.7, pace / WALK_AUTHORED_SPEED)) : 0.06;
    motion.drive({ name: "carry-light", hold: false, timeScale }, pace);
    motion.tick(dt, true);
  });

  if (model) {
    return (
      <group ref={anchor} scale={KID_SCALE}>
        <primitive object={model.root} dispose={null} />
        {spine &&
          gun &&
          createPortal(
            <group position={GUN_AT} scale={GUN_SCALE}>
              <primitive object={gun} dispose={null} />
            </group>,
            spine,
          )}
      </group>
    );
  }
  return <DouanePlaceholder />;
}

function DouanePlaceholder() {
  const r = DOUANE.radius;
  const h = DOUANE_HEIGHT;
  return (
    <group>
      <mesh position-y={h * 0.62} castShadow>
        <capsuleGeometry args={[r * 0.8, h * 0.35, 4, 10]} />
        <meshStandardMaterial color={PLACEHOLDER_SKIN} />
      </mesh>
      <mesh position-y={h * 0.22} castShadow>
        <boxGeometry args={[r * 1.6, h * 0.36, r * 1.2]} />
        <meshStandardMaterial color={SHORTS[0]} />
      </mesh>
      {/* The gun, sticking out in front. */}
      <mesh position={[0, DOUANE_MUZZLE.y, DOUANE_MUZZLE.z / 2]} castShadow>
        <boxGeometry args={[0.08, 0.08, DOUANE_MUZZLE.z]} />
        <meshStandardMaterial color={GUN_BLUE} />
      </mesh>
      <mesh position={[0, DOUANE_MUZZLE.y + 0.09, DOUANE_MUZZLE.z * 0.4]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.07, 0.07, 0.2, 10]} />
        <meshStandardMaterial color={GUN_WHITE} />
      </mesh>
    </group>
  );
}
