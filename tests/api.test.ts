import fs from "fs/promises";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { describe, it, expect } from "vitest";
import { generateFont, FONT_DEFAULTS } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SVG_ICONS = path.join(__dirname, "fixtures/icons");
const OUTPUT_DIR = path.join(__dirname, "output");
const OUTPUT = path.join(OUTPUT_DIR, "generateFont");

/** Serve a single SVG file over HTTP and return { url, close }. */
const serveSvg = (filePath: string): Promise<{ url: string; close: () => void }> =>
  new Promise((resolve, reject) => {
    const server = http.createServer(async (_, res) => {
      const content = await fs.readFile(filePath, "utf-8");
      res.writeHead(200, { "Content-Type": "image/svg+xml" });
      res.end(content);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        reject(new Error("Failed to get server address"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}/home.svg`,
        close: () => server.close(),
      });
    });
  });

describe("defaults", () => {
  it("has the expected default values", () => {
    expect(FONT_DEFAULTS.fixSvg).toBe(true);
    expect(FONT_DEFAULTS.fontHeight).toBe(1000);
    expect(FONT_DEFAULTS.normalize).toBe(false);
    expect(FONT_DEFAULTS.css).toBe(false);
    expect(FONT_DEFAULTS.traceResolution).toBe(800);
    expect(FONT_DEFAULTS.formats).toEqual(["ttf"]);
  });
});

describe("generateFont", () => {
  it("throws when the source path does not exist", async () => {
    await expect(generateFont({ input: "/non/existent/path", output: OUTPUT })).rejects.toThrow(
      "Source path does not exist",
    );
  });

  it("throws when the source is a non-SVG file", async () => {
    const tmpFile = path.join(__dirname, "fixtures", "test.txt");
    await expect(generateFont({ input: tmpFile, output: OUTPUT })).rejects.toThrow(
      "Source file must be an .svg file",
    );
  });

  it("generates a font from a directory of SVGs", async () => {
    const glyphmap = await generateFont({ input: SVG_ICONS, output: OUTPUT });
    expect(typeof glyphmap).toBe("object");
    expect(Object.keys(glyphmap).length).toBeGreaterThan(0);

    // the glyphmap JSON file must be written to output
    const raw = await fs.readFile(path.join(OUTPUT, `${FONT_DEFAULTS.fontName}.json`), "utf-8");
    expect(JSON.parse(raw)).toEqual(glyphmap);
  });

  it("glyphmap keys match the SVG file names", async () => {
    const glyphmap = await generateFont({ input: SVG_ICONS, output: OUTPUT });

    const expectedKeys = ["arrow-right", "home", "star"];
    for (const key of expectedKeys) {
      expect(glyphmap).toHaveProperty(key);
    }

    // every value in the glyphmap must be a number
    for (const val of Object.values(glyphmap)) {
      expect(typeof val).toBe("number");
    }
  });

  it("generates a font from a single SVG file", async () => {
    const glyphmap = await generateFont({
      input: path.join(SVG_ICONS, "home.svg"),
      fontName: "single-icon",
      output: OUTPUT,
    });

    expect(Object.keys(glyphmap)).toContain("home");
  });

  it("writes the glyphmap and font to separate directories", async () => {
    const glyphmapDir = path.join(OUTPUT, "separate-dir/glyphmap");
    const outDir = path.join(OUTPUT, "separate-dir/font");
    await fs.mkdir(glyphmapDir, { recursive: true });

    const glyphmap = await generateFont({ input: SVG_ICONS, output: outDir, glyphmapDir });

    const raw = await fs.readFile(
      path.join(glyphmapDir, `${FONT_DEFAULTS.fontName}.json`),
      "utf-8",
    );
    expect(JSON.parse(raw)).toEqual(glyphmap);
  });
});

describe("generateFont (HTTPS SVG URL)", () => {
  it("fetches a remote SVG and generates a font from it", async () => {
    const { url, close } = await serveSvg(path.join(SVG_ICONS, "home.svg"));
    try {
      const glyphmap = await generateFont({
        input: url,
        fontName: "url-icon",
        output: OUTPUT,
      });

      expect(Object.keys(glyphmap)).toContain("home");
      const raw = await fs.readFile(path.join(OUTPUT, "url-icon.json"), "utf-8");
      expect(JSON.parse(raw)).toEqual(glyphmap);
    } finally {
      close();
    }
  });

  it("throws when the remote URL returns a non-200 status", async () => {
    // Use a local server that always 404s
    const server = http.createServer((_, res) => {
      res.writeHead(404);
      res.end("Not Found");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as { port: number };
    const url = `http://127.0.0.1:${port}/missing.svg`;

    try {
      await expect(
        generateFont({ input: url, fontName: "err-icon", output: OUTPUT }),
      ).rejects.toThrow("Failed to fetch SVG");
    } finally {
      server.close();
    }
  });
});

describe("generateFont (git source)", () => {
  it("throws when no SVGs are found in the cloned repository", async () => {
    const gitPath = path.join(OUTPUT_DIR, "remote-resources", "git-no-svgs");
    await fs.rm(gitPath, { recursive: true, force: true });
    await fs.mkdir(gitPath, { recursive: true });

    // Build a local bare git repo (no SVGs) — no network required.
    // The path ends in `.git` so generateFont detects it as a git source.
    const { execSync } = await import("child_process");
    const repoPath = path.join(gitPath, "empty-icons.git");
    const workTree = path.join(gitPath, "worktree");
    execSync(`git init --bare "${repoPath}"`);
    execSync(`git clone "${repoPath}" "${workTree}"`);
    await fs.writeFile(path.join(workTree, "README.md"), "# no svgs here");
    execSync("git add .", { cwd: workTree });
    execSync("git -c user.email=t@t.com -c user.name=T commit -m init", {
      cwd: workTree,
    });
    execSync("git push origin HEAD", { cwd: workTree });

    await expect(
      generateFont({ input: repoPath, fontName: "no-svg-font", output: OUTPUT }),
    ).rejects.toThrow("No SVG files found in repository");
  });

  it("generates a font from a local git repository containing SVGs", async () => {
    const gitPath = path.join(OUTPUT_DIR, "remote-resources", "git-with-svgs");
    await fs.rm(gitPath, { recursive: true, force: true });
    await fs.mkdir(gitPath, { recursive: true });

    const { execSync } = await import("child_process");
    const repoPath = path.join(gitPath, "icon-repo.git");
    const workTree = path.join(gitPath, "worktree");
    execSync(`git init --bare "${repoPath}"`);
    execSync(`git clone "${repoPath}" "${workTree}"`);

    // Copy the fixture SVGs into the work tree
    for (const file of await fs.readdir(SVG_ICONS)) {
      await fs.copyFile(path.join(SVG_ICONS, file), path.join(workTree, file));
    }
    execSync("git add .", { cwd: workTree });
    execSync('git -c user.email=t@t.com -c user.name=T commit -m "add icons"', {
      cwd: workTree,
    });
    execSync("git push origin HEAD", { cwd: workTree });

    const glyphmap = await generateFont({
      input: repoPath,
      fontName: "git-icons",
      output: OUTPUT,
    });

    expect(Object.keys(glyphmap).length).toBeGreaterThan(0);
    for (const val of Object.values(glyphmap)) {
      expect(typeof val).toBe("number");
    }
    const raw = await fs.readFile(path.join(OUTPUT, "git-icons.json"), "utf-8");
    expect(JSON.parse(raw)).toEqual(glyphmap);
  });
});

describe("generateFont (multiple sources)", () => {
  it("merges icons from two local directories into a single font", async () => {
    // Build two separate dirs — each with a different subset of the fixture SVGs.
    const dirA = path.join(OUTPUT_DIR, "multi-src", "dir-a");
    const dirB = path.join(OUTPUT_DIR, "multi-src", "dir-b");
    const outDir = path.join(OUTPUT_DIR, "multi-src", "out");
    await fs.rm(path.join(OUTPUT_DIR, "multi-src"), { recursive: true, force: true });
    await Promise.all([
      fs.mkdir(dirA, { recursive: true }),
      fs.mkdir(dirB, { recursive: true }),
      fs.mkdir(outDir, { recursive: true }),
    ]);

    await fs.copyFile(path.join(SVG_ICONS, "home.svg"), path.join(dirA, "home.svg"));
    await fs.copyFile(path.join(SVG_ICONS, "star.svg"), path.join(dirB, "star.svg"));

    const glyphmap = await generateFont({
      input: [dirA, dirB],
      fontName: "merged-icons",
      output: outDir,
      fixSvg: false,
    });

    expect(glyphmap).toHaveProperty("home");
    expect(glyphmap).toHaveProperty("star");
    expect(typeof glyphmap["home"]).toBe("number");
    expect(typeof glyphmap["star"]).toBe("number");

    const raw = await fs.readFile(path.join(outDir, "merged-icons.json"), "utf-8");
    expect(JSON.parse(raw)).toEqual(glyphmap);
  });

  it("deduplicates icons with the same filename across sources", async () => {
    // Both dirs have a file named home.svg — flattenSvgs renames the second to home-1.svg.
    const dirA = path.join(OUTPUT_DIR, "multi-src-dedup", "dir-a");
    const dirB = path.join(OUTPUT_DIR, "multi-src-dedup", "dir-b");
    const outDir = path.join(OUTPUT_DIR, "multi-src-dedup", "out");
    await fs.rm(path.join(OUTPUT_DIR, "multi-src-dedup"), { recursive: true, force: true });
    await Promise.all([
      fs.mkdir(dirA, { recursive: true }),
      fs.mkdir(dirB, { recursive: true }),
      fs.mkdir(outDir, { recursive: true }),
    ]);

    await fs.copyFile(path.join(SVG_ICONS, "home.svg"), path.join(dirA, "home.svg"));
    await fs.copyFile(path.join(SVG_ICONS, "home.svg"), path.join(dirB, "home.svg"));

    const glyphmap = await generateFont({
      input: [dirA, dirB],
      fontName: "dedup-icons",
      output: outDir,
      fixSvg: false,
    });

    expect(glyphmap).toHaveProperty("home");
    // Duplicate gets the -1 suffix
    expect(glyphmap).toHaveProperty("home-1");
  });
});
