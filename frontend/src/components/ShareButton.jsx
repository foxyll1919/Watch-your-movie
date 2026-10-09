import React from "react";
import { Share2, Check, Link2 } from "lucide-react";

/**
 * Share control with a graceful ladder: native share sheet, then clipboard copy,
 * then a manual-copy fallback. Status is announced politely, never stealing focus.
 */
export function ShareButton({
  label = "Share",
  title = "Watch Your Movie",
  text = "Find out what kind of movie watcher you are.",
  className = "",
  showLabel = true,
}) {
  const [status, setStatus] = React.useState("");
  const timer = React.useRef(null);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const announce = (message) => {
    window.clearTimeout(timer.current);
    setStatus(message);
    timer.current = window.setTimeout(() => setStatus(""), 3200);
  };

  const copy = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      announce("Link copied");
    } catch {
      announce("Copy the link from your address bar");
    }
  };

  const onShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        announce("Shared");
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    await copy(url);
  };

  return (
    <span className="share">
      <button
        type="button"
        className={`btn btn--quiet ${showLabel ? "" : "btn--icon"} ${className}`.trim()}
        onClick={onShare}
        aria-label={showLabel ? undefined : label}
      >
        {status === "Link copied" || status === "Shared" ? <Check aria-hidden="true" /> : <Share2 aria-hidden="true" />}
        {showLabel && <span>{label}</span>}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
    </span>
  )
}

/**
 * Copy control. A rejected clipboard write is reported rather than swallowed:
 * the most common cause is an insecure context, where the button would
 * otherwise appear to do nothing at all.
 */
export function CopyLinkButton({ label = "Copy your result link", className = "" }) {
  const [status, setStatus] = React.useState(label);
  const timer = React.useRef(null);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus("Link copied");
    } catch {
      setStatus("Copy the link from your address bar");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus(label), 3200);
  };

  return (
    <button type="button" className={`btn btn--outline ${className}`.trim()} onClick={onCopy}>
      {status === "Link copied" ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
      <span role="status">{status}</span>
    </button>
  );
}

export default ShareButton;
