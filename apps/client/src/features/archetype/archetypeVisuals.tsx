/*
 * LOOKS of the archetypes (#14): clothing colours and one or two primitive
 * accessories each, all in this one file. Jordan's bodies (#28,
 * models/assets.ts ARCHETYPE_BODIES) replace the capsule and most props once
 * loaded; the primitives stay as the placeholder until then, and
 * `modelAccessories` adds what a body lacks.
 *
 * Humour boundary (PRODUCT.md, #14): an archetype is clothes, props and
 * attitude, never who wears them. Nothing here touches skin: the
 * placeholder's arms stay one neutral colour (SKIN, below), and Jordan's
 * bodies get a skin tone from the player's id alone, never from the
 * archetype (player/protesterLook.ts, #112).
 *
 * Accessories are drawn in the avatar's turning frame (PlayerAvatar.tsx):
 * feet at y = 0, the 1.8 m capsule up +Y, 0.4 m radius, front +Z, the
 * swinging arm on +X.
 */
import type { ReactNode } from "react";
import { Archetype, archetypeOf } from "@manif/shared";

/** The placeholders' one skin colour, whatever the archetype (Jordan's bodies: player/protesterLook.ts). */
export const SKIN = "#8d6e63";

export interface ArchetypeLook {
  /** The body (jacket, tracksuit, hoodie...): the capsule and the ragdoll's torso, head and sleeves. */
  clothes: string;
  /** For the lobby menu: an object emoji (never a person, so no skin tone either). */
  icon: string;
  /** Primitive props on the avatar, in its turning frame. Null: none. */
  accessories: (() => ReactNode) | null;
  /**
   * The props still worth adding on Jordan's body (#28), same frame as
   * `accessories`, when his model lacks them. Most bodies already carry
   * theirs (the bobo's scarf and phone, the CGT flag, the retraité's beret
   * and cane...), so only a few looks set this. Drawn riding the spine, so
   * they follow the body when it falls.
   */
  modelAccessories?: () => ReactNode;
}

function Mat({ color }: { color: string }) {
  return <meshStandardMaterial color={color} />;
}

/**
 * THREE.DoubleSide, as a literal: importing three here would pull it into the
 * lobby's chunk (the lobby imports this file for the menu swatches), and the
 * 3D code is meant to load only with the game.
 */
const DOUBLE_SIDE = 2;
const FLUO = "#d4ff1f";
const RED = "#e53935";

export const ARCHETYPE_LOOKS: Readonly<Record<Archetype, ArchetypeLook>> = {
  // Plain k-way blue, as every protester looked before #14.
  [Archetype.Lambda]: { clothes: "#42a5f5", icon: "📢", accessories: null },

  // Beige trench, a big orange scarf, phone held up to film.
  [Archetype.Bobo]: {
    clothes: "#cdb48c",
    icon: "🧣",
    accessories: () => (
      <>
        <mesh position-y={1.32} rotation-x={Math.PI / 2} castShadow>
          <torusGeometry args={[0.36, 0.1, 8, 20]} />
          <Mat color="#ef7d3c" />
        </mesh>
        <mesh position={[0.36, 1.33, 0.3]} castShadow>
          <boxGeometry args={[0.12, 0.42, 0.12]} />
          <Mat color="#ef7d3c" />
        </mesh>
        {/* The phone, up in front of the face. */}
        <mesh position={[-0.28, 1.72, 0.5]} rotation-x={-0.2} castShadow>
          <boxGeometry args={[0.14, 0.24, 0.03]} />
          <Mat color="#1c1c1c" />
        </mesh>
      </>
    ),
  },

  // Navy tracksuit with white side stripes, white cap, bum bag across the chest.
  [Archetype.Cite]: {
    clothes: "#26358a",
    icon: "🧢",
    accessories: () => (
      <>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.4, 0.75, 0]} castShadow>
            <boxGeometry args={[0.04, 1.05, 0.1]} />
            <Mat color="#f5f5f5" />
          </mesh>
        ))}
        <mesh position-y={1.79} castShadow>
          <cylinderGeometry args={[0.32, 0.34, 0.12, 16]} />
          <Mat color="#f5f5f5" />
        </mesh>
        <mesh position={[0, 1.76, 0.36]} castShadow>
          <boxGeometry args={[0.42, 0.04, 0.32]} />
          <Mat color="#f5f5f5" />
        </mesh>
        <mesh position={[0, 1.1, 0.38]} rotation-z={0.45} castShadow>
          <boxGeometry args={[0.42, 0.14, 0.12]} />
          <Mat color="#1c1c1c" />
        </mesh>
      </>
    ),
  },

  // Grey jacket under a fluo vest with reflective bands.
  [Archetype.GiletJaune]: {
    clothes: "#5d6d7e",
    icon: "🦺",
    accessories: () => (
      <>
        <mesh position-y={1.0} castShadow>
          <cylinderGeometry args={[0.43, 0.43, 0.8, 18]} />
          <Mat color={FLUO} />
        </mesh>
        {[0.78, 1.18].map((y) => (
          <mesh key={y} position-y={y}>
            <cylinderGeometry args={[0.44, 0.44, 0.07, 18]} />
            <Mat color="#cfd8dc" />
          </mesh>
        ))}
      </>
    ),
  },

  // All black, a hood up, swimming goggles.
  [Archetype.BlackBloc]: {
    clothes: "#161616",
    icon: "🏴",
    accessories: () => (
      <>
        <mesh position-y={1.4} castShadow>
          <sphereGeometry args={[0.43, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <Mat color="#060606" />
        </mesh>
        <mesh position={[0, 1.55, 0.36]} castShadow>
          <boxGeometry args={[0.46, 0.12, 0.1]} />
          <meshStandardMaterial color="#ff9800" emissive="#ff9800" emissiveIntensity={0.35} />
        </mesh>
      </>
    ),
  },

  // Brown jacket, red union bib, a red flag on a pole.
  [Archetype.Cgt]: {
    clothes: "#6d4c41",
    icon: "🚩",
    accessories: () => (
      <>
        <mesh position-y={1.02} castShadow>
          <cylinderGeometry args={[0.43, 0.43, 0.62, 18]} />
          <Mat color={RED} />
        </mesh>
        <mesh position={[-0.46, 1.45, -0.1]} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 1.6, 6]} />
          <Mat color="#d7ccc8" />
        </mesh>
        <mesh position={[-0.46, 2.0, 0.22]} rotation-y={Math.PI / 2}>
          <planeGeometry args={[0.6, 0.4]} />
          <meshStandardMaterial color={RED} side={DOUBLE_SIDE} />
        </mesh>
      </>
    ),
  },

  // Purple hoodie, an orange backpack, a handmade placard sticking out of it.
  [Archetype.Etudiant]: {
    clothes: "#7b1fa2",
    icon: "🎒",
    accessories: () => (
      <>
        <mesh position={[0, 1.05, -0.45]} castShadow>
          <boxGeometry args={[0.5, 0.55, 0.24]} />
          <Mat color="#ff7043" />
        </mesh>
        <mesh position={[0.12, 1.75, -0.5]} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 1.1, 6]} />
          <Mat color="#a1887f" />
        </mesh>
        <mesh position={[0.12, 2.35, -0.5]} castShadow>
          <boxGeometry args={[0.8, 0.5, 0.03]} />
          <Mat color="#fafafa" />
        </mesh>
      </>
    ),
    // The lycéen bodies have no backpack or placard: the same, closer to the slim body.
    modelAccessories: () => (
      <>
        <mesh position={[0, 1.08, -0.2]} castShadow>
          <boxGeometry args={[0.34, 0.42, 0.16]} />
          <Mat color="#ff7043" />
        </mesh>
        <mesh position={[0.1, 1.7, -0.25]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 1.0, 6]} />
          <Mat color="#a1887f" />
        </mesh>
        <mesh position={[0.1, 2.22, -0.25]} castShadow>
          <boxGeometry args={[0.7, 0.44, 0.03]} />
          <Mat color="#fafafa" />
        </mesh>
      </>
    ),
  },

  // Beige cardigan, a navy beret, a wooden cane.
  [Archetype.Retraite]: {
    clothes: "#b8a596",
    icon: "🦯",
    accessories: () => (
      <>
        <mesh position-y={1.8} scale={[1, 0.35, 1]} castShadow>
          <sphereGeometry args={[0.36, 16, 8]} />
          <Mat color="#1f2a5a" />
        </mesh>
        <mesh position-y={1.93} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.08, 6]} />
          <Mat color="#1f2a5a" />
        </mesh>
        <mesh position={[-0.5, 0.5, 0.2]} rotation-z={0.08} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 1.0, 6]} />
          <Mat color="#5d4037" />
        </mesh>
        <mesh position={[-0.46, 1.0, 0.27]} rotation-x={Math.PI / 2} castShadow>
          <torusGeometry args={[0.07, 0.025, 6, 10, Math.PI]} />
          <Mat color="#5d4037" />
        </mesh>
      </>
    ),
  },
};

/** The look of archetype `id` (the default's for an unknown id). */
export function archetypeLook(id: unknown): ArchetypeLook {
  return ARCHETYPE_LOOKS[archetypeOf(id)];
}
