import { useMemo } from "react";
import { BoxGeometry, MeshStandardMaterial, PlaneGeometry } from "three";
import type { ShopRoom } from "@manif/shared";
import { roomClutter, roomSize, type ClutterMaterial } from "./roomInterior.ts";

/*
 * Inside the shop rooms (#84): a dark floor, dim walls and a looted mess, so
 * a player who walks in through a broken front is seen in a dark shop once
 * the building fades. Placeholder boxes and planes only, until Jordan's
 * models (#28). No lights: a few emissive bits keep it legible but darker
 * than the street (a light per room would cost every material in the scene).
 *
 * The wall linings are one-sided planes facing into the room: seen from
 * outside (through a faded building) they cull themselves, so only the far
 * walls show, never one between the camera and the player.
 *
 * Everything is shared: one unit box, one unit plane, one material per kind
 * of thing. Rebuilt per round layout, never per frame.
 */

const UNIT_BOX = new BoxGeometry(1, 1, 1);
const UNIT_PLANE = new PlaneGeometry(1, 1);

const FLOOR = new MeshStandardMaterial({ color: "#1d1a18", roughness: 1, emissive: "#0c0a09" });
const WALL = new MeshStandardMaterial({ color: "#36302b", roughness: 1, emissive: "#171310" });
const CLUTTER: Readonly<Record<ClutterMaterial, MeshStandardMaterial>> = {
  shelf: new MeshStandardMaterial({ color: "#4e3b2c", roughness: 0.9, emissive: "#140e09" }),
  crate: new MeshStandardMaterial({ color: "#6b5236", roughness: 0.9, emissive: "#1a130b" }),
  counter: new MeshStandardMaterial({ color: "#2c3134", roughness: 0.8, emissive: "#0d0f10" }),
  counterTop: new MeshStandardMaterial({ color: "#5d6266", roughness: 0.6 }),
  litter: new MeshStandardMaterial({ color: "#8a8070", roughness: 1 }),
  tube: new MeshStandardMaterial({ color: "#dfe9ff", emissive: "#bcd4ff", emissiveIntensity: 0.9 }),
};

/** A little in front of the walls, so the lining never fights with them. */
const LINE = 0.01;

export function RoomsView({ rooms }: { rooms: readonly ShopRoom[] }) {
  return (
    <>
      {rooms.map((room) => (
        <RoomView key={room.id} room={room} />
      ))}
    </>
  );
}

function RoomView({ room }: { room: ShopRoom }) {
  const clutter = useMemo(() => roomClutter(room), [room]);
  const { depth: D, halfWidth: W } = roomSize(room);
  const h = room.height;
  return (
    // Origin on the doorway, +X into the room: the left-hand rooms turned half round.
    <group position={[room.door.x, 0, room.door.z]} rotation-y={room.side < 0 ? Math.PI : 0}>
      <mesh geometry={UNIT_PLANE} material={FLOOR} position={[D / 2, 0.01, 0]} rotation-x={-Math.PI / 2} scale={[D, 2 * W, 1]} receiveShadow />
      {/* Back wall, then the two side walls, each facing into the room. */}
      <mesh geometry={UNIT_PLANE} material={WALL} position={[D - LINE, h / 2, 0]} rotation-y={-Math.PI / 2} scale={[2 * W, h, 1]} />
      <mesh geometry={UNIT_PLANE} material={WALL} position={[D / 2, h / 2, -W + LINE]} scale={[D, h, 1]} />
      <mesh geometry={UNIT_PLANE} material={WALL} position={[D / 2, h / 2, W - LINE]} rotation-y={Math.PI} scale={[D, h, 1]} />
      {clutter.map((p, i) => (
        <mesh key={i} geometry={UNIT_BOX} material={CLUTTER[p.m]} position={p.at} rotation={p.rot} scale={p.size} receiveShadow={p.m !== "tube"} />
      ))}
    </group>
  );
}
