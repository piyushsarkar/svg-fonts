import { spawnSync, execSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { describe, it, expect, beforeAll } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CLI = path.join(ROOT, "dist", "cli.mjs");
const FIXTURES_DIR = path.join(__dirname, "fixtures/icons");
const OUTPUT_DIR = path.join(__dirname, "output", "cli");

/** Run the CLI with the given arguments. */
const cli = (args: string[]) => spawnSync("node", [CLI, ...args], { encoding: "utf-8", cwd: ROOT });

beforeAll(() => {
  execSync("npm run build", { cwd: ROOT, stdio: "ignore" });
});

describe("help", () => {
  it("prints help when --help is passed", () => {
    const { stdout, status } = cli(["--help"]);
    expect(status).toBe(0);
    expect(stdout).toContain("USAGE");
    expect(stdout).toContain("--input");
    expect(stdout).toContain("--name");
  });
});

describe("error cases", () => {
  it("exits with code 1 when no --input is provided", () => {
    const { stderr, status } = cli([]);
    expect(status).toBe(1);
    expect(stderr).toContain("--input");
  });
});

describe("generate", () => {
  it("generates a font from --input and --name flags", async () => {
    const { status } = cli([
      "--input",
      FIXTURES_DIR,
      "--name",
      "cli-icons",
      "--output",
      OUTPUT_DIR,
      "--no-fix",
      "--silent",
    ]);

    expect(status).toBe(0);

    const glyphmapRaw = await fs.readFile(path.join(OUTPUT_DIR, "cli-icons.json"), "utf-8");
    const glyphmap = JSON.parse(glyphmapRaw) as Record<string, number>;
    expect(Object.keys(glyphmap).length).toBeGreaterThan(0);
    for (const val of Object.values(glyphmap)) {
      expect(typeof val).toBe("number");
    }

    const files = await fs.readdir(OUTPUT_DIR);
    expect(files.some((f) => f.endsWith(".ttf"))).toBe(true);
  });
});
