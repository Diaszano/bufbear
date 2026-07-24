import { analyzeMetafile, build, context, type BuildOptions } from "esbuild";
import baseOptionsJson from "./esbuild.config.json" with { type: "json" };

const baseOptions = baseOptionsJson as BuildOptions;
const args = new Set(process.argv.slice(2));
const production = args.delete("--production");
const watch = args.delete("--watch");
const analyze = args.delete("--analyze");

if (args.size > 0) {
  throw new Error(`Unknown esbuild option(s): ${[...args].join(", ")}`);
}

if (watch && analyze) {
  throw new Error("--analyze cannot be combined with --watch");
}

const options: BuildOptions = {
  ...baseOptions,
  absWorkingDir: import.meta.dirname,
  color: Boolean(process.stdout.isTTY),
  define: {
    "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development"),
  },
  keepNames: production,
  metafile: analyze,
  minify: production,
  sourcemap: production ? false : "inline",
  sourcesContent: !production,
};

if (watch) {
  const buildContext = await context(options);
  await buildContext.watch();
  console.log("[esbuild] Watching for changes...");
} else {
  const result = await build(options);

  if (result.metafile) {
    console.log(await analyzeMetafile(result.metafile, { verbose: true }));
  }
}
