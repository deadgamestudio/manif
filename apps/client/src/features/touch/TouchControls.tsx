import { useCallback, useRef, type MouseEvent, type PointerEvent } from "react";
import { net, type LobbyPlayer } from "../../shared/net/index.ts";
import { tryThrow } from "../throwable/index.ts";
import { DodgeCooldownFill, useDodgeStart } from "../dodge/index.ts";
import { clampKnob, stickToGround, touchAim, type GroundDir } from "./joystick.ts";
import { useActionHint } from "./useActionHint.ts";
import { useHoldButton } from "./useHoldButton.ts";
import { useReleaseOnHide } from "./useReleaseOnHide.ts";

/** Stick ring radius and dead zone, in CSS pixels. */
const STICK_RADIUS = 56;
const DEAD_ZONE = 12;

const press = (e: MouseEvent) => e.preventDefault();
const interactDown = () => net.sendInteract(true);
const interactUp = () => net.sendInteract(false);
const dodge = () => net.sendDodge();

/**
 * On-screen controls for phones and tablets (#42), shown in touch mode only.
 * They send the same messages as the keyboard. Left half: a floating stick
 * that appears where the thumb lands. Right thumb: Taper (hit, or throw along
 * the stick), Esquive (dodge, with its cooldown) and Action (pick up, held to
 * rescue; lit when it would do something). Each control follows its own
 * finger, so walking and hitting at once works.
 */
export function TouchControls({ localId, players }: { localId: string | null; players: readonly LobbyPlayer[] }) {
  const stickPointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const stickDir = useRef<GroundDir>({ x: 0, z: 0 });
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);

  // The stick draws itself through refs: a re-render per finger move is wasted work on a phone.
  const releaseStick = useCallback(() => {
    if (!stickPointer.current) return;
    stickPointer.current = null;
    stickDir.current = { x: 0, z: 0 };
    if (base.current) base.current.hidden = true;
    net.sendMove(0, 0);
  }, []);
  useReleaseOnHide(releaseStick);

  const onStickDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (stickPointer.current) return;
    stickPointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (base.current) {
      base.current.hidden = false;
      base.current.style.left = `${e.clientX}px`;
      base.current.style.top = `${e.clientY}px`;
    }
    if (knob.current) knob.current.style.transform = "translate(-50%, -50%)";
  };
  const onStickMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = stickPointer.current;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const k = clampKnob(dx, dy, STICK_RADIUS);
    if (knob.current) knob.current.style.transform = `translate(calc(-50% + ${k.dx}px), calc(-50% + ${k.dy}px))`;
    const dir = stickToGround(dx, dy, DEAD_ZONE);
    stickDir.current = dir;
    net.sendMove(dir.x, dir.z);
  };
  const onStickEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId === stickPointer.current?.id) releaseStick();
  };

  // Carrying, Taper throws along the stick (or the facing when it is idle); otherwise it swings.
  const attack = useCallback(() => {
    if (!tryThrow(touchAim(stickDir.current))) net.sendAttack();
  }, []);
  const taper = useHoldButton(attack);
  const esquive = useHoldButton(dodge);
  const action = useHoldButton(interactDown, interactUp);
  const dodgeStarted = useDodgeStart(localId);
  const hint = useActionHint(localId, players);

  return (
    <div className="touch-controls" onContextMenu={press}>
      <div
        className="touch-stick-zone"
        onPointerDown={onStickDown}
        onPointerMove={onStickMove}
        onPointerUp={onStickEnd}
        onPointerCancel={onStickEnd}
        onLostPointerCapture={onStickEnd}
      >
        <div ref={base} className="touch-stick" hidden>
          <div ref={knob} className="touch-stick-knob" />
        </div>
      </div>
      <div className="touch-buttons">
        <button type="button" className="touch-btn touch-btn-action" data-held={action.held || undefined} data-hint={hint || undefined} {...action.handlers}>
          Action
        </button>
        <button type="button" className="touch-btn touch-btn-dodge" data-held={esquive.held || undefined} {...esquive.handlers}>
          Esquive
          <span className="touch-cooldown" aria-hidden="true">
            <DodgeCooldownFill started={dodgeStarted} />
          </span>
        </button>
        <button type="button" className="touch-btn touch-btn-hit" data-held={taper.held || undefined} {...taper.handlers}>
          Taper
        </button>
      </div>
    </div>
  );
}
