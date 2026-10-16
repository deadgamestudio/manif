import type { ReactNode } from "react";
import { useInputMode } from "../touch/index.ts";
import { useKeyLabels } from "../controls/index.ts";
import { archetypeLook } from "../archetype/index.ts";
import {
  RULES,
  archetypeCards,
  furnitureRows,
  moluchanCard,
  douaneCard,
  benanasCard,
  leZCard,
  policeCards,
  scoreRows,
  shopRows,
  throwableRows,
} from "./content.ts";
import { controls } from "./tips.ts";

/** The eight sections, in order: the table of contents and the anchors. */
export const SECTIONS = [
  { id: "aide-but", icon: "🎯", title: "Le but" },
  { id: "aide-commandes", icon: "🎮", title: "Les commandes" },
  { id: "aide-survivre", icon: "❤️", title: "Survivre" },
  { id: "aide-bazar", icon: "🔥", title: "Le bazar" },
  { id: "aide-police", icon: "🚨", title: "La police" },
  { id: "aide-personnages", icon: "🎭", title: "Les personnages" },
  { id: "aide-points", icon: "🏆", title: "Les points" },
  { id: "aide-groupe", icon: "📣", title: "En groupe" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const s = SECTIONS.find((x) => x.id === id);
  return (
    <section id={id} className="placard help-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="placard-label help-section-title">
        <span aria-hidden="true">{s?.icon}</span> {s?.title}
      </h2>
      {children}
    </section>
  );
}

/** A list of short lines, each with its emoji. */
function Lines({ items }: { items: readonly (readonly [string, ReactNode])[] }) {
  return (
    <ul className="help-lines">
      {items.map(([icon, text], i) => (
        <li key={i}>
          <span className="help-line-icon" aria-hidden="true">
            {icon}
          </span>
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

function ControlsList({ title, rows, mine }: { title: string; rows: readonly (readonly [string, string])[]; mine: boolean }) {
  return (
    <div className="help-controls" data-mine={mine || undefined}>
      <h3 className="help-subtitle">
        {title}
        {mine && <span className="tag help-tag">ton mode</span>}
      </h3>
      <dl className="help-keys">
        {rows.map(([key, what]) => (
          <div key={what} className="help-key-row">
            <dt>
              <kbd>{key}</kbd>
            </dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The rare guest (#85): not a pick, so his own card after the archetypes. */
function MoluchanCardView() {
  return (
    <>
      <h3 className="help-subtitle">Et parfois, un invité surprise</h3>
      <ul className="help-cards">
        <GuestCard m={moluchanCard()} chipsLabel="Dans son cercle" />
        {/* #120: the kid with the water gun. */}
        <GuestCard m={douaneCard()} chipsLabel="Son jet d'eau" />
        {/* #123: the fake cop. */}
        <GuestCard m={benanasCard()} chipsLabel="Ses coups" />
        {/* #133: the pundit behind the CRS. */}
        <GuestCard m={leZCard()} chipsLabel="Son effet sur les CRS" />
      </ul>
    </>
  );
}

function GuestCard({ m, chipsLabel }: { m: ReturnType<typeof moluchanCard>; chipsLabel: string }) {
  return (
        <li className="help-card">
          <h3 className="help-card-title">
            <span aria-hidden="true">{m.icon}</span> {m.name}
          </h3>
          <p className="help-card-text">{m.what}</p>
          <ul className="help-chips" aria-label={chipsLabel}>
            {m.chips.map((c) => (
              <li key={c.text} className="help-chip" data-good={c.good || undefined}>
                {c.text}
              </li>
            ))}
          </ul>
          <p className="help-card-tip">→ {m.tip}</p>
          {m.warning && <p className="help-card-warning">⚠ {m.warning}</p>}
        </li>
  );
}

/** Scrolls to a section without touching the URL (a #hash would add history entries under the overlay). */
function goTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * The "Comment on joue" help (#71): eight sections in the lobby's placard
 * style. The same component is the `/aide` page and the overlay over the
 * lobby or the march. The keys are the player's own (#72), the touch or the
 * keyboard controls come first depending on what they play with, and every
 * number comes from the game's constants (content.ts).
 */
export function HelpContent() {
  const touch = useInputMode() === "touch";
  const keys = useKeyLabels();
  /** A control's name in a sentence: the touch button, or the player's key. */
  const k = (action: "attack" | "jump" | "dodge" | "interact") =>
    touch ? { attack: "Taper", jump: "Sauter", dodge: "Esquive", interact: "Action" }[action] : keys[action];
  const kbdFor = (a: "attack" | "jump" | "dodge" | "interact") => <kbd>{k(a)}</kbd>;

  const keyboardList = <ControlsList title="Clavier et souris" rows={controls(false, keys, "page")} mine={!touch} />;
  const touchList = <ControlsList title="Écran tactile" rows={controls(true, keys, "page")} mine={touch} />;

  return (
    <div className="help-content">
      <nav className="help-toc" aria-label="Sommaire">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className="help-toc-chip" onClick={() => goTo(s.id)}>
            <span aria-hidden="true">{s.icon}</span> {s.title}
          </button>
        ))}
      </nav>

      <Section id="aide-but">
        <Lines
          items={[
            ["🏛️", <>Amenez au moins <b>la moitié du cortège</b>, libre, jusqu'à la Préfecture au bout de la rue, en même temps.</>],
            ["⏱️", <>Avant la fin du chrono : <b>{RULES.roundTime}</b>.</>],
            ["🤖", "Seuls les humains comptent : les bots font de la figuration."],
            ["💀", "Perdu si le chrono tombe à zéro, ou si tout le cortège se fait embarquer en même temps (à partir de 2 joueurs)."],
          ]}
        />
      </Section>

      <Section id="aide-commandes">
        <div className="help-controls-grid">
          {touch ? (
            <>
              {touchList}
              {keyboardList}
            </>
          ) : (
            <>
              {keyboardList}
              {touchList}
            </>
          )}
        </div>
        <p className="help-note">
          Les touches affichées sont les tiennes. Pour les changer : le bouton clavier en haut à droite, dans le lobby ou en jeu.
        </p>
      </Section>

      <Section id="aide-survivre">
        <Lines
          items={[
            ["❤️", <>Tu as {RULES.maxHp} PV (plus ou moins selon ton personnage). Un coup de matraque en retire {RULES.crsBaton}.</>],
            ["🫳", <>Les CRS n'attrapent que les blessé·es : à terre, ou à <b>{RULES.grabHp} PV</b> ou moins. Les autres prennent la matraque.</>],
            ["🙌", <>Avant d'attraper, le CRS tend les bras ({RULES.windup} s). Plonge, saute, tape-le ou recule : c'est raté.</>],
            ["🚐", <>Attrapé·e, tu es traîné·e vers le fourgon (au moins {RULES.dragMin} s). Martèle {kbdFor("attack")} pour te débattre : environ {RULES.struggle} s pour t'en sortir seul·e.</>],
            ["🦸", <>Un·e camarade te libère en maintenant {kbdFor("interact")} {RULES.rescue} s à côté de toi, ou en assommant le CRS (un pavé suffit).</>],
            ["⏳", <>Embarqué·e : {RULES.van} s au fourgon, puis retour à l'arrière du cortège. À 0 PV, c'est KO puis direct au fourgon.</>],
            ["😷", <>Lacrymos : le nuage reste {RULES.gas} s. Dedans, tu tousses, tu perds des PV et tu ralentis. {kbdFor("dodge")} pour plonger dehors.</>],
            ["🤸", <>{kbdFor("dodge")} : un plongeon éclair sous la matraque, rechargé en {RULES.dodgeCooldown} s. {kbdFor("jump")} : par-dessus une poubelle ou un CRS à terre, et la matraque te rate en l'air.</>],
          ]}
        />
      </Section>

      <Section id="aide-bazar">
        <h3 className="help-subtitle">Casser</h3>
        <p className="help-text">Tape le mobilier urbain pour le casser. Il en tombe de quoi lancer. Le black bloc casse deux fois plus vite.</p>
        <table className="help-table">
          <thead>
            <tr>
              <th scope="col">Quoi</th>
              <th scope="col">Coups</th>
              <th scope="col">Il en tombe</th>
            </tr>
          </thead>
          <tbody>
            {furnitureRows().map((r) => (
              <tr key={r.name}>
                <th scope="row">
                  {r.name}
                  {r.burns && <span className="help-burns" title="Ça brûle"> 🔥</span>}
                </th>
                <td>{r.hits}</td>
                <td>{r.drops}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="help-text">Les boutiques changent à chaque manche (au moins une banque) :</p>
        <table className="help-table">
          <thead>
            <tr>
              <th scope="col">Boutique</th>
              <th scope="col">Coups</th>
              <th scope="col">Il en tombe</th>
            </tr>
          </thead>
          <tbody>
            {shopRows().map((r) => (
              <tr key={r.name}>
                <th scope="row">
                  {r.name}
                  <span className="help-signs">{r.signs}</span>
                </th>
                <td>{r.hits}</td>
                <td>{r.drops}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="help-subtitle">Lancer</h3>
        <p className="help-text">
          {kbdFor("interact")} pour ramasser, {kbdFor("attack")} pour lancer {touch ? "(vise au joystick)" : "vers la souris"}.
        </p>
        <Lines items={throwableRows().map((r) => [r.icon, <><b>{r.name}.</b> {r.what}</>] as const)} />

        <h3 className="help-subtitle">Le feu et les pompiers</h3>
        <Lines
          items={[
            ["🔥", <>Maintiens {kbdFor("interact")} {RULES.light} s près d'une poubelle ou d'une voiture pour l'allumer. Au bout de {RULES.spread} s, ça se propage.</>],
            ["🍑", <>Qui traverse les flammes a les fesses en feu {RULES.onFire} s : il court plus vite et perd des PV. Un·e camarade l'éteint en maintenant {kbdFor("interact")}.</>],
            ["🚒", <>Environ {RULES.pompiers} s après un départ de feu, les pompiers arrivent et arrosent tout le monde, CRS compris. Ils ne sont dans aucun camp : on peut les bousculer, pas les blesser.</>],
          ]}
        />

        <h3 className="help-subtitle">Lancer un·e camarade</h3>
        <p className="help-text">
          {kbdFor("interact")} près d'un·e camarade pour le soulever, {kbdFor("attack")} pour le lancer : il renverse les CRS et casse ce qu'il touche.
          Pas lancé·e au bout de {RULES.carry} s, il se dégage.
        </p>
      </Section>

      <Section id="aide-police">
        <ul className="help-cards">
          {policeCards().map((c) => (
            <li key={c.name} className="help-card">
              <h3 className="help-card-title">
                <span aria-hidden="true">{c.icon}</span> {c.name}
              </h3>
              <p className="help-card-text">{c.what}</p>
              <p className="help-card-tip">→ {c.tip}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="aide-personnages">
        <p className="help-text">À choisir dans le lobby, gardé pour toute la manche.</p>
        <ul className="help-cards">
          {archetypeCards().map((a) => {
            const look = archetypeLook(a.id);
            return (
              <li key={a.id} className="help-card">
                <h3 className="help-card-title">
                  <span className="archetype-swatch archetype-swatch-small" style={{ background: look.clothes }} aria-hidden="true">
                    {look.icon}
                  </span>{" "}
                  {a.name}
                </h3>
                <p className="help-card-text">{a.description}</p>
                <p className="help-plus">+ {a.strength}</p>
                <p className="help-minus">− {a.weakness}</p>
                {a.chips.length > 0 && (
                  <ul className="help-chips" aria-label="En chiffres">
                    {a.chips.map((c) => (
                      <li key={c.text} className="help-chip" data-good={c.good || undefined}>
                        {c.text}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        <MoluchanCardView />
      </Section>

      <Section id="aide-points">
        <table className="help-table help-score">
          <thead>
            <tr>
              <th scope="col">Action</th>
              <th scope="col">Points</th>
              <th scope="col">Limite</th>
            </tr>
          </thead>
          <tbody>
            {scoreRows().map((r) => (
              <tr key={r.what} data-bad={r.bad || undefined}>
                <th scope="row">{r.what}</th>
                <td className="help-points">{r.points}</td>
                <td>{r.cap}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="help-text">
          Le score de la manche ne descend jamais sous 0. À la fin, il s'ajoute à ton total, au classement du lobby (les {RULES.leaderboard} premiers).
          Pas de compte : ton total est lié à ce navigateur, anonymement. Quitter en pleine manche ne compte pas.
        </p>
      </Section>

      <Section id="aide-groupe">
        <Lines
          items={[
            ["🔗", <>Jusqu'à {RULES.maxPlayers} par manif. Crée-la, envoie le lien (ou le code) aux potes.</>],
            ["✅", "Chacun·e se dit prêt·e, puis l'orga lance. L'orga peut aussi lancer quand même."],
            ["✏️", "Le crayon à côté de ton nom, dans le lobby, pour changer de blaze."],
            ["🤖", "Les places vides se remplissent de bots, plus mous que vous. Ils ne comptent ni pour gagner ni au classement. L'orga peut les couper."],
            ["📋", <>En pleine manif, {touch ? <>le bouton <kbd>📋</kbd></> : <>maintiens <kbd>{keys.board}</kbd></>} pour voir qui est libre et qui est embarqué·e.</>],
          ]}
        />
      </Section>
    </div>
  );
}
