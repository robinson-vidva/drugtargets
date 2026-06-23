import { useState } from 'react';

/** Small inline copy-to-clipboard button (e.g. for ChEMBL / EFO ids). */
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="copy-btn"
      aria-label={`Copy ${label ?? text}`}
      title={copied ? 'Copied!' : `Copy ${label ?? text}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch { /* clipboard unavailable */ }
      }}
    >{copied ? '✓' : '⧉'}</button>
  );
}
