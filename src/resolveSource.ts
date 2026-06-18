import { simpleGit } from "simple-git";
import path from "path";
import fs from "fs/promises";
import { isGitSource, isSvgUrl, findSvgs, flattenSvgs, parseGitHubTreeUrl } from "./utils";

export type ResolvedSource = {
  inputDir: string;
  defaultOutDir: string;
  /** `true` only when the source is a local directory (not a file, URL, or git repo). */
  isLocalDir: boolean;
};

/**
 * Resolve any supported source string to a local directory of SVGs (`inputDir`)
 * and a sensible default output directory (`defaultOutDir`).
 *
 * Supported source types:
 * - **HTTPS SVG URL** — fetched and written to a temp directory.
 * - **GitHub `/tree/<branch>/<path>` URL** — repo is shallow-cloned and scoped
 *   to the given subdirectory.
 * - **Git / GitHub repo URL** — repo is shallow-cloned, all SVGs collected.
 * - **Local `.svg` file** — copied to a temp directory.
 * - **Local directory** — used directly.
 *
 * @param src       The source string (URL, git URL, or local path).
 * @param cwd       Working directory for resolving relative paths.
 * @param log       Logger function (respects `silent` option).
 * @param mktemp    Creates a managed temp directory; handles cleanup automatically.
 */
export const resolveSource = async (
  src: string,
  cwd: string,
  log: (...args: unknown[]) => void,
  mktemp: (prefix: string) => Promise<string>,
): Promise<ResolvedSource> => {
  if (isSvgUrl(src)) {
    return resolveHttpSvg(src, cwd, log, mktemp);
  }

  if (isGitSource(src)) {
    return resolveGitSource(src, cwd, log, mktemp);
  }

  return resolveLocalSource(src, cwd, mktemp);
};

// ─── HTTP SVG ─────────────────────────────────────────────────────────────────

const resolveHttpSvg = async (
  src: string,
  cwd: string,
  log: (...args: unknown[]) => void,
  mktemp: (prefix: string) => Promise<string>,
): Promise<ResolvedSource> => {
  log(`Fetching SVG from ${src}...`);
  const res = await fetch(src);
  if (!res.ok) {
    throw new Error(`Failed to fetch SVG: ${res.status} ${res.statusText}`);
  }
  const staging = await mktemp("icon-fonts-url-");
  const fileName = decodeURIComponent(path.basename(new URL(src).pathname)) || "icon.svg";
  await fs.writeFile(path.join(staging, fileName), await res.text(), "utf-8");
  return { inputDir: staging, defaultOutDir: cwd, isLocalDir: false };
};

// ─── Git / GitHub ─────────────────────────────────────────────────────────────

const resolveGitSource = async (
  src: string,
  cwd: string,
  log: (...args: unknown[]) => void,
  mktemp: (prefix: string) => Promise<string>,
): Promise<ResolvedSource> => {
  const treeInfo = parseGitHubTreeUrl(src);
  const cloneUrl = treeInfo ? treeInfo.cloneUrl : src;
  const repoDir = await mktemp("icon-fonts-repo-");
  log(`Cloning ${cloneUrl}${treeInfo ? ` (branch: ${treeInfo.branch})` : ""}...`);
  const cloneArgs = ["--depth", "1"];
  if (treeInfo) cloneArgs.push("--branch", treeInfo.branch);
  await simpleGit().clone(cloneUrl, repoDir, cloneArgs);
  const searchDir = treeInfo ? path.join(repoDir, treeInfo.subPath) : repoDir;
  if (treeInfo) {
    try {
      await fs.stat(searchDir);
    } catch {
      throw new Error(
        `Subdirectory "${treeInfo.subPath}" not found in repository ${treeInfo.cloneUrl}`,
      );
    }
  }
  log(`Scanning for SVGs in ${treeInfo ? treeInfo.subPath : "."}...`);
  const allSvgs = await findSvgs(searchDir);
  if (allSvgs.length === 0) {
    throw new Error(
      `No SVG files found in ${treeInfo ? `"${treeInfo.subPath}" in repository` : "repository"}: ${src}`,
    );
  }
  const staging = await mktemp("icon-fonts-svgs-");
  await flattenSvgs(allSvgs, staging);
  return { inputDir: staging, defaultOutDir: cwd, isLocalDir: false };
};

// ─── Local file / directory ───────────────────────────────────────────────────

const resolveLocalSource = async (
  src: string,
  cwd: string,
  mktemp: (prefix: string) => Promise<string>,
): Promise<ResolvedSource> => {
  const SOURCE = path.resolve(cwd, src);
  let stats;
  try {
    stats = await fs.stat(SOURCE);
  } catch {
    throw new Error(`Source path does not exist: ${SOURCE}`);
  }
  const isFile = stats.isFile();
  if (isFile && !SOURCE.toLowerCase().endsWith(".svg")) {
    throw new Error(`Source file must be an .svg file: ${SOURCE}`);
  }
  const sourceDir = isFile ? path.dirname(SOURCE) : SOURCE;
  if (isFile) {
    const staging = await mktemp("icon-fonts-src-");
    await fs.copyFile(SOURCE, path.join(staging, path.basename(SOURCE)));
    return { inputDir: staging, defaultOutDir: sourceDir, isLocalDir: false };
  }
  return { inputDir: sourceDir, defaultOutDir: sourceDir, isLocalDir: true };
};
