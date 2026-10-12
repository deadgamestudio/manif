import { useId, useState, type FormEvent } from "react";
import { NAME_MAX_LENGTH, nameOrDefault, parseLobbyCode, randomDefaultName } from "@manif/shared";
import { net, type NetSnapshot } from "./net.ts";
import { readInviteCode } from "./invite.ts";
import { initialName, saveName } from "./profile.ts";

/** Read once at load: the code from an invite link pre-fills the join field. */
const INVITE_CODE = readInviteCode();

/** The first screen. Nothing connects until Create or Join is pressed. */
export function Home({ snap }: { snap: NetSnapshot }) {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState(INVITE_CODE);
  const [localError, setLocalError] = useState<string | null>(null);
  const nameId = useId();
  const codeId = useId();

  // Disabled while connecting so a double click can't make two lobbies
  // (net.ts also shares one attempt between concurrent calls).
  const busy = snap.status === "connecting" || snap.status === "connected";
  const error = localError ?? (snap.status === "error" ? snap.error : null);

  /** Cleans the name, shows the cleaned version, remembers it. */
  const commitName = () => {
    const clean = nameOrDefault(name);
    setName(clean);
    saveName(clean);
    return clean;
  };

  const onCreate = () => {
    setLocalError(null);
    void net.createLobby(commitName());
  };

  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseLobbyCode(code);
    if (!parsed) {
      setLocalError("Ce code ne ressemble à rien. Colle le code ou le lien qu'on t'a envoyé.");
      return;
    }
    setLocalError(null);
    void net.joinLobby(parsed, commitName());
  };

  return (
    <main className="screen home">
      <header className="banner">
        <h1 className="banner-title">Manif</h1>
        <p className="banner-slogan">On lâche rien. Sauf les pavés.</p>
      </header>

      {INVITE_CODE && (
        <p className="invite-note">
          On t'attend dans la manif <b>{INVITE_CODE}</b>. Choisis ton blaze et rejoins le cortège.
        </p>
      )}

      <div className="placard placard-name">
        <label className="placard-label" htmlFor={nameId}>
          Ton blaze
        </label>
        <div className="field-row">
          <input
            id={nameId}
            className="field"
            value={name}
            maxLength={NAME_MAX_LENGTH * 2}
            autoComplete="nickname"
            spellCheck={false}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => saveName(nameOrDefault(name))}
            disabled={busy}
          />
          <button
            type="button"
            className="btn btn-icon"
            title="Un autre nom au hasard"
            aria-label="Un autre nom au hasard"
            onClick={() => setName(randomDefaultName())}
            disabled={busy}
          >
            🎲
          </button>
        </div>
      </div>

      <div className="placards">
        <section className={`placard placard-create${INVITE_CODE ? "" : " placard-main"}`}>
          <h2 className="placard-label">Lance ta manif</h2>
          <p className="placard-text">Tu montes le cortège, tu partages le lien, les potes rappliquent.</p>
          <button type="button" className="btn btn-primary" onClick={onCreate} disabled={busy}>
            {busy ? "Ça arrive…" : "Créer une manif"}
          </button>
        </section>

        <form className={`placard placard-join${INVITE_CODE ? " placard-main" : ""}`} onSubmit={onJoin}>
          <label className="placard-label" htmlFor={codeId}>
            Rejoins le cortège
          </label>
          <input
            id={codeId}
            className="field field-code"
            value={code}
            placeholder="Code ou lien d'invitation"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setCode(e.target.value)}
            disabled={busy}
          />
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Ça arrive…" : "Rejoindre"}
          </button>
        </form>
      </div>

      <p className="error" role="alert" aria-live="polite">
        {error}
      </p>
    </main>
  );
}
