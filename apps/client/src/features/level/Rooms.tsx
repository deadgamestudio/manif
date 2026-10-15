import { useEffect, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry } from "three";
import type { ShopKind, ShopRoom } from "@manif/shared";
import { net } from "../../shared/net/index.ts";
import { BoxBatch, mergeBoxes } from "../../shared/boxes/index.ts";
import { roomClutter, roomSize, type ClutterMaterial } from "./roomInterior.ts";

/*
 * Inside the shop rooms (#84): a dark floor, dim walls and a looted mess, so
 * a player who walks in through a broken front is seen in a dark shop once
 * the building fades. Placeholder boxes and planes only, until Jordan's
 * models (#28). No lights: a few glowing bits keep it legible but darker
 * than the street (a light per room would cost every material in the scene).
 *
 * The wall linings are one-sided planes facing into the room: seen from
 * outside (through a faded building) they cull themselves, so only the far
 * walls show, never one between the camera and the player.
 *
 * The mess only shows once the shop is broken: an intact shop's room, seen
 * through its faded block, is bare. Each kind dresses its room a little
 * (#117: a lit menu, a green cross, a wall of shoes...).
 *
 * Draw calls (#117): a street has up to 20 rooms, so a room is not a mesh per
 * plank. Its floor and walls are baked into one mesh, its mess into one more,
 * its glowing bits into a third (`shared/boxes`), colours per vertex.
 * Rebuilt per round layout or when the shop breaks, never per frame.
 */

const UNIT_PLANE = new PlaneGeometry(1, 1);

const FLOOR = "#1d1a18";
const WALL = "#36302b";
/** The room's own dim glow, so it reads in the dark without a light. */
const SHELL = new MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: "#120e0c" });
const CLUTTER = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, emissive: "#140f0b" });
const GLOW = new MeshBasicMaterial({ vertexColors: true });

/** Colours of the mess; `accent` and `glow` pieces bring their own. */
const COLORS: Readonly<Record<Exclude<ClutterMaterial, "accent" | "glow">, string>> = {
  shelf: "#4e3b2c",
  crate: "#6b5236",
  counter: "#2c3134",
  counterTop: "#5d6266",
  litter: "#8a8070",
  tube: "#dfe9ff",
};

/** A little in front of the walls, so the lining never fights with them. */
const LINE = 0.01;

export function RoomsView({ rooms, kinds }: { rooms: readonly ShopRoom[]; kinds?: ReadonlyMap<string, ShopKind> }) {
  return (
    <>
      {rooms.map((room) => (
        <RoomView key={room.id} room={room} kind={kinds?.get(room.id)} />
      ))}
    </>
  );
}

function RoomView({ room, kind }: { room: ShopRoom; kind?: ShopKind }) {
  const [broken, setBroken] = useState(() => net.getProp(room.id)?.broken ?? false);
  useFrame(() => {
    const isBroken = net.getProp(room.id)?.broken ?? false;
    if (isBroken !== broken) setBroken(isBroken);
  });
  const shell = useMemo(() => {
    const { depth: D, halfWidth: W } = roomSize(room);
    const h = room.height;
    const b = new BoxBatch();
    // Floor, then the back wall and the two side walls, each facing into the room.
    b.add([D / 2, 0.01, 0], [D, 2 * W, 1], FLOOR, [-Math.PI / 2, 0, 0]);
    b.add([D - LINE, h / 2, 0], [2 * W, h, 1], WALL, [0, -Math.PI / 2, 0]);
    b.add([D / 2, h / 2, -W + LINE], [D, h, 1], WALL);
    b.add([D / 2, h / 2, W - LINE], [D, h, 1], WALL, [0, Math.PI, 0]);
    return mergeBoxes(b.pieces, UNIT_PLANE);
  }, [room]);
  const mess = useMemo(() => {
    if (!broken) return null;
    const solid = new BoxBatch();
    const glow = new BoxBatch();
    for (const p of roomClutter(room, kind)) {
      if (p.m === "tube" || p.m === "glow") glow.add(p.at, p.size, p.color ?? COLORS.tube, p.rot);
      else solid.add(p.at, p.size, p.m === "accent" ? (p.color ?? COLORS.crate) : COLORS[p.m], p.rot);
    }
    return { solid: mergeBoxes(solid.pieces), glow: mergeBoxes(glow.pieces) };
  }, [room, kind, broken]);
  useEffect(() => () => shell?.dispose(), [shell]);
  useEffect(
    () => () => {
      mess?.solid?.dispose();
      mess?.glow?.dispose();
    },
    [mess],
  );
  return (
    // Origin on the doorway, +X into the room: the left-hand rooms turned half round.
    <group position={[room.door.x, 0, room.door.z]} rotation-y={room.side < 0 ? Math.PI : 0}>
      {shell && <mesh geometry={shell} material={SHELL} receiveShadow />}
      {mess?.solid && <mesh geometry={mess.solid} material={CLUTTER} receiveShadow />}
      {mess?.glow && <mesh geometry={mess.glow} material={GLOW} />}
    </group>
  );
}
