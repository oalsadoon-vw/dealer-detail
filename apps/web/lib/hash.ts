import crypto from "node:crypto";

export function sha256Hex(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function stableJsonStringify(value: unknown): string {
  // Deterministic stringify for row hashing: sort object keys recursively.
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      return Object.keys(obj)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = obj[key];
          return acc;
        }, {});
    }
    return v;
  });
}


