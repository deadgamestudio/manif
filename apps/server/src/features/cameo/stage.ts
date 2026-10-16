import { cameoBubbleSeconds, cameoHold, cameoHush, cameoSpeak, cameoSpeaking, createCameoVoices, type CameoVoices } from "@manif/shared";

/**
 * The cameos' shared speaking turn (#132), one per room: Moluchan, La Douane
 * and Bénanas ask it before each line, so only one cameo bubble is ever up.
 * Each event mirrors its line into its own view only while `showing`, else
 * -1 (no bubble, which clients already draw as nothing).
 *
 * When a key moment takes the bubble from another cameo, every watcher is
 * told at once, so the one cut off clears its synced line in the same patch.
 */
export class CameoStage {
  private readonly voices: CameoVoices = createCameoVoices();
  private readonly watchers: (() => void)[] = [];

  constructor(private readonly random: () => number = Math.random) {}

  /** `refresh` is called whenever someone else takes the bubble: re-sync your line. */
  watch(refresh: () => void): void {
    this.watchers.push(refresh);
  }

  /** Cameo `id` wants to say a line at `now` (`key`: a moment that always speaks). True: say it. */
  say(id: string, now: number, key: boolean): boolean {
    const before = this.voices.speaker;
    const cut = before !== null && before !== id && cameoSpeaking(this.voices, before, now);
    if (!cameoSpeak(this.voices, id, now, key, this.random)) return false;
    if (cut) for (const refresh of this.watchers) refresh();
    return true;
  }

  /**
   * Cameo `id` was just given the bubble at `now` and picked `line`: the
   * bubble stays up as long as that line's voice clip (#137), at least
   * CAMEO.bubble, and its silence comes after.
   */
  hold(id: string, now: number, line: number): void {
    cameoHold(this.voices, id, now, cameoBubbleSeconds(id, line));
  }

  /** Whether cameo `id`'s bubble is up at `now`. */
  showing(id: string, now: number): boolean {
    return cameoSpeaking(this.voices, id, now);
  }

  /** Cameo `id` is gone: its bubble comes down and the turn is free. */
  hush(id: string, now: number): void {
    cameoHush(this.voices, id, now);
  }
}
