#!/usr/bin/env -S node --disable-warning=DEP0040
import { defineCommand, runMain } from "citty";
import chalk from "chalk";
import { generateFont, FONT_DEFAULTS } from "./generate";

const main = defineCommand({
  meta: {
    name: "icon-fonts-generator",
    description: "Generate icon fonts from SVG directories, files, URLs, or repos",
  },
  args: {
    input: {
      type: "string",
      description:
        "SVG source — local dir/file, HTTPS SVG URL, or GitHub/git repo URL (repeatable, paired with --name)",
      valueHint: "source",
    },
    name: {
      type: "string",
      description: "Font name paired with each --input (repeatable)",
      valueHint: "fontName",
    },
    output: {
      type: "string",
      description: "Output directory (default: source folder / cwd)",
      valueHint: "dir",
    },
    svgDir: {
      type: "string",
      description: "Fixed-SVG directory (default: temp folder)",
      valueHint: "dir",
    },
    glyphmapDir: {
      type: "string",
      description: "Glyphmap directory (default: <out-dir>)",
      valueHint: "dir",
    },
    fontHeight: {
      type: "string",
      description: `Font height (default: ${FONT_DEFAULTS.fontHeight})`,
      valueHint: "n",
    },
    traceResolution: {
      type: "string",
      description: `SVG fixer trace resolution (default: ${FONT_DEFAULTS.traceResolution})`,
      valueHint: "n",
    },
    formats: {
      type: "string",
      description: `Comma-separated font formats to generate (default: ${FONT_DEFAULTS.formats.join(",")})`,
      valueHint: "list",
    },
    css: {
      type: "boolean",
      description: "Emit CSS files",
      default: FONT_DEFAULTS.css,
    },
    fix: {
      type: "boolean",
      description: "Run the SVG-fixing step",
      negativeDescription: "Skip the SVG-fixing step",
      default: true,
    },
    normalize: {
      type: "boolean",
      description: "Normalize icons",
      default: FONT_DEFAULTS.normalize,
    },
    silent: {
      type: "boolean",
      description: "Suppress logging",
      default: false,
    },
  },
  async run({ args }) {
    if (!args.input) {
      console.error(chalk.red("No --input provided.") + " Pass --input and --name.");
      process.exitCode = 1;
      return;
    }

    if (!args.name) {
      console.error(chalk.red("No --name provided.") + " Pass a font name with --name.");
      process.exitCode = 1;
      return;
    }

    return await generateFont({
      input: args.input,
      fontName: args.name,
      output: args.output,
      svgDir: args.svgDir,
      glyphmapDir: args.glyphmapDir,
      fontHeight: args.fontHeight ? Number(args.fontHeight) : undefined,
      traceResolution: args.traceResolution ? Number(args.traceResolution) : undefined,
      formats: args.formats
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      css: args.css,
      fixSvg: args.fix,
      normalize: args.normalize,
      silent: args.silent,
    });
  },
});

runMain(main);
