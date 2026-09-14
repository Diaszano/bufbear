import type * as vscode from "vscode";
import type { Output } from "../../platform/output.js";
import type { GoNavigationService, NavigationResult } from "./navigationService.js";
import { findDeclarationAt, type ProtoDeclaration } from "./declaration.js";
import { findBufRoot } from "../../lsp/rootDiscovery.js";
import { readConfig } from "../../config/config.js";
import { getVscode } from "../../platform/vscodeRef.js";

export interface ResolutionDependencies {
  readonly navigation: GoNavigationService;
  readonly readConfig?: typeof readConfig | undefined;
  readonly findDeclarationAt?: typeof findDeclarationAt | undefined;
  readonly findBufRoot?: typeof findBufRoot | undefined;
  readonly getWorkspaceFolder?: ((uri: vscode.Uri) => vscode.WorkspaceFolder | undefined) | undefined;
  readonly isTrusted?: (() => boolean) | undefined;
  readonly vscode?: typeof vscode | undefined;
}

export type ResolutionStatus =
  | "success"
  | "untrusted"
  | "disabled"
  | "no_declaration"
  | "no_workspace_folder"
  | "no_buf_root"
  | "not_found"
  | "cancelled";

export type GoImplementationResolution =
  | { readonly status: "success"; readonly result: NavigationResult }
  | { readonly status: Exclude<ResolutionStatus, "success">; readonly result?: undefined };

export async function resolveGoImplementation(
  document: vscode.TextDocument,
  position: vscode.Position,
  token: vscode.CancellationToken | undefined,
  deps: ResolutionDependencies
): Promise<GoImplementationResolution> {
  const vsc = deps.vscode ?? getVscode();
  const isTrustedFn = deps.isTrusted ?? (() => vsc?.workspace.isTrusted ?? true);
  if (!isTrustedFn() || token?.isCancellationRequested) {
    return { status: token?.isCancellationRequested ? "cancelled" : "untrusted" };
  }

  const readCfg = deps.readConfig ?? readConfig;
  const config = readCfg(document.uri);
  if (!config.goEnabled || !config.goSourceRelative) {
    return { status: "disabled" };
  }

  const findDecl = deps.findDeclarationAt ?? findDeclarationAt;
  const declaration: ProtoDeclaration | undefined = findDecl(
    document.getText(),
    position.line,
    position.character
  );
  if (!declaration || token?.isCancellationRequested) {
    return { status: token?.isCancellationRequested ? "cancelled" : "no_declaration" };
  }

  const getWsFolder = deps.getWorkspaceFolder ?? ((uri: vscode.Uri) => vsc?.workspace.getWorkspaceFolder(uri));
  const workspaceFolder = getWsFolder(document.uri);
  if (!workspaceFolder) {
    return { status: "no_workspace_folder" };
  }

  const findRoot = deps.findBufRoot ?? findBufRoot;
  const moduleRoot = await findRoot(document.uri.fsPath, workspaceFolder.uri.fsPath);
  if (!moduleRoot || token?.isCancellationRequested) {
    return { status: token?.isCancellationRequested ? "cancelled" : "no_buf_root" };
  }

  const result = await deps.navigation.find({
    workspaceRoot: workspaceFolder.uri.fsPath,
    moduleRoot,
    protoFile: document.uri.fsPath,
    generatedRoot: config.goGenRoot,
    declaration,
    isCancelled: () => token?.isCancellationRequested ?? false
  });

  if (!result || token?.isCancellationRequested) {
    return { status: token?.isCancellationRequested ? "cancelled" : "not_found" };
  }

  return {
    status: "success",
    result
  };
}

export interface ImplementationProviderDependencies extends ResolutionDependencies {
  readonly output: Pick<Output, "write">;
}

export class GeneratedGoImplementationProvider implements vscode.ImplementationProvider {
  readonly #dependencies: ImplementationProviderDependencies;

  public constructor(dependencies: ImplementationProviderDependencies) {
    this.#dependencies = dependencies;
  }

  public async provideImplementation(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Location | undefined> {
    try {
      const resolution = await resolveGoImplementation(document, position, token, this.#dependencies);
      if (resolution.status !== "success") {
        return undefined;
      }

      const vsc = this.#dependencies.vscode ?? getVscode();
      if (!vsc) {
        return undefined;
      }

      return new vsc.Location(
        vsc.Uri.file(resolution.result.filePath),
        new vsc.Position(resolution.result.location.line, resolution.result.location.startCharacter)
      );
    } catch (err) {
      const vsc = this.#dependencies.vscode ?? getVscode();
      const relPath = vsc?.workspace ? vsc.workspace.asRelativePath(document.uri, false) : document.uri.fsPath;
      this.#dependencies.output.write(
        "error",
        "GoNavigation",
        `Error providing implementation: ${err instanceof Error ? err.message : String(err)}`,
        relPath
      );
      return undefined;
    }
  }
}
