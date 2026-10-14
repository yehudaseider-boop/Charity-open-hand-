// Metro config: also watch the website's shared, dependency-free money code
// (../../src/lib) so the app and the website use the exact same fee maths.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "../../src/lib")];
module.exports = config;
