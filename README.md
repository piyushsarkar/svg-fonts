# svg-fonts

Generate icon fonts and glyphmaps from SVG icons — from a local folder, a single SVG file, an HTTPS URL, or a Git repository.

## Features

- **Multiple input sources** — local directory, single `.svg` file, HTTPS SVG URL, or any Git/GitHub repo
- **Merge sources** — combine icons from multiple inputs into a single font
- **GitHub subdirectory support** — point directly at a `/tree/<branch>/<path>` URL
- **SVG auto-fixing** — broken or stroke-only SVGs are automatically normalized via [oslllo-svg-fixer](https://github.com/nicholidev/oslllo-svg-fixer)
- **Glyphmap generation** — JSON glyphmap file mapping icon names to Unicode code points (useful for React Native)
- **Multiple output formats** — `ttf`, `eot`, `woff`, `woff2`, `svg`, `symbol.svg`
- **Programmatic API** — use as a library in your own build scripts

## Requirements

- Node.js **≥ 24**

## Installation

```bash
npm install svg-fonts
```

Or run directly with `npx`:

```bash
npx svg-fonts --input ./icons --name my-icons --output ./dist
```

## CLI Usage

```
svg-fonts [OPTIONS]
```

### Options

| Flag                     | Description                                                 | Default                     |
| ------------------------ | ----------------------------------------------------------- | --------------------------- |
| `--input <source>`       | SVG source — local dir/file, HTTPS SVG URL, or Git repo URL | _required_                  |
| `--name <fontName>`      | Name for the generated font                                 | _required_                  |
| `--output <dir>`         | Output directory                                            | source dir (local dir only) |
| `--svg-dir <dir>`        | Directory for fixed/normalized SVGs                         | temp dir                    |
| `--glyphmap-dir <dir>`   | Directory for glyphmap JSON                                 | same as `--output`          |
| `--font-height <n>`      | Font height for svgicons2svgfont                            | `1000`                      |
| `--trace-resolution <n>` | SVG fixer trace resolution                                  | `800`                       |
| `--formats <list>`       | Comma-separated font formats                                | `ttf`                       |
| `--css` / `--no-css`     | Emit CSS files                                              | `false`                     |
| `--fix` / `--no-fix`     | Run the SVG-fixing step                                     | `true`                      |
| `--normalize`            | Normalize icons                                             | `false`                     |
| `--silent`               | Suppress logging                                            | `false`                     |

### Examples

**Generate from a local folder:**

```bash
svg-fonts --input ./svg-icons --name my-icons --output ./dist
```

**Generate from a GitHub repository:**

```bash
svg-fonts \
  --input https://github.com/lucide-icons/lucide/tree/main/icons \
  --name lucide \
  --output ./dist
```

**Generate from a remote SVG URL (skip SVG fixing):**

```bash
svg-fonts \
  --input https://example.com/logo.svg \
  --name logo-font \
  --output ./dist \
  --no-fix
```

**Generate multiple formats:**

```bash
svg-fonts \
  --input ./icons \
  --name my-icons \
  --output ./dist \
  --formats ttf,woff2
```

## Programmatic API

```ts
import { generateFont } from "svg-fonts";

const glyphmap = await generateFont({
  input: "./svg-icons",
  fontName: "my-icons",
  output: "./dist",
  formats: ["ttf", "woff2"],
});

console.log(glyphmap);
// { "home": 59905, "star": 59906, "arrow-right": 59907 }
```

### `generateFont(options)`

Returns `Promise<Record<string, number>>` — a glyphmap mapping icon names to their Unicode code points.

#### Options

| Option            | Type                 | Default          | Description                                                    |
| ----------------- | -------------------- | ---------------- | -------------------------------------------------------------- |
| `input`           | `string \| string[]` | _required_       | SVG source(s) — local path, HTTPS URL, or Git URL              |
| `fontName`        | `string`             | `"icon-font"`    | Name of the generated font                                     |
| `output`          | `string`             | —                | Output directory (required unless input is a single local dir) |
| `svgDir`          | `string`             | temp dir         | Directory for fixed SVGs                                       |
| `glyphmapDir`     | `string`             | same as `output` | Directory for glyphmap JSON                                    |
| `fixSvg`          | `boolean`            | `true`           | Run the SVG fixer before generating                            |
| `traceResolution` | `number`             | `800`            | Trace resolution for SVG fixer                                 |
| `fontHeight`      | `number`             | `1000`           | Font height for svgicons2svgfont                               |
| `normalize`       | `boolean`            | `false`          | Normalize icons                                                |
| `css`             | `boolean`            | `false`          | Generate CSS files                                             |
| `formats`         | `string[]`           | `["ttf"]`        | Font formats to generate                                       |
| `cwd`             | `string`             | `process.cwd()`  | Working directory for resolving relative paths                 |
| `silent`          | `boolean`            | `false`          | Suppress console logging                                       |

## Supported Input Sources

| Source              | Example                                           |
| ------------------- | ------------------------------------------------- |
| Local directory     | `./icons`                                         |
| Local SVG file      | `./logo.svg`                                      |
| HTTPS SVG URL       | `https://example.com/icon.svg`                    |
| Git repo (HTTPS)    | `https://github.com/user/repo.git`                |
| Git repo (SSH)      | `git@github.com:user/repo.git`                    |
| GitHub subdirectory | `https://github.com/user/repo/tree/main/icons`    |
| Multiple sources    | `["./icons", "https://github.com/user/repo.git"]` |

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Type check
npm run typecheck

# Lint
npm run lint

# Format
npm run fmt
```

## License

[MIT](./LICENSE) © [Piyush Sarkar](https://github.com/piyushsarkar)
