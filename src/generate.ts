// @ts-expect-error no types
import SVGFixer from "oslllo-svg-fixer";
import SvgToFont from "svgtofont";
import chalk from "chalk";
import ora from "ora";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { isValidSvg, findSvgs, flattenSvgs } from "./utils";
import { resolveSource } from "./resolveSource";

/**
 * Options used to generate a single icon font from a directory of SVGs.
 */
export type GenerateFontOptions = {
  /**
   * Source of the SVG icons. Accepts any of:
   * - **Local directory** — every `.svg` file in the folder becomes an icon.
   * - **Local `.svg` file** — generates a font with that single icon.
   * - **HTTPS SVG URL** — the file is fetched and used as the single icon.
   * - **Git / GitHub repo URL** — the repo is shallow-cloned and all `.svg`
   *   files found anywhere in it are collected into the font.
   *
   * Pass an array to merge icons from multiple sources into a single font.
   */
  input: string | string[];
  /** Name of the generated font (also used as the output file name). @default "icon-font" */
  fontName?: string;
  /** Directory where the generated font files are written. Required unless `input` is a single local directory, in which case it defaults to that directory. */
  output?: string;
  /** Directory where fixed/normalized SVGs are written. Defaults to a temporary folder. */
  svgDir?: string;
  /** Directory where the glyphmap JSON files are written. Defaults to `output`. */
  glyphmapDir?: string;
  /** Whether to run the SVG fixer before generating the font. Defaults to `true`. */
  fixSvg?: boolean;
  /** Trace resolution used by the SVG fixer. Defaults to `800`. */
  traceResolution?: number;
  /** Font height passed to svgicons2svgfont. Defaults to `1000`. */
  fontHeight?: number;
  /** Whether to normalize icons. Defaults to `false`. */
  normalize?: boolean;
  /** Whether to generate CSS files. Defaults to `false`. */
  css?: boolean;
  /**
   * Font formats to generate.
   * Supported: `'ttf'`, `'eot'`, `'woff'`, `'woff2'`, `'svg'`, `'symbol.svg'`.
   * @default ["ttf"]
   */
  formats?: string[];
  /** Working directory used to resolve relative paths. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Suppress console logging. Defaults to `false`. */
  silent?: boolean;
};

/**
 * Default values for {@link GenerateFontOptions}.
 *
 * Note: `output`, `svgDir` and `glyphmapDir` are intentionally omitted — when
 * not provided they are resolved dynamically (the font is written next to its
 * source).
 */
const ALL_FONT_FORMATS = ["ttf", "eot", "woff", "woff2", "svg", "symbol.svg"] as const;

export const FONT_DEFAULTS = {
  fontName: "icon-font",
  fixSvg: true,
  traceResolution: 800,
  fontHeight: 1000,
  normalize: false,
  css: false,
  formats: ["ttf"] as string[],
  silent: false,
} satisfies Partial<GenerateFontOptions>;

// ─── generateFont ─────────────────────────────────────────────────────────────

/**
 * Generate a single icon font (and its glyphmap) from any of these sources:
 *
 * - **Local directory** — every `.svg` file in the folder becomes an icon.
 * - **Local `.svg` file** — generates a font containing just that one icon.
 * - **HTTPS SVG URL** — the file is fetched and used as the single icon source.
 * - **Git / GitHub repo URL** — the repo is cloned (shallow), all `.svg` files
 *   found anywhere in it are collected and turned into the font.
 *
 * Any option that is not provided falls back to {@link FONT_DEFAULTS}.
 * When `output` is omitted the font is written next to the source, but only
 * when the input is a single local directory — for all other source types
 * (remote URL, git repo, local file, or multiple sources) `output` is required.
 */
export const generateFont = async (
  options: GenerateFontOptions,
): Promise<Record<string, number>> => {
  const opts = {
    ...FONT_DEFAULTS,
    ...(Object.fromEntries(
      Object.entries(options).filter(([, v]) => v !== undefined),
    ) as GenerateFontOptions),
  };
  const cwd = opts.cwd ?? process.cwd();
  const silent = opts.silent ?? false;
  const spin = (text: string) => (silent ? null : ora(text).start());

  // All temp dirs are registered here and auto-cleaned on function exit (normal or thrown).
  await using stack = new AsyncDisposableStack();
  const mktemp = async (prefix: string): Promise<string> => {
    const d = await fs.mkdtempDisposable(path.join(os.tmpdir(), prefix));
    stack.use(d);
    return d.path;
  };

  // ── Resolve inputDir & defaultOutDir based on source type ──────────────
  const sourceSpinner = spin("Resolving source...");
  const log = (...args: unknown[]) => {
    if (sourceSpinner) sourceSpinner.text = args.join(" ");
  };

  const srcs = Array.isArray(opts.input) ? opts.input : [opts.input];
  let inputDir: string;
  let defaultOutDir: string;

  if (srcs.length === 1) {
    const resolved = await resolveSource(srcs[0]!, cwd, log, mktemp)
      .then((r) => {
        sourceSpinner?.succeed(chalk.green("Source resolved"));
        return r;
      })
      .catch((err) => {
        sourceSpinner?.fail(chalk.red("Failed to resolve source"));
        throw err;
      });
    inputDir = resolved.inputDir;
    if (!opts.output && !resolved.isLocalDir) {
      sourceSpinner?.fail(chalk.red("`output` is required"));
      throw new Error("`output` is required when the input is not a local directory");
    }
    defaultOutDir = resolved.defaultOutDir;
  } else {
    // Multiple sources — resolve each independently then merge all SVGs into
    // one staging directory so svgtofont sees a single flat input folder.
    const mergedDir = await mktemp(`icon-fonts-merged-${opts.fontName}-`);
    const allSvgPaths: string[] = [];
    for (const src of srcs) {
      const { inputDir: dir } = await resolveSource(src, cwd, log, mktemp).catch((err) => {
        sourceSpinner?.fail(chalk.red(`Failed to resolve source: ${src}`));
        throw err;
      });
      allSvgPaths.push(...(await findSvgs(dir)));
    }
    await flattenSvgs(allSvgPaths, mergedDir);
    sourceSpinner?.succeed(chalk.green(`${srcs.length} sources resolved and merged`));
    inputDir = mergedDir;
    if (!opts.output) {
      sourceSpinner?.fail(chalk.red("`output` is required"));
      throw new Error("`output` is required when multiple sources are provided");
    }
    defaultOutDir = cwd;
  }

  // ── Output directories ──────────────────────────────────────────────────
  const FINAL_DIST = opts.output ? path.resolve(cwd, opts.output) : defaultOutDir;
  const GLYPHMAP_DIST = opts.glyphmapDir ? path.resolve(cwd, opts.glyphmapDir) : FINAL_DIST;

  // 1. Fix SVGs using SVGFixer (optional). The fixed SVGs go to `svgDir` if
  //    provided, otherwise to a temp dir that is cleaned up afterwards.
  let svgSource = inputDir;
  if (opts.fixSvg) {
    const fixedDir = opts.svgDir
      ? path.resolve(cwd, opts.svgDir, opts.fontName)
      : await mktemp(`icon-fonts-fixed-${opts.fontName}-`);
    await fs.mkdir(fixedDir, { recursive: true });
    const fixSpinner = spin(`Fixing SVGs...`);
    try {
      await SVGFixer(inputDir, fixedDir, {
        showProgressBar: false,
        traceResolution: opts.traceResolution,
      }).fix();
    } catch (err) {
      fixSpinner?.fail(chalk.red("SVG fix failed"));
      throw new Error(
        `[Step 1 — SVGFixer] Failed to fix SVGs in ${inputDir}: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }

    // Validate SVGFixer output — stroke-only icons can produce empty rasterizations
    // which result in SVGs without a root node. Remove them before svgtofont runs.
    const fixedEntries = await fs.readdir(fixedDir);
    let removedCount = 0;
    for (const entry of fixedEntries) {
      if (!entry.toLowerCase().endsWith(".svg")) continue;
      if (!(await isValidSvg(path.join(fixedDir, entry)))) {
        await fs.unlink(path.join(fixedDir, entry));
        removedCount++;
      }
    }
    fixSpinner?.succeed(
      chalk.green("SVGs fixed") +
        (removedCount > 0 ? chalk.yellow(` (${removedCount} invalid removed)`) : ""),
    );
    svgSource = fixedDir;
  }

  // 2. Generate font using svgtofont
  await fs.mkdir(FINAL_DIST, { recursive: true });
  const fontSpinner = spin(`Generating font ${chalk.bold(opts.fontName)}...`);
  let info: Record<string, { unicode?: string }>;
  try {
    const excludeFormat = ALL_FONT_FORMATS.filter((f) => !opts.formats.includes(f)) as never;
    info = await SvgToFont({
      src: svgSource,
      dist: FINAL_DIST,
      fontName: opts.fontName,
      css: opts.css,
      excludeFormat,
      emptyDist: false,
      log: false,
      svgicons2svgfont: {
        fontHeight: opts.fontHeight,
        normalize: opts.normalize,
      },
    });
  } catch (err) {
    fontSpinner?.fail(chalk.red(`Failed to generate font "${opts.fontName}"`));
    throw new Error(
      `[Step 2 — svgtofont] Failed to generate font "${opts.fontName}".\n` +
        `  src: ${svgSource}\n` +
        `  Cause: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  // 3. Build glyphmap
  const glyphmap = Object.entries(info).reduce<Record<string, number>>((acc, [key, value]) => {
    const unicodeValue = value?.unicode?.replace("&#", "").replace(";", "");
    const unicodeNumber = Number(unicodeValue);
    if (!Number.isNaN(unicodeNumber)) {
      acc[key] = unicodeNumber;
    }
    return acc;
  }, {});

  // 4. Store glyphmap in JSON file
  await fs.mkdir(GLYPHMAP_DIST, { recursive: true });
  await fs.writeFile(
    path.join(GLYPHMAP_DIST, `${opts.fontName}.json`),
    JSON.stringify(glyphmap, null, 2),
    "utf-8",
  );

  const outRel = path.relative(cwd, FINAL_DIST) || ".";
  fontSpinner?.succeed(
    chalk.green(`Font ${chalk.bold(opts.fontName)} generated`) + chalk.dim(` → ${outRel}`),
  );
  return glyphmap;
};
