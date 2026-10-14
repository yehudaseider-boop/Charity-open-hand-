// The phone app's own lint setup (the website's config excludes apps/).
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // The "@/" and "@shared/" aliases come from tsconfig.json.
    settings: { "import/resolver": { typescript: { project: "./tsconfig.json" } } },
  },
  { ignores: ["dist/**", ".expo/**", "node_modules/**"] },
]);
