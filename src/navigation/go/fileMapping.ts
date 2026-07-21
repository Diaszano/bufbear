import path from "node:path";
import type { ProtoDeclaration, ProtoDeclarationKind } from "./declaration.js";

export interface GoMappingInput {
  readonly workspaceRoot: string;
  readonly moduleRoot: string;
  readonly protoFile: string;
  readonly generatedRoot: string;
  readonly declaration: ProtoDeclaration;
}

export interface GoTarget {
  readonly filePath: string;
  readonly symbolName: string;
  readonly kind: ProtoDeclarationKind;
  readonly parentService?: string;
}

function hasNul(text: string): boolean {
  return text.includes("\0");
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

export function isWithin(parent: string, candidate: string): boolean {
  if (hasNul(parent) || hasNul(candidate)) {
    return false;
  }

  const parentDrive = /^[a-zA-Z]:/u.exec(parent)?.[0]?.toUpperCase() ?? /^[a-zA-Z]:/u.exec(normalizePath(parent))?.[0]?.toUpperCase();
  const candidateDrive = /^[a-zA-Z]:/u.exec(candidate)?.[0]?.toUpperCase() ?? /^[a-zA-Z]:/u.exec(normalizePath(candidate))?.[0]?.toUpperCase();

  if (parentDrive || candidateDrive) {
    if (parentDrive !== candidateDrive) {
      return false;
    }
  }

  const normParent = path.resolve(parent);
  const normCandidate = path.resolve(candidate);

  const parentDriveResolved = /^[a-zA-Z]:/u.exec(normParent)?.[0]?.toUpperCase();
  const candidateDriveResolved = /^[a-zA-Z]:/u.exec(normCandidate)?.[0]?.toUpperCase();
  if (parentDriveResolved || candidateDriveResolved) {
    if (parentDriveResolved !== candidateDriveResolved) {
      return false;
    }
  }

  const relative = path.relative(normParent, normCandidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function mapToGeneratedGo(input: GoMappingInput): GoTarget | undefined {
  if (
    hasNul(input.workspaceRoot) ||
    hasNul(input.moduleRoot) ||
    hasNul(input.protoFile) ||
    hasNul(input.generatedRoot) ||
    hasNul(input.declaration.name)
  ) {
    return undefined;
  }

  const workspaceRoot = path.resolve(input.workspaceRoot);
  const moduleRoot = path.resolve(input.moduleRoot);
  const protoFile = path.resolve(input.protoFile);

  if (!isWithin(workspaceRoot, moduleRoot)) {
    return undefined;
  }

  if (!isWithin(moduleRoot, protoFile)) {
    return undefined;
  }

  const resolvedGenRoot = path.resolve(moduleRoot, input.generatedRoot);

  if (!isWithin(workspaceRoot, resolvedGenRoot)) {
    return undefined;
  }

  if (!protoFile.endsWith(".proto")) {
    return undefined;
  }

  const relPath = path.relative(moduleRoot, protoFile);
  const isGrpc = input.declaration.kind === "service" || input.declaration.kind === "rpc";
  const suffix = isGrpc ? "_grpc.pb.go" : ".pb.go";
  const genRelPath = relPath.slice(0, -".proto".length) + suffix;
  const filePath = path.join(resolvedGenRoot, genRelPath);

  return {
    filePath,
    symbolName: input.declaration.name,
    kind: input.declaration.kind,
    ...(input.declaration.parentService ? { parentService: input.declaration.parentService } : {})
  };
}
