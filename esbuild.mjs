import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const context = await esbuild.context({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node22",
  outfile: "dist/extension.js",
  external: ["vscode"],
  minify: production,
  sourcemap: production ? false : "inline",
  sourcesContent: !production,
  logLevel: "info"
});

if (watch) {
  await context.watch();
  console.log("[watch] build started");
} else {
  try {
    await context.rebuild();
  } finally {
    await context.dispose();
  }
}
