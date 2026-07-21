import * as fs from "node:fs/promises";
import * as path from "node:path";
import { BoundedCache } from "../platform/boundedCache.js";

const rootCache = new BoundedCache<string, string | null>(512);

export function invalidateRootCache(_directory?: string): void {
  rootCache.clear();
}

export async function findBufRoot(
  filePath: string,
  workspaceBoundary?: string
): Promise<string | undefined> {
  const resolvedPath = path.resolve(filePath);
  const resolvedBoundary = workspaceBoundary ? path.resolve(workspaceBoundary) : undefined;

  let startDir: string;
  try {
    const stat = await fs.stat(resolvedPath);
    if (stat.isDirectory()) {
      startDir = resolvedPath;
    } else {
      startDir = path.dirname(resolvedPath);
    }
  } catch {
    startDir = path.dirname(resolvedPath);
  }

  const cacheKey = resolvedBoundary ? `${startDir}\0${resolvedBoundary}` : startDir;
  const cached = rootCache.get(cacheKey);
  if (cached !== undefined) {
    return cached ?? undefined;
  }

  let curr = startDir;
  let foundRoot: string | undefined;

  while (curr.length > 0) {
    const markerPath = path.join(curr, "buf.yaml");
    const hasMarker = await fs.access(markerPath).then(
      () => true,
      () => false
    );

    if (hasMarker) {
      foundRoot = curr;
      break;
    }

    if (resolvedBoundary !== undefined && curr === resolvedBoundary) {
      foundRoot = resolvedBoundary;
      break;
    }

    const parent = path.dirname(curr);
    if (parent === curr) {
      foundRoot = undefined;
      break;
    }

    curr = parent;
  }

  rootCache.set(cacheKey, foundRoot ?? null);
  return foundRoot;
}
