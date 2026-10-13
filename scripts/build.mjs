import { build } from "esbuild";
import { chmodSync } from "node:fs";

const common = { bundle: true, platform: "node", target: "node18", format: "esm", legalComments: "none", logLevel: "warning" };
await build({ ...common, entryPoints: ["src/cli.ts"], outfile: "dist/cli.js", banner: { js: "#!/usr/bin/env node\nimport { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" } });
await build({ ...common, entryPoints: ["src/index.ts"], outfile: "dist/index.js", banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" } });
await build({ ...common, entryPoints: ["src/action.ts"], outfile: "dist/action.js", target: "node20", banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" } });
// Browser bundle for the landing page live demo (no Node APIs).
await build({ bundle: true, platform: "browser", format: "esm", target: "es2020", minify: true, entryPoints: ["src/browser.ts"], outfile: "site/cronlag.js", legalComments: "none" });
chmodSync("dist/cli.js", 0o755);
console.log("built dist/cli.js dist/index.js dist/action.js site/cronlag.js");
