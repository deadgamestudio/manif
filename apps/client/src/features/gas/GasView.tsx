import { useRef, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import { CANISTER_FLIGHT_TIME, GAS_DURATION } from "@manif/shared";
import type { Group, Material } from "three";
import { net } from "../../shared/net/index.ts";
import { CANISTER_LOOK, CLOUD_LOOK } from "./gasVisuals.tsx";

/**
 * Tear gas (#7): canisters in flight and clouds on the ground. Re-renders
 * only when one appears or goes; everything moving is done in useFrame from
 * when we first saw it, since the server sends a canister's throw once and a
 * cloud's position once.
 */
export function GasView() {
  const clouds = useSyncExternalStore(net.subscribeGas, net.getGasIds);
  const canisters = useSyncExternalStore(net.subscribeGas, net.getCanisterIds);
  return (
    <>
      {clouds.map((id) => (
        <CloudView key={id} id={id} />
      ))}
      {canisters.map((id) => (
        <CanisterView key={id} id={id} />
      ))}
    </>
  );
}

/** A canister lobbed from its thrower to its target over CANISTER_FLIGHT_TIME. Removed by the server when it lands. */
function CanisterView({ id }: { id: string }) {
  const group = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const c = net.getCanister(id);

  useFrame((_, dt) => {
    const g = group.current;
    const live = net.getCanister(id);
    if (!g || !live) return;
    const seen = net.getGasSeenAt("can", id) ?? performance.now();
    const t = Math.min(1, (performance.now() - seen) / 1000 / CANISTER_FLIGHT_TIME);
    g.position.set(
      live.fromX + (live.toX - live.fromX) * t,
      CANISTER_LOOK.flightY * (1 - t * 0.9) + Math.sin(Math.PI * t) * CANISTER_LOOK.arcHeight,
      live.fromZ + (live.toZ - live.fromZ) * t,
    );
    if (spin.current) spin.current.rotation.x += CANISTER_LOOK.spin * dt;
  });

  if (!c) return null;
  return (
    <group ref={group} position={[c.fromX, CANISTER_LOOK.flightY, c.fromZ]}>
      <group ref={spin}>
        <mesh castShadow>
          <cylinderGeometry args={[CANISTER_LOOK.radius, CANISTER_LOOK.radius, CANISTER_LOOK.length, 10]} />
          <meshStandardMaterial color={CANISTER_LOOK.color} roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

/** A gas cloud: puffs that grow in, bob and turn slowly, then fade out over its last seconds. */
function CloudView({ id }: { id: string }) {
  const group = useRef<Group>(null);
  const materials = useRef<(Material | null)[]>([]);
  /** performance.now() (ms) when it should be gone, fixed on the first frame from the synced time left. */
  const endsAt = useRef(0);
  const cloud = net.getGasCloud(id);

  useFrame(() => {
    const g = group.current;
    const live = net.getGasCloud(id);
    if (!g || !live) return;
    const now = performance.now();
    if (endsAt.current === 0) endsAt.current = now + (live.left > 0 ? live.left : GAS_DURATION) * 1000;
    const age = (now - (net.getGasSeenAt("cloud", id) ?? now)) / 1000;
    const grow = Math.min(1, age / CLOUD_LOOK.growIn);
    // Ease out: a quick puff, then settling.
    const s = live.radius * (0.25 + 0.75 * (1 - (1 - grow) ** 3));
    g.scale.set(s, s, s);
    g.position.y = Math.sin(age * 1.7) * CLOUD_LOOK.bob;
    g.rotation.y = age * CLOUD_LOOK.turnSpeed;
    const fade = Math.max(0, Math.min(1, (endsAt.current - now) / 1000 / CLOUD_LOOK.fadeOut));
    const opacity = CLOUD_LOOK.opacity * fade;
    for (const m of materials.current) if (m) m.opacity = opacity;
  });

  if (!cloud) return null;
  // Drawn at unit radius and scaled to the cloud's radius in useFrame.
  return (
    <group position={[cloud.x, 0, cloud.z]}>
      <group ref={group} scale={0.01}>
        {CLOUD_LOOK.puffs.map(([angle, dist, size], i) => (
          <mesh key={i} position={[Math.sin(angle) * dist, size * CLOUD_LOOK.lift, Math.cos(angle) * dist]}>
            <sphereGeometry args={[size, 12, 8]} />
            <meshLambertMaterial
              ref={(m) => {
                materials.current[i] = m;
              }}
              color={CLOUD_LOOK.color}
              transparent
              opacity={0}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}
