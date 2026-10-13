import { useEffect } from "react";

/**
 * Calls `release` when the page loses focus or goes to the background, and on
 * unmount: a finger the page no longer sees (incoming call, app switch,
 * notification) must not keep walking or keep a rescue held. `release` must be
 * stable and safe to call twice.
 */
export function useReleaseOnHide(release: () => void) {
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") release();
    };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", onVisibility);
      release();
    };
  }, [release]);
}
