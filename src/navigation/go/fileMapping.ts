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

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function mapToGeneratedGo(input: GoMappingInput): GoTarget | undefined {
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
