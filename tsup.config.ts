import type { Options } from "tsup"

const env = process.env.NODE_ENV

export const tsup: Options = {
  splitting: true,
  sourcemap: true,
  clean: true,
  dts: process.env.SKIP_DTS !== "true",
  format: ["esm"], // ESM only - no legacy CJS
  minify: env === "production",
  bundle: env === "production",
  skipNodeModulesBundle: true,
  watch: env === "development",
  target: "es2020",
  outDir: env === "production" ? "dist" : "lib",
  entry: ["src/index.ts", "src/**/*.ts"],
}
