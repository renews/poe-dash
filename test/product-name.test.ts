import { expect, test } from "bun:test";

test("uses Poe Dash for user-visible product identity", async () => {
  const [html, builder, main, readme] = await Promise.all([
    Bun.file(`${import.meta.dir}/../index.html`).text(),
    Bun.file(`${import.meta.dir}/../electron-builder.json5`).text(),
    Bun.file(`${import.meta.dir}/../electron/main.ts`).text(),
    Bun.file(`${import.meta.dir}/../README.md`).text(),
  ]);

  expect(html).toContain("<title>Poe Dash</title>");
  expect(html).toContain('href="/poe-dash-icon.png"');
  expect(builder).toContain('"productName": "Poe Dash"');
  expect(builder).toContain('"icon": "assets/icon.png"');
  expect(main).toContain('"poe-dash-icon.png"');
  expect(readme).toContain("# Poe Dash");
});

test("uses the official Divine Orb artwork for the application icon", async () => {
  const [runtimeIcon, bundleIcon] = await Promise.all([
    Bun.file(`${import.meta.dir}/../public/poe-dash-icon.png`).arrayBuffer(),
    Bun.file(`${import.meta.dir}/../assets/icon.png`).arrayBuffer(),
  ]);
  const hash = (icon: ArrayBuffer) =>
    new Bun.CryptoHasher("sha256")
      .update(new Uint8Array(icon))
      .digest("hex");
  const officialDivineOrbIconHash =
    "009b7d72230c62517a98493dd4a76c550c025e27b8fa33acd06298227a788439";

  expect(hash(runtimeIcon)).toBe(officialDivineOrbIconHash);
  expect(hash(bundleIcon)).toBe(officialDivineOrbIconHash);
});
