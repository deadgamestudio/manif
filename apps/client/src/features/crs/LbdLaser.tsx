import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Quaternion, Vector3, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { CRS_STATS, CrsKind, CrsStatus } from "@manif/shared";
import { damp } from "../../shared/iso/index.ts";
import { net } from "../../shared/net/index.ts";
import { LBD_MUZZLE } from "./crsVisuals.tsx";
import { getLbdMuzzle } from "./crsBody.ts";

const AIM_TIME = (CRS_STATS[CrsKind.Lbd].lbd?.aimTime ?? 0.8) * 1000;
const RED = "#ff1f1f";
/** The beam: a thin core and a soft glow round it, so it reads on a phone too. */
const CORE_RADIUS = 0.035;
const GLOW_RADIUS = 0.1;
/** The ring on the target's feet closes in from this scale to 1 over the aim. */
const RING_START = 1.9;
/** The pulse speeds up as the aim runs out, in pulses per second. */
const PULSE_FROM = 4;
const PULSE_TO = 16;
const FEET_Y = 0.04;
const UP = new Vector3(0, 1, 0);

/**
 * The LBD's aim tell (#73): while the CRS LBD `id` aims (`aim` set), a red
 * laser from its launcher to the aimed protester's feet and a red ring
 * closing in on them there, pulsing faster as the 0.8 s run out. Drawn on
 * top of everything (like the grab's "!", #70). World space: mount it beside
 * the body, not inside it; `body` and `yaw` are the body's position and
 * facing groups, for where the launcher is.
 */
export function LbdLaser({ id, body, yaw }: { id: string; body: RefObject<Group | null>; yaw: RefObject<Group | null> }) {
  const beam = useRef<Group>(null);
  const core = useRef<MeshBasicMaterial>(null);
  const glow = useRef<MeshBasicMaterial>(null);
  const ring = useRef<Group>(null);
  const ringMat = useRef<MeshBasicMaterial>(null);
  const dot = useRef<Mesh>(null);
  const aimed = useRef({ target: "", since: 0, x: 0, z: 0 });
  const tmp = useRef({ from: new Vector3(), to: new Vector3(), dir: new Vector3(), q: new Quaternion() });

  useFrame((_, dt) => {
    const b = beam.current;
    const r = ring.current;
    if (!b || !r) return;
    const c = net.getCrs(id);
    const target = c && !c.down && c.status !== CrsStatus.Out ? c.aim : "";
    const p = target ? net.getPlayer(target) : undefined;
    const g = body.current;
    const y = yaw.current;
    const on = p !== undefined && g !== null && y !== null;
    b.visible = on;
    r.visible = on;
    const a = aimed.current;
    if (!on) {
      a.target = "";
      return;
    }
    const now = performance.now();
    if (a.target !== target) {
      a.target = target;
      a.since = now;
      a.x = p.x;
      a.z = p.z;
    }
    // Follow the target like its avatar does, not in 20 Hz steps.
    const k = damp(15, dt);
    a.x += (p.x - a.x) * k;
    a.z += (p.z - a.z) * k;

    const t = Math.min(1, (now - a.since) / AIM_TIME);
    // Faster and faster: a chirp from PULSE_FROM to PULSE_TO over the aim (phase = π·t·(f0 + f(t))).
    const elapsed = (now - a.since) / 1000;
    const rate = PULSE_FROM + (PULSE_TO - PULSE_FROM) * t;
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * (PULSE_FROM + rate) * Math.PI);

    // The beam, from the launcher's muzzle to the feet.
    const { from, to, dir, q } = tmp.current;
    const yawAngle = y.rotation.y;
    const sin = Math.sin(yawAngle);
    const cos = Math.cos(yawAngle);
    // The launcher model's own muzzle once it is in (#100), it follows the hand; the toy launcher's otherwise.
    const muzzle = getLbdMuzzle(id);
    if (muzzle) muzzle.getWorldPosition(from);
    else from.set(g.position.x + LBD_MUZZLE.x * cos + LBD_MUZZLE.z * sin, LBD_MUZZLE.y, g.position.z - LBD_MUZZLE.x * sin + LBD_MUZZLE.z * cos);
    to.set(a.x, FEET_Y, a.z);
    dir.subVectors(to, from);
    const length = dir.length();
    if (length < 1e-3) {
      b.visible = false;
    } else {
      b.position.copy(from).addScaledVector(dir, 0.5);
      q.setFromUnitVectors(UP, dir.divideScalar(length));
      b.quaternion.copy(q);
      b.scale.set(1, length, 1);
    }
    if (core.current) core.current.opacity = 0.75 + 0.25 * pulse;
    if (glow.current) glow.current.opacity = 0.15 + 0.25 * pulse;

    // The ring, closing in on the feet.
    r.position.set(a.x, FEET_Y, a.z);
    r.scale.setScalar(RING_START + (1 - RING_START) * t);
    if (ringMat.current) ringMat.current.opacity = 0.6 + 0.4 * pulse;
    if (dot.current) dot.current.scale.setScalar(0.8 + 0.4 * pulse);
  });

  return (
    <>
      <group ref={beam} visible={false}>
        <mesh renderOrder={13}>
          <cylinderGeometry args={[GLOW_RADIUS, GLOW_RADIUS, 1, 8, 1, true]} />
          <meshBasicMaterial ref={glow} color={RED} transparent opacity={0.3} depthTest={false} depthWrite={false} />
        </mesh>
        <mesh renderOrder={14}>
          <cylinderGeometry args={[CORE_RADIUS, CORE_RADIUS, 1, 6]} />
          <meshBasicMaterial ref={core} color={RED} transparent opacity={0.9} depthTest={false} depthWrite={false} />
        </mesh>
      </group>
      <group ref={ring} visible={false}>
        <mesh rotation-x={-Math.PI / 2} renderOrder={13}>
          <ringGeometry args={[0.42, 0.56, 28]} />
          <meshBasicMaterial ref={ringMat} color={RED} transparent depthTest={false} depthWrite={false} />
        </mesh>
        <mesh ref={dot} rotation-x={-Math.PI / 2} renderOrder={14}>
          <circleGeometry args={[0.13, 16]} />
          <meshBasicMaterial color={RED} depthTest={false} depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}
