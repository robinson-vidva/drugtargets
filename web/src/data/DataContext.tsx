import {
  createContext, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import MiniSearch from 'minisearch';
import type {
  DrugsMap, GenesMap, GeneDrugsMap, IdfMap, Meta,
  DrugTargetsMap, SimilarMap, Mechanisms,
} from './types';

export const DATA_DIR = 'v2026Q2';
const base = (import.meta.env.BASE_URL || '/') + `data/${DATA_DIR}/`;

async function getJSON<T>(name: string): Promise<T> {
  const res = await fetch(base + name);
  if (!res.ok) throw new Error(`Failed to load ${name}: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface SearchDoc {
  id: string;          // 'g:<geneId>' or 'd:<drugId>'
  kind: 'gene' | 'drug';
  label: string;       // symbol or drug name
  detail: string;      // gene name / chembl id
  ref: string;         // symbol (gene) or chembl (drug) — for navigation
  text: string;        // searchable text incl aliases/synonyms
}

interface EagerData {
  meta: Meta;
  drugs: DrugsMap;
  genes: GenesMap;
  geneDrugs: GeneDrugsMap;
  idf: IdfMap;
  search: MiniSearch<SearchDoc>;
  docs: Map<string, SearchDoc>;
  symbolToGeneId: Map<string, number>;   // upper symbol/alias -> geneId
  chemblToDrugId: Map<string, number>;
}

interface DataContextValue extends Partial<EagerData> {
  loading: boolean;
  error: string | null;
  loadDrugTargets: () => Promise<DrugTargetsMap>;
  loadSimilar: () => Promise<SimilarMap>;
  loadMechanisms: () => Promise<Mechanisms>;
}

const Ctx = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [eager, setEager] = useState<EagerData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // lazy caches
  const dtRef = useRef<Promise<DrugTargetsMap> | null>(null);
  const simRef = useRef<Promise<SimilarMap> | null>(null);
  const mechRef = useRef<Promise<Mechanisms> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meta, drugs, genes, geneDrugs, idf] = await Promise.all([
          getJSON<Meta>('meta.json'),
          getJSON<DrugsMap>('drugs.json'),
          getJSON<GenesMap>('genes.json'),
          getJSON<GeneDrugsMap>('gene_drugs.json'),
          getJSON<IdfMap>('idf.json'),
        ]);
        if (cancelled) return;

        const docs = new Map<string, SearchDoc>();
        const symbolToGeneId = new Map<string, number>();
        const chemblToDrugId = new Map<string, number>();

        for (const [id, g] of Object.entries(genes)) {
          const gid = Number(id);
          symbolToGeneId.set(g.symbol.toUpperCase(), gid);
          for (const a of g.aliases) if (!symbolToGeneId.has(a)) symbolToGeneId.set(a, gid);
          docs.set('g:' + id, {
            id: 'g:' + id, kind: 'gene', label: g.symbol, detail: g.name,
            ref: g.symbol, text: [g.symbol, g.name, ...g.aliases].join(' '),
          });
        }
        for (const [id, d] of Object.entries(drugs)) {
          chemblToDrugId.set(d.chembl.toUpperCase(), Number(id));
          docs.set('d:' + id, {
            id: 'd:' + id, kind: 'drug', label: d.name, detail: d.chembl,
            ref: d.chembl, text: [d.name, d.chembl, ...d.pharmClass].join(' '),
          });
        }

        const search = new MiniSearch<SearchDoc>({
          fields: ['label', 'text'],
          storeFields: ['kind', 'label', 'detail', 'ref'],
          searchOptions: { prefix: true, fuzzy: 0.2, boost: { label: 3 } },
        });
        search.addAll([...docs.values()]);

        setEager({
          meta, drugs, genes, geneDrugs, idf,
          search, docs, symbolToGeneId, chemblToDrugId,
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const value: DataContextValue = useMemo(() => ({
    ...(eager ?? {}),
    loading: !eager && !error,
    error,
    loadDrugTargets: () => {
      if (!dtRef.current) dtRef.current = getJSON<DrugTargetsMap>('drug_targets.json');
      return dtRef.current;
    },
    loadSimilar: () => {
      if (!simRef.current) simRef.current = getJSON<SimilarMap>('similar.json');
      return simRef.current;
    },
    loadMechanisms: () => {
      if (!mechRef.current) mechRef.current = getJSON<Mechanisms>('mechanisms.json');
      return mechRef.current;
    },
  }), [eager, error]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData must be used within DataProvider');
  return v;
}
