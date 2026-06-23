import { useEffect } from 'react';

const BASE = 'drugtargets';

/** Set the document title for the current page (e.g. "Imatinib · drugtargets"). */
export function usePageTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · ${BASE}` : BASE;
    return () => { document.title = BASE; };
  }, [title]);
}
