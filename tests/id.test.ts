import { it, expect, vi } from "vitest";
import { newId } from "../src/platform/id";
it("creates UUID v4 identifiers when secure-context randomUUID is unavailable", () => {
  const random = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  vi.stubGlobal("crypto", { getRandomValues: random });
  try {
    const ids = Array.from({ length: 64 }, () => newId());
    expect(new Set(ids).size).toBe(64);
    for (const id of ids)
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
  } finally {
    vi.unstubAllGlobals();
  }
});
