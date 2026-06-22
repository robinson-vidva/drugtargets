// Types for the precomputed JSON artifacts (web/public/data/<dataDir>/).
// Artifacts use integer interning + arrays-of-arrays to stay compact.

export type DrugId = number;
export type GeneId = number;
export type Sign = -1 | 0 | 1;

export interface Drug {
  chembl: string;
  name: string;
  drugType: string;
  maxPhase: number;
  approved: boolean;
  approvalDate: string | null;
  pharmClass: string[];   // openFDA EPC/MoA/PE
  atcClass: string[];     // WHO ATC level-4 labels (DrugCentral)
  atc: string[];          // ATC codes
  derivedClass: string[]; // mechanism-derived (target + action), only when no curated class
}

export interface Gene {
  symbol: string;
  ensembl: string;
  uniprot: string;
  name: string;
  aliases: string[];
}

// [geneId, actionTypeCode, sign, mechanismIndex]
export type TargetRow = [GeneId, number, Sign, number];

// [otherDrugId, score(0..1), concordantGeneIds, discordantGeneIds]
export type SimilarRow = [DrugId, number, GeneId[], GeneId[]];

export interface LicenseEntry {
  source: string;
  version: string;
  license: string;
}

export interface SignTableRow {
  actionType: string;
  sign: Sign;
}

export interface Meta {
  otRelease: string;
  openfdaDate: string;
  openfdaNdcDate: string;
  hgncVersion: string;
  chemblVersion: string;
  buildDate: string;
  dataDir: string;
  counts: {
    drugs: number;
    genes: number;
    drugTargetEdges: number;
    mechanisms: number;
    drugsWithSimilar: number;
    diseases: number;
    drugIndicationPairs: number;
    drugsWithStructural: number;
    drugsWithRepurposing: number;
    geneDiseaseAssociations: number;
  };
  coverage: {
    approvedDrugs: number;
    anyClass: { count: number; pct: number };
    withDerived: { count: number; pct: number };
    pharmClass: { count: number; pct: number; byUnii: number; byNameFallback: number; unmatched: number };
    atc: { count: number; pct: number };
    fdaMarketed: { drugs: number; withClass: number; pct: number };
  };
  actionTypes: string[];
  signTable: SignTableRow[];
  openfdaDisclaimer: string;
  licenses: LicenseEntry[];
}

// Eagerly-loaded small artifacts.
export type DrugsMap = Record<string, Drug>;
export type GenesMap = Record<string, Gene>;
export type GeneDrugsMap = Record<string, DrugId[]>;
export type IdfMap = Record<string, number>;

// Lazily-loaded larger artifacts.
export type DrugTargetsMap = Record<string, TargetRow[]>;
export type SimilarMap = Record<string, SimilarRow[]>;
export type Mechanisms = string[];

export type DiseaseId = number;

export interface Disease {
  efo: string;
  name: string;
}

// [diseaseId, maxPhase]
export type IndicationRow = [DiseaseId, number];

export type DiseasesMap = Record<string, Disease>;
export type DrugIndicationsMap = Record<string, IndicationRow[]>;
export type DiseaseDrugsMap = Record<string, DrugId[]>;

// [otherDrugId, tanimoto(0..1)]
export type StructuralRow = [DrugId, number];
export type StructuralMap = Record<string, StructuralRow[]>;

// [diseaseId, score, viaDrugIds, sharedGeneIds, geneticSupport(0..1)]
export type RepurposingRow = [DiseaseId, number, DrugId[], GeneId[], number];
export type RepurposingMap = Record<string, RepurposingRow[]>;

// [diseaseId, associationScore(0..1)]
export type GeneDiseaseRow = [DiseaseId, number];
export type GeneDiseasesMap = Record<string, GeneDiseaseRow[]>;

export type Direction = 'activate' | 'inhibit' | 'ambiguous';

export function signToDirection(sign: Sign): Direction {
  if (sign > 0) return 'activate';
  if (sign < 0) return 'inhibit';
  return 'ambiguous';
}
