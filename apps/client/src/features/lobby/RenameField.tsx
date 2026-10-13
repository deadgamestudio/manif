import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";
import { NAME_MAX_LENGTH, randomDefaultName, sanitizeName, type RenameRefusedEvent } from "@manif/shared";
import { net } from "../../shared/net/index.ts";
import { saveName } from "../home/index.ts";

const REFUSALS: Record<RenameRefusedEvent["reason"], string> = {
  taken: "Ce blaze est déjà pris.",
  empty: "Il faut un blaze, même court.",
};

/** No answer by then: the server dropped it (rate limit), so the field takes input again. */
const PENDING_TIMEOUT_MS = 1500;

/** Keep the focus in the field: a tap on the dice or OK must not count as "tapping away" (Safari never focuses buttons). */
const keepFocus = (e: PointerEvent) => e.preventDefault();

/**
 * Your own name in the roster, editable in the lobby (#61). The server is the
 * judge: the field sends the raw text and closes only when the state shows the
 * new name, which is also when it gets saved for the next invite link. A
 * refusal keeps the field open with the reason. Échap or tapping away cancels.
 */
export function RenameField({ name, onDone }: { name: string; onDone: () => void }) {
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  // Accepted: our name in the state is the one we sent. Save it, close.
  useEffect(() => {
    if (pending !== null && name === pending) {
      saveName(name);
      onDone();
    }
  }, [name, pending, onDone]);

  useEffect(
    () =>
      net.subscribeRenameRefused((event) => {
        setPending(null);
        setError(REFUSALS[event.reason]);
        input.current?.focus();
      }),
    [],
  );

  useEffect(() => {
    if (pending === null) return;
    const timer = window.setTimeout(() => setPending(null), PENDING_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  const submit = () => {
    if (pending !== null) return;
    const cleaned = sanitizeName(draft);
    if (cleaned === name) return onDone();
    setError(null);
    setPending(cleaned);
    net.rename(draft);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onDone();
    }
  };

  const onBlur = (e: FocusEvent<HTMLFormElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onDone();
  };

  return (
    <form
      className="roster-rename"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      <div className="field-row">
        <input
          ref={input}
          className="field"
          value={draft}
          maxLength={NAME_MAX_LENGTH * 2}
          autoComplete="nickname"
          spellCheck={false}
          enterKeyHint="done"
          aria-label="Ton nouveau blaze"
          aria-invalid={error !== null || undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
        />
        <button
          type="button"
          className="btn btn-icon"
          title="Un autre nom au hasard"
          aria-label="Un autre nom au hasard"
          onPointerDown={keepFocus}
          onClick={() => {
            setDraft(randomDefaultName());
            setError(null);
          }}
        >
          🎲
        </button>
        <button type="submit" className="btn btn-primary btn-rename-ok" onPointerDown={keepFocus} disabled={pending !== null}>
          OK
        </button>
      </div>
      {error && (
        <p className="roster-rename-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
