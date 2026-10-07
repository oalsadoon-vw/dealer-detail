/**
 * Per-store brand tokens for report headers. SCT is the only store with a
 * real logo asset in the fleet; everything else is a text wordmark in brand
 * colors (same rule the emailed PDF scorecards follow).
 */
export interface StoreBrand {
  wordmark: string;
  accent: string;
  bg: string;
  fg: string;
}

const BRANDS: Record<string, StoreBrand> = {
  SCT:  { wordmark: "STEVENS CREEK TOYOTA",            accent: "#EB0A1E", bg: "#111111", fg: "#ffffff" },
  BST:  { wordmark: "BLACKSTONE TOYOTA",               accent: "#EB0A1E", bg: "#111111", fg: "#ffffff" },
  BT:   { wordmark: "BLACKSTONE TOYOTA",               accent: "#EB0A1E", bg: "#111111", fg: "#ffffff" },
  TOL:  { wordmark: "TOYOTA OF LANCASTER",             accent: "#EB0A1E", bg: "#111111", fg: "#ffffff" },
  TL:   { wordmark: "TOYOTA OF LANCASTER",             accent: "#EB0A1E", bg: "#111111", fg: "#ffffff" },
  BC:   { wordmark: "BLACKSTONE CHEVROLET · CADILLAC", accent: "#d5aa35", bg: "#0d4e96", fg: "#ffffff" },
  SCVW: { wordmark: "STEVENS CREEK VOLKSWAGEN",        accent: "#00b0f0", bg: "#001e50", fg: "#ffffff" },
  SV:   { wordmark: "STEVENS CREEK VOLKSWAGEN",        accent: "#00b0f0", bg: "#001e50", fg: "#ffffff" },
  VWC:  { wordmark: "VOLKSWAGEN CLOVIS",               accent: "#00b0f0", bg: "#001e50", fg: "#ffffff" },
  VC:   { wordmark: "VOLKSWAGEN CLOVIS",               accent: "#00b0f0", bg: "#001e50", fg: "#ffffff" },
  ARSJ: { wordmark: "ALFA ROMEO SAN JOSE",             accent: "#9b1b30", bg: "#1a1a1a", fg: "#ffffff" },
  AR:   { wordmark: "ALFA ROMEO SAN JOSE",             accent: "#9b1b30", bg: "#1a1a1a", fg: "#ffffff" },
};

export function storeBrand(abbrev: string | null | undefined): StoreBrand {
  return (abbrev && BRANDS[abbrev.toUpperCase()]) || { wordmark: abbrev ?? "STORE", accent: "#6b7280", bg: "#1f2937", fg: "#ffffff" };
}
