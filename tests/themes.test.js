import test from "node:test";
import assert from "node:assert/strict";
import { THEMES, getTheme, normalizeTheme } from "../src/themes.js";
import { demoProject, validateProject } from "../src/model.js";
test("three named themes with safe light fallback", () => {
  assert.deepEqual(Object.keys(THEMES), ["light", "dark", "paper"]);
  for (const value of [
    undefined,
    null,
    "__proto__",
    "constructor",
    "<script>",
    "Dark",
    {},
    [],
    42,
  ]) {
    assert.equal(normalizeTheme(value), "light");
    assert.equal(getTheme(value), THEMES.light);
  }
});
test("theme survives project JSON roundtrip while old projects remain light", () => {
  for (const theme of ["light", "dark", "paper"]) {
    const p = demoProject();
    p.theme = theme;
    assert.equal(validateProject(JSON.parse(JSON.stringify(p))).theme, theme);
  }
  const old = demoProject();
  delete old.theme;
  assert.equal(validateProject(old).theme, "light");
  old.theme = "__proto__";
  assert.equal(validateProject(old).theme, "light");
});
test("each theme defines every renderer color and semantic accent", () => {
  const keys = Object.keys(THEMES.light);
  for (const palette of Object.values(THEMES)) {
    assert.deepEqual(Object.keys(palette), keys);
    for (const [key, value] of Object.entries(palette)) {
      if (["name", "tint", "accents"].includes(key)) continue;
      assert.match(value, /^#[0-9a-f]{6}$/i);
    }
    assert.deepEqual(Object.keys(palette.accents), [
      "lime",
      "violet",
      "rose",
      "blue",
    ]);
    assert.notEqual(palette.background, palette.text);
  }
});
