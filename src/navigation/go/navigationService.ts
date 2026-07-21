import fs from "node:fs/promises";
import { BoundedCache } from "../../platform/boundedCache.js";
import type { ProtoDeclaration } from "./declaration.js";
import { isWithin, mapToGeneratedGo } from "./fileMapping.js";
import { createGoIndex, type GoIndex, type IndexedLocation } from "./goIndex.js";

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

export interface FileSystem {
  stat(filePath: string): Promise<{ mtimeMs: number; size: number }>;
  readFile(filePath: string): Promise<string>;
  realpath?(filePath: string): Promise<string>;
}

export interface GoNavigationServiceOptions {
  readonly fileSystem?: FileSystem;
  readonly goIndex?: GoIndex;
  readonly onFileTooLarge?: (filePath: string, size: number) => void;
}

interface CachedFile {
  readonly mtimeMs: number;
  readonly size: number;
  readonly content: string;
  readonly locations: Map<string, IndexedLocation>;
}

const defaultFileSystem: FileSystem = {
  async stat(filePath: string) {
    const value = await fs.stat(filePath);
    return { mtimeMs: value.mtimeMs, size: value.size };
  },
  async readFile(filePath: string) {
    return fs.readFile(filePath, "utf8");
  },
  async realpath(filePath: string) {
    return fs.realpath(filePath);
  }
};

function isFsNotFoundError(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return code === "ENOENT" || code === "ENOTDIR";
  }
  return false;
}

export class GoNavigationService {
  readonly #fileSystem: FileSystem;
  readonly #goIndex: GoIndex;
  readonly #onFileTooLarge: ((filePath: string, size: number) => void) | undefined;
  readonly #cache = new BoundedCache<string, CachedFile>(256);

  public constructor(options: GoNavigationServiceOptions = {}) {
    this.#fileSystem = options.fileSystem ?? defaultFileSystem;
    this.#goIndex = options.goIndex ?? createGoIndex();
    this.#onFileTooLarge = options.onFileTooLarge;
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
    if (this.#fileSystem.realpath) {
      try {
        realWorkspaceRoot = await this.#fileSystem.realpath(request.workspaceRoot);
      } catch {
        // Fall back to original workspaceRoot if realpath fails
      }
    }

    let statResult: { mtimeMs: number; size: number };
    try {
      statResult = await this.#fileSystem.stat(target.filePath);
    } catch (err) {
      if (isFsNotFoundError(err)) {
        return undefined;
      }
      throw err;
    }

    if (this.#fileSystem.realpath) {
      try {
        const realTarget = await this.#fileSystem.realpath(target.filePath);
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
    let content: string;
    let locations: Map<string, IndexedLocation>;

    if (cached?.mtimeMs === statResult.mtimeMs && cached.size === statResult.size) {
      content = cached.content;
      locations = cached.locations;
      const cachedLoc = locations.get(cacheKey);
      if (cachedLoc) {
        return {
          filePath: target.filePath,
          location: cachedLoc
        };
      }
    } else {
      try {
        content = await this.#fileSystem.readFile(target.filePath);
      } catch (err) {
        if (isFsNotFoundError(err)) {
          return undefined;
        }
        throw err;
      }
      locations = new Map<string, IndexedLocation>();
    }

    if (request.isCancelled()) {
      return undefined;
    }

    const location = this.#goIndex.find(content, target, request.isCancelled);

    if (request.isCancelled()) {
      return undefined;
    }

    if (location) {
      locations.set(cacheKey, location);
    }

    this.#cache.set(target.filePath, {
      mtimeMs: statResult.mtimeMs,
      size: statResult.size,
      content,
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
