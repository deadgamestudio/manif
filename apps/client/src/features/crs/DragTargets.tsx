import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CanvasTexture, LinearFilter, SRGBColorSpace, Vector3, type Group, type Sprite, type SpriteMaterial } from "three";
import { PlayerStatus, STREET_LEVEL, levelVans } from "@manif/shared";
import { net } from "../../shared/net/index.ts";
import { viewMarkerScale } from "../../shared/iso/index.ts";

/** The level's vans, in the order `Player.dragVan` indexes them (#70). */
const VANS = levelVans(STREET_LEVEL);
/** The marker bobs this high over a van's roof, by this much, this fast. */
const MARKER_LIFT = 1.2;
const MARKER_BOB = 0.25;
const MARKER_BOB_SPEED = 5;
const MARKER_SPIN = 2.5;
/** The edge arrow: how far in from the screen edge (NDC, 1 is the edge), and its size in world units. */
const EDGE = 0.82;
const ARROW_SIZE = 1.1;
/** The van counts as on screen inside this NDC box: no arrow then, the marker over it is enough. */
const ON_SCREEN = 0.9;

/** A fat hi-vis arrow pointing up, with a little van label: drawn once into a canvas texture. */
function drawArrow(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");
  ctx.beginPath();
  ctx.moveTo(48, 6);
  ctx.lineTo(88, 50);
  ctx.lineTo(64, 50);
  ctx.lineTo(64, 90);
  ctx.lineTo(32, 90);
  ctx.lineTo(32, 50);
  ctx.lineTo(8, 50);
  ctx.closePath();
  ctx.fillStyle = "#ff3b30";
  ctx.strokeStyle = "#141414";
  ctx.lineWidth = 6;
  ctx.fill();
  ctx.stroke();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  return texture;
}

/**
 * Where the CRS are dragging people (#70). Over every van someone is being
 * dragged to, a spinning red marker everyone sees (teammates know where to
 * run). For the local player being dragged, an arrow at the edge of the
 * screen pointing at their van while it is off screen. Placeholder look.
 * Everything is updated in useFrame from the synced `dragVan`; no React state.
 */
export function DragTargets({ ids, localId }: { ids: readonly string[]; localId: string | null }) {
  const markers = useRef<(Group | null)[]>([]);
  const arrow = useRef<Sprite>(null);
  const arrowMat = useRef<SpriteMaterial>(null);
  const texture = useMemo(() => drawArrow(), []);
  useEffect(() => () => texture.dispose(), [texture]);
  const [ndc, world] = useMemo(() => [new Vector3(), new Vector3()], []);
  // The edge arrow keeps its size on screen on a zoomed-out phone (#107).
  const arrowSize = ARROW_SIZE * useThree((s) => viewMarkerScale(s.size.width, s.size.height));

  useFrame(({ camera }) => {
    const targeted = new Set<number>();
    for (const id of ids) {
      const p = net.getPlayer(id);
      if (p && p.status === PlayerStatus.Grabbed && (p.dragVan ?? -1) >= 0) targeted.add(p.dragVan);
    }
    const t = performance.now() / 1000;
    VANS.forEach((van, i) => {
      const m = markers.current[i];
      if (!m) return;
      m.visible = targeted.has(i);
      if (m.visible) {
        m.position.y = van.height + MARKER_LIFT + Math.sin(t * MARKER_BOB_SPEED) * MARKER_BOB;
        m.rotation.y = t * MARKER_SPIN;
      }
    });

    const a = arrow.current;
    const mat = arrowMat.current;
    if (!a || !mat) return;
    const me = localId ? net.getPlayer(localId) : undefined;
    const van = me && me.status === PlayerStatus.Grabbed ? VANS[me.dragVan ?? -1] : undefined;
    a.visible = false;
    if (!van) return;
    ndc.set(van.x, van.height, van.z).project(camera);
    if (Math.abs(ndc.x) <= ON_SCREEN && Math.abs(ndc.y) <= ON_SCREEN) return;
    // Off screen: on the edge, on the line from the screen centre to the van.
    const k = EDGE / Math.max(Math.abs(ndc.x), Math.abs(ndc.y));
    world.set(ndc.x * k, ndc.y * k, 0).unproject(camera);
    a.position.copy(world);
    mat.rotation = Math.atan2(ndc.y, ndc.x) - Math.PI / 2;
    a.visible = true;
  });

  return (
    <>
      {VANS.map((van, i) => (
        <group
          key={van.id}
          ref={(g) => {
            markers.current[i] = g;
          }}
          position={[van.x, van.height + MARKER_LIFT, van.z]}
          visible={false}
        >
          {/* A big red cone pointing down at the roof: "this one". */}
          <mesh rotation-x={Math.PI} position-y={0.3}>
            <coneGeometry args={[0.55, 1.1, 4]} />
            <meshStandardMaterial color="#ff3b30" emissive="#ff3b30" emissiveIntensity={0.6} />
          </mesh>
        </group>
      ))}
      <sprite ref={arrow} scale={[arrowSize, arrowSize, 1]} renderOrder={20} visible={false}>
        <spriteMaterial ref={arrowMat} map={texture} transparent depthTest={false} depthWrite={false} />
      </sprite>
    </>
  );
}
