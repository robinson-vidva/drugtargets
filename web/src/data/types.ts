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
  pharmClass: string[];
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

export type Direction = 'activate' | 'inhibit' | 'ambiguous';

export function signToDirection(sign: Sign): Direction {
  if (sign > 0) return 'activate';
  if (sign < 0) return 'inhibit';
  return 'ambiguous';
}
