// Adds a web address prefix only when building the browser preview (scripts/build-app-preview.sh), so the preview can
// live at /app-preview on the website. Unset, the app's settings are exactly app.json's; phone builds never set it.
module.exports = ({ config }) =>
  process.env.EXPO_WEB_BASE_URL ? { ...config, experiments: { ...config.experiments, baseUrl: process.env.EXPO_WEB_BASE_URL } } : config;
