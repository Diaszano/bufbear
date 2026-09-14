import fs from "node:fs/promises";
import { BoundedCache } from "../../platform/boundedCache.js";
import type { ProtoDeclaration } from "./declaration.js";
import { isWithin, mapToGeneratedGo } from "./fileMapping.js";
import {
  GoIndex,
  prepareGoLines,
  type IndexedLocation
} from "./goIndex.js";

export const MAX_GENERATED_FILE_BYTES = 5 * 1024 * 1024;

export interface NavigationRequest {
  readonly workspaceRoot: string;
  readonly moduleRoot: string;
  readonly protoFile: string;
  readonly generatedRoot: string;
  readonly declaration: ProtoDeclaration;
  readonly isCancelled: () => boolean;
}

export interface NavigationResult {
  readonly filePath: string;
  readonly location: IndexedLocation;
}

export interface FileSystemReader {
  stat?: ((filePath: string) => Promise<{ mtimeMs: number; size: number }>) | typeof fs.stat;
  readFile?: ((filePath: string, encoding?: BufferEncoding | null) => Promise<string | Buffer>) | typeof fs.readFile;
  realpath?: ((filePath: string) => Promise<string>) | typeof fs.realpath;
}

export type FileSystem = FileSystemReader;

export interface GoNavigationServiceOptions {
  readonly fileSystem?: FileSystemReader;
  readonly goIndex?: GoIndex;
  readonly onFileTooLarge?: (filePath: string, size: number) => void;
}

interface CachedFile {
  readonly mtimeMs: number;
  readonly size: number;
  /** Pre-masked lines; reused across symbol lookups for this file version. */
  readonly lines: readonly string[];
  readonly locations: Map<string, IndexedLocation>;
}

function isFsNotFoundError(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return code === "ENOENT" || code === "ENOTDIR";
  }
  return false;
}

export class GoNavigationService {
  readonly #fileSystem: FileSystemReader | undefined;
  readonly #goIndex: GoIndex;
  readonly #onFileTooLarge: ((filePath: string, size: number) => void) | undefined;
  readonly #cache = new BoundedCache<string, CachedFile>(256);

  public constructor(options: GoNavigationServiceOptions = {}) {
    this.#fileSystem = options.fileSystem;
    this.#goIndex = options.goIndex ?? new GoIndex();
    this.#onFileTooLarge = options.onFileTooLarge;
  }

  get #shouldResolveRealpath(): boolean {
    return !this.#fileSystem || Boolean(this.#fileSystem.realpath);
  }

  async #stat(filePath: string): Promise<{ mtimeMs: number; size: number }> {
    if (this.#fileSystem?.stat) {
      return this.#fileSystem.stat(filePath);
    }
    return fs.stat(filePath);
  }

  async #readFile(filePath: string): Promise<string> {
    if (this.#fileSystem?.readFile) {
      const content = await this.#fileSystem.readFile(filePath, "utf8");
      return typeof content === "string" ? content : content.toString("utf8");
    }
    return fs.readFile(filePath, "utf8");
  }

  async #realpath(filePath: string): Promise<string> {
    if (this.#fileSystem?.realpath) {
      return this.#fileSystem.realpath(filePath);
    }
    return fs.realpath(filePath);
  }

  public async find(request: NavigationRequest): Promise<NavigationResult | undefined> {
    const target = mapToGeneratedGo({
      workspaceRoot: request.workspaceRoot,
      moduleRoot: request.moduleRoot,
      protoFile: request.protoFile,
      generatedRoot: request.generatedRoot,
      declaration: request.declaration
    });

    if (!target) {
      return undefined;
    }

    if (request.isCancelled()) {
      return undefined;
    }

    let realWorkspaceRoot = request.workspaceRoot;
    if (this.#shouldResolveRealpath) {
      try {
        realWorkspaceRoot = await this.#realpath(request.workspaceRoot);
      } catch {
        // Fall back to original workspaceRoot if realpath fails
      }
    }

    let statResult: { mtimeMs: number; size: number };
    try {
      statResult = await this.#stat(target.filePath);
    } catch (err) {
      if (isFsNotFoundError(err)) {
        return undefined;
      }
      throw err;
    }

    if (this.#shouldResolveRealpath) {
      try {
        const realTarget = await this.#realpath(target.filePath);
        if (!isWithin(realWorkspaceRoot, realTarget)) {
          return undefined;
        }
      } catch {
        return undefined;
      }
    }

    if (statResult.size > MAX_GENERATED_FILE_BYTES) {
      this.#onFileTooLarge?.(target.filePath, statResult.size);
      return undefined;
    }

    if (request.isCancelled()) {
      return undefined;
    }

    const cacheKey = `${target.kind}:${target.symbolName}:${target.parentService ?? ""}`;
    const cached = this.#cache.get(target.filePath);
    let lines: readonly string[];
    let locations: Map<string, IndexedLocation>;

    if (cached?.mtimeMs === statResult.mtimeMs && cached.size === statResult.size) {
      lines = cached.lines;
      locations = cached.locations;
      const cachedLoc = locations.get(cacheKey);
      if (cachedLoc) {
        return {
          filePath: target.filePath,
          location: cachedLoc
        };
      }
    } else {
      let content: string;
      try {
        content = await this.#readFile(target.filePath);
      } catch (err) {
        if (isFsNotFoundError(err)) {
          return undefined;
        }
        throw err;
      }
      lines = prepareGoLines(content);
      locations = new Map<string, IndexedLocation>();
    }

    if (request.isCancelled()) {
      return undefined;
    }

    const location = this.#goIndex.findInLines(lines, target, request.isCancelled);

    if (request.isCancelled()) {
      return undefined;
    }

    if (location) {
      locations.set(cacheKey, location);
    }

    this.#cache.set(target.filePath, {
      mtimeMs: statResult.mtimeMs,
      size: statResult.size,
      lines,
      locations
    });

    if (!location) {
      return undefined;
    }

    return {
      filePath: target.filePath,
      location
    };
  }

  public invalidate(filePath?: string): void {
    if (filePath !== undefined) {
      this.#cache.delete(filePath);
    } else {
      this.#cache.clear();
    }
  }
}
