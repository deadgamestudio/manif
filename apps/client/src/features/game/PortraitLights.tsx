import { GROUND_BOUNCE, SKY, SKY_FILL, SUN_DIRECTION, SUN_INTENSITY } from "./lighting.ts";

/**
 * The street's light on a lone body (lighting.ts), without the shadows: the
 * lobby portraits' studio (app/portraits/, #126) and the role picker's live
 * turntable (#128) light their bodies with it, so they look as in the game.
 */
export function PortraitLights() {
  return (
    <>
      <hemisphereLight args={[SKY, GROUND_BOUNCE, SKY_FILL]} />
      <directionalLight position={[...SUN_DIRECTION]} intensity={SUN_INTENSITY} />
    </>
  );
}
