import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { HelpContent } from "./HelpContent.tsx";
import { HELP_PATH, closeHelp, onHelpLinkClick } from "./route.ts";
import "./help.css";

/**
 * A link to the help (#71): `/aide` for crawlers, a new tab or a copied
 * address, the help in place for a plain click (never a page load, so a
 * player in a lobby or a march stays in the room).
 */
export function HelpLink({ className, children, onOpen }: { className?: string; children: ReactNode; onOpen?: () => void }) {
  return (
    <a
      href={HELP_PATH}
      className={className}
      onClick={(e) => {
        onHelpLinkClick(e);
        if (e.defaultPrevented) onOpen?.();
      }}
    >
      {children}
    </a>
  );
}

/**
 * `/aide` out of a room: the help as a page, reached from the home screen or
 * a link from outside. Its title and link preview are in the HTML already
 * (seo/meta.ts); the document title is set here too for in-app navigation.
 */
export function HelpPage() {
  // The same title as the page's HTML (seo/meta.ts), for when the app gets here from the home screen.
  useDocumentTitle("Comment on joue à Manif : règles, commandes et CRS");
  const onHome = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    closeHelp();
  };
  return (
    <main className="screen help-page">
      <header className="banner banner-small">
        <p className="banner-kicker">Le mode d'emploi</p>
        <h1 className="banner-title">Comment on joue</h1>
      </header>
      <a href="/" className="help-home-link" onClick={onHome}>
        ← Lancer ou rejoindre une manif
      </a>
      <HelpContent />
      <a href="/" className="btn btn-primary help-play" onClick={onHome}>
        On y va !
      </a>
    </main>
  );
}

/** Sets document.title while mounted, and puts the old one back after. */
function useDocumentTitle(title: string) {
  useEffect(() => {
    const before = document.title;
    document.title = title;
    return () => {
      document.title = before;
    };
  }, [title]);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * `/aide` in a room: the help over the lobby or the march, in a modal
 * dialog. Échap or "Fermer" closes it (back to the URL it was opened from).
 * Focus stays inside while it is open and goes back where it was after. Keys
 * pressed in it never reach the game, so typing Space or E here does nothing
 * out in the street.
 */
export function HelpOverlay() {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return undefined;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!d.open) d.showModal();
    d.querySelector<HTMLElement>(".help-close")?.focus();
    return () => {
      if (d.open) d.close();
      before?.focus();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    // The game listens on the window: nothing typed here goes further.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      closeHelp();
      return;
    }
    if (e.key !== "Tab") return;
    // The trap: Tab from the last control goes back to the first, and the other way.
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !e.currentTarget.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <dialog
      ref={dialog}
      className="help-overlay"
      aria-labelledby="help-overlay-title"
      onKeyDown={onKeyDown}
      // Échap the browser's way (also when focus left the dialog's contents): close it our way.
      onCancel={(e) => {
        e.preventDefault();
        closeHelp();
      }}
    >
      <div className="help-overlay-bar">
        <h1 id="help-overlay-title" className="help-overlay-title">
          Comment on joue
        </h1>
        <button type="button" className="btn help-close" onClick={() => closeHelp()}>
          Fermer <span className="help-close-key">Échap</span>
        </button>
      </div>
      <div className="help-overlay-body">
        <HelpContent />
      </div>
    </dialog>
  );
}
