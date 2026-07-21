import type { GoTarget } from "./fileMapping.js";

export interface IndexedLocation {
  readonly line: number;
  readonly startCharacter: number;
  readonly endCharacter: number;
}

export interface GoIndex {
  find(
    content: string,
    target: GoTarget,
    isCancelled?: () => boolean
  ): IndexedLocation | undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function maskCommentsAndStrings(text: string): string {
  const buf = Buffer.from(text, "utf8");
  const len = buf.length;
  let state: "code" | "line-comment" | "block-comment" | "string" = "code";
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

class GoIndexImpl implements GoIndex {
  find(
    content: string,
    target: GoTarget,
    isCancelled?: () => boolean
  ): IndexedLocation | undefined {
    if (isCancelled?.()) {
      return undefined;
    }

    const maskedContent = maskCommentsAndStrings(content);
    const lines = maskedContent.split(/\r?\n/u);
    const escapedSymbol = escapeRegExp(target.symbolName);

    switch (target.kind) {
      case "message": {
        const pattern = new RegExp(`^\\s*type\\s+${escapedSymbol}\\s+struct\\b`, "u");
        for (let i = 0; i < lines.length; i++) {
          if (i % 128 === 0 && isCancelled?.()) {
            return undefined;
          }
          const line = lines[i];
          if (line !== undefined && pattern.test(line)) {
            const startCharacter = line.indexOf(target.symbolName);
            if (startCharacter !== -1) {
              return {
                line: i,
                startCharacter,
                endCharacter: startCharacter + target.symbolName.length
              };
            }
          }
        }
        break;
      }

      case "enum": {
        const pattern = new RegExp(`^\\s*type\\s+${escapedSymbol}\\s+int32\\b`, "u");
        for (let i = 0; i < lines.length; i++) {
          if (i % 128 === 0 && isCancelled?.()) {
            return undefined;
          }
          const line = lines[i];
          if (line !== undefined && pattern.test(line)) {
            const startCharacter = line.indexOf(target.symbolName);
            if (startCharacter !== -1) {
              return {
                line: i,
                startCharacter,
                endCharacter: startCharacter + target.symbolName.length
              };
            }
          }
        }
        break;
      }

      case "service": {
        const goServiceName = `${target.symbolName}Server`;
        const escapedService = escapeRegExp(goServiceName);
        const pattern = new RegExp(`^\\s*type\\s+${escapedService}\\s+interface\\b`, "u");
        for (let i = 0; i < lines.length; i++) {
          if (i % 128 === 0 && isCancelled?.()) {
            return undefined;
          }
          const line = lines[i];
          if (line !== undefined && pattern.test(line)) {
            const startCharacter = line.indexOf(goServiceName);
            if (startCharacter !== -1) {
              return {
                line: i,
                startCharacter,
                endCharacter: startCharacter + goServiceName.length
              };
            }
          }
        }
        break;
      }

      case "rpc": {
        if (!target.parentService) {
          return undefined;
        }

        const goServiceName = `${target.parentService}Server`;
        const escapedService = escapeRegExp(goServiceName);
        const serviceHeaderPattern = new RegExp(`^\\s*type\\s+${escapedService}\\s+interface\\b`, "u");
        const rpcPattern = new RegExp(`^\\s*${escapedSymbol}\\s*\\(`, "u");

        let insideInterface = false;
        let braceDepth = 0;

        for (let i = 0; i < lines.length; i++) {
          if (i % 128 === 0 && isCancelled?.()) {
            return undefined;
          }
          const line = lines[i];
          if (line === undefined) {
            continue;
          }

          if (!insideInterface) {
            if (serviceHeaderPattern.test(line)) {
              insideInterface = true;
              for (const ch of line) {
                if (ch === "{") braceDepth++;
                else if (ch === "}") braceDepth--;
              }
            }
          } else {
            if (rpcPattern.test(line)) {
              const startCharacter = line.indexOf(target.symbolName);
              if (startCharacter !== -1) {
                return {
                  line: i,
                  startCharacter,
                  endCharacter: startCharacter + target.symbolName.length
                };
              }
            }

            for (const ch of line) {
              if (ch === "{") braceDepth++;
              else if (ch === "}") braceDepth--;
            }

            if (braceDepth <= 0) {
              insideInterface = false;
            }
          }
        }
        break;
      }
    }

    return undefined;
  }
}

export function createGoIndex(): GoIndex {
  return new GoIndexImpl();
}
