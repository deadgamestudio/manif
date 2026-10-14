import { useRef, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import { CANISTER_FLIGHT_TIME, GAS_DURATION } from "@manif/shared";
import type { Group, Material } from "three";
import { net } from "../../shared/net/index.ts";
import { useEffectModel } from "../effects/index.ts";
import { MODELS, useStaticModel } from "../models/index.ts";
import { cloudFade, cloudGrowth } from "./cloudShape.ts";
import { CANISTER_LOOK, CANISTER_MODEL, CLOUD_LOOK, CLOUD_MODEL, CLOUD_RING } from "./gasVisuals.tsx";

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
  const model = useStaticModel(MODELS.throwables.tearGasCanister);

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
        {model ? (
          <group scale={CANISTER_MODEL.scale}>
            <primitive object={model} position-y={-CANISTER_MODEL.centreY} dispose={null} />
          </group>
        ) : (
          <mesh castShadow>
            <cylinderGeometry args={[CANISTER_LOOK.radius, CANISTER_LOOK.radius, CANISTER_LOOK.length, 10]} />
            <meshStandardMaterial color={CANISTER_LOOK.color} roughness={0.6} />
          </mesh>
        )}
      </group>
    </group>
  );
}

/**
 * A gas cloud: Jordan's billows (or placeholder puffs while they load) that
 * grow in, bob and turn slowly, then fade out over its last seconds. A ring
 * on the ground marks exactly the gas radius the whole time.
 */
function CloudView({ id }: { id: string }) {
  const group = useRef<Group>(null);
  const materials = useRef<(Material | null)[]>([]);
  const ring = useRef<(Material | null)[]>([]);
  /** performance.now() (ms) when it should be gone, fixed on the first frame from the synced time left. */
  const endsAt = useRef(0);
  const cloud = net.getGasCloud(id);
  const model = useEffectModel(MODELS.effects.teargasCloud, { materials: "own", opacity: 0 });

  useFrame((_, dt) => {
    const g = group.current;
    const live = net.getGasCloud(id);
    if (!g || !live) return;
    const now = performance.now();
    if (endsAt.current === 0) endsAt.current = now + (live.left > 0 ? live.left : GAS_DURATION) * 1000;
    const age = (now - (net.getGasSeenAt("cloud", id) ?? now)) / 1000;
    const s = live.radius * cloudGrowth(age, CLOUD_LOOK.growIn);
    g.position.y = Math.sin(age * 1.7) * CLOUD_LOOK.bob;
    g.rotation.y = age * CLOUD_LOOK.turnSpeed;
    const fade = cloudFade((endsAt.current - now) / 1000, CLOUD_LOOK.fadeOut);
    if (model) {
      // The model's billows reach CLOUD_MODEL.reach at scale 1.
      const k = s / CLOUD_MODEL.reach;
      g.scale.set(k, k * CLOUD_MODEL.flatten, k);
      model.setOpacity(CLOUD_MODEL.opacity * fade);
      model.tick(dt);
    } else {
      g.scale.set(s, s, s);
      for (const m of materials.current) if (m) m.opacity = CLOUD_LOOK.opacity * fade;
    }
    // The zone is the full radius from the start: the ring doesn't grow, it only fades in and out.
    const shown = Math.min(1, age / 0.2) * fade;
    if (ring.current[0]) ring.current[0].opacity = CLOUD_RING.ringOpacity * shown;
    if (ring.current[1]) ring.current[1].opacity = CLOUD_RING.fillOpacity * shown;
  });

  if (!cloud) return null;
  return (
    <group position={[cloud.x, 0, cloud.z]}>
      <mesh rotation-x={-Math.PI / 2} position-y={CLOUD_RING.y} renderOrder={1}>
        <ringGeometry args={[Math.max(0, cloud.radius - CLOUD_RING.width), cloud.radius, 48]} />
        <meshBasicMaterial
          ref={(m) => {
            ring.current[0] = m;
          }}
          color={CLOUD_RING.color}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={CLOUD_RING.y} renderOrder={1}>
        <circleGeometry args={[Math.max(0, cloud.radius - CLOUD_RING.width), 48]} />
        <meshBasicMaterial
          ref={(m) => {
            ring.current[1] = m;
          }}
          color={CLOUD_RING.color}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
      {/* Drawn at unit radius (the model at its own reach) and scaled to the cloud's radius in useFrame. */}
      <group ref={group} scale={0.01}>
        {model ? (
          <primitive object={model.copy} dispose={null} />
        ) : (
          CLOUD_LOOK.puffs.map(([angle, dist, size], i) => (
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
          ))
        )}
      </group>
    </group>
  );
}
