import { describe, expect, test } from "bun:test";
import { getRendererUrl } from "../electron/app/renderer";

describe("renderer origin", () => {
  test("uses a stable local HTTP origin for the packaged renderer", () => {
    expect(getRendererUrl(7555)).toBe("http://localhost:7555");
  });
});
