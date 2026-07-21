export type ProtoDeclarationKind = "message" | "enum" | "service" | "rpc";

export interface ProtoDeclaration {
  readonly kind: ProtoDeclarationKind;
  readonly name: string;
  readonly line: number;
  readonly startCharacter: number;
  readonly endCharacter: number;
  readonly parentService?: string;
}

type ScanState = "code" | "line-comment" | "block-comment" | "string";

export function maskComments(text: string): string {
  const buf = Buffer.from(text, "utf8");
  const len = buf.length;
  let state: ScanState = "code";
  let quoteChar = 0;

  for (let i = 0; i < len; i++) {
    const ch = buf[i];
    const nextCh = i + 1 < len ? buf[i + 1] : 0;

    if (state === "line-comment") {
      if (ch === 10) {
        state = "code";
      } else {
        buf[i] = 32;
      }
    } else if (state === "block-comment") {
      if (ch === 42 && nextCh === 47) {
        state = "code";
        buf[i] = 32;
        if (i + 1 < len) {
          buf[i + 1] = 32;
        }
        i++;
      } else if (ch !== 10) {
        buf[i] = 32;
      }
    } else if (state === "string") {
      if (quoteChar !== 96 && ch === 92) {
        buf[i] = 32;
        if (i + 1 < len && buf[i + 1] !== 10) {
          buf[i + 1] = 32;
        }
        i++;
      } else if (ch === quoteChar) {
        state = "code";
        quoteChar = 0;
      } else if (ch !== 10) {
        buf[i] = 32;
      }
    } else {
      if (ch === 47 && nextCh === 47) {
        state = "line-comment";
        buf[i] = 32;
        if (i + 1 < len) {
          buf[i + 1] = 32;
        }
        i++;
      } else if (ch === 47 && nextCh === 42) {
        state = "block-comment";
        buf[i] = 32;
        if (i + 1 < len) {
          buf[i + 1] = 32;
        }
        i++;
      } else if (ch === 34 || ch === 39 || ch === 96) {
        state = "string";
        quoteChar = ch;
      }
    }
  }

  return buf.toString("utf8");
}

const TOP_LEVEL = /^\s*(message|enum|service)\s+([A-Za-z_][A-Za-z0-9_]*)\b/u;
const RPC = /^\s*rpc\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/u;

function getCurrentService(
  scopeStack: { kind: "service" | "other"; serviceName?: string }[],
  pendingService?: string
): string | undefined {
  for (let s = scopeStack.length - 1; s >= 0; s--) {
    const item = scopeStack[s];
    if (item?.kind === "service") {
      return item.serviceName;
    }
  }
  return pendingService;
}

export function findDeclarationAt(
  text: string,
  line: number,
  character: number
): ProtoDeclaration | undefined {
  if (line < 0 || character < 0) {
    return undefined;
  }

  const maskedText = maskComments(text);
  const lines = maskedText.split("\n");

  if (line >= lines.length) {
    return undefined;
  }

  const scopeStack: { kind: "service" | "other"; serviceName?: string }[] = [];
  let pendingService: string | undefined;
  let targetDeclaration: ProtoDeclaration | undefined;

  for (let i = 0; i <= line; i++) {
    const lineText = lines[i];
    if (lineText === undefined) {
      continue;
    }

    let declOnLine: {
      kind: ProtoDeclarationKind;
      name: string;
      startCharacter: number;
      endCharacter: number;
      parentService?: string;
    } | undefined;

    const topMatch = TOP_LEVEL.exec(lineText);
    if (topMatch) {
      const kind = topMatch[1] as ProtoDeclarationKind;
      const name = topMatch[2];
      if (name) {
        const endCharacter = topMatch.index + topMatch[0].length;
        const startCharacter = endCharacter - name.length;
        declOnLine = { kind, name, startCharacter, endCharacter };

        if (kind === "service") {
          pendingService = name;
        }
      }
    } else {
      const rpcMatch = RPC.exec(lineText);
      if (rpcMatch) {
        const kind: ProtoDeclarationKind = "rpc";
        const name = rpcMatch[1];
        if (name) {
          const startCharacter = lineText.indexOf(name, rpcMatch.index);
          const endCharacter = startCharacter + name.length;
          const parentService = getCurrentService(scopeStack, pendingService);
          if (parentService) {
            declOnLine = { kind, name, startCharacter, endCharacter, parentService };
          }
        }
      }
    }

    if (i === line && declOnLine) {
      if (character >= declOnLine.startCharacter && character <= declOnLine.endCharacter) {
        targetDeclaration = {
          kind: declOnLine.kind,
          name: declOnLine.name,
          line: i,
          startCharacter: declOnLine.startCharacter,
          endCharacter: declOnLine.endCharacter,
          ...(declOnLine.parentService ? { parentService: declOnLine.parentService } : {})
        };
      }
    }

    for (const ch of lineText) {
      if (ch === "{") {
        if (pendingService) {
          scopeStack.push({ kind: "service", serviceName: pendingService });
          pendingService = undefined;
        } else {
          scopeStack.push({ kind: "other" });
        }
      } else if (ch === "}") {
        scopeStack.pop();
      }
    }
  }

  return targetDeclaration;
}
