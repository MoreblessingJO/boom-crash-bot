export type SymbolKind = "boom" | "crash";

export interface SymbolDef {
  code: string;        // Deriv API symbol
  label: string;
  kind: SymbolKind;
  avgSpikeTicks: number; // mean ticks between spikes
}

// Deriv API symbol codes for Boom/Crash synthetic indices.
export const SYMBOLS: SymbolDef[] = [
  { code: "BOOM1000",  label: "Boom 1000",  kind: "boom",  avgSpikeTicks: 1000 },
  { code: "CRASH1000", label: "Crash 1000", kind: "crash", avgSpikeTicks: 1000 },
  { code: "BOOM500",   label: "Boom 500",   kind: "boom",  avgSpikeTicks: 500 },
  { code: "CRASH500",  label: "Crash 500",  kind: "crash", avgSpikeTicks: 500 },
  { code: "BOOM300N",  label: "Boom 300",   kind: "boom",  avgSpikeTicks: 300 },
  { code: "CRASH300N", label: "Crash 300",  kind: "crash", avgSpikeTicks: 300 },
];

export const getSymbol = (code: string) =>
  SYMBOLS.find((s) => s.code === code) ?? SYMBOLS[0];
