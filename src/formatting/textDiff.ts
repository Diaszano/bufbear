export interface LineEdit {
  readonly startLine: number;
  readonly endLineExclusive: number;
  readonly newText: string;
}

export function diffLines(originalLines: readonly string[], formattedLines: readonly string[]): LineEdit[] {
  let prefix = 0;
  while (
    prefix < originalLines.length &&
    prefix < formattedLines.length &&
    originalLines[prefix] === formattedLines[prefix]
  ) {
    prefix++;
  }

  if (prefix === originalLines.length && prefix === formattedLines.length) {
    return [];
  }

  let suffix = 0;
  while (
    suffix < originalLines.length - prefix &&
    suffix < formattedLines.length - prefix &&
    originalLines[originalLines.length - 1 - suffix] === formattedLines[formattedLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  const originalStart = prefix;
  const originalEnd = originalLines.length - suffix;
  const replacementLines = formattedLines.slice(prefix, formattedLines.length - suffix);
  const replacementText = replacementLines.join("\n");

  if (originalEnd > originalStart) {
    return [
      {
        startLine: originalStart,
        endLineExclusive: originalEnd,
        newText: replacementText,
      },
    ];
  }

  // Pure insertion
  if (originalStart > 0) {
    const anchor = originalLines[originalStart - 1];
    if (anchor !== undefined) {
      return [
        {
          startLine: originalStart - 1,
          endLineExclusive: originalStart,
          newText: `${anchor}\n${replacementText}`,
        },
      ];
    }
  }

  if (originalLines.length > 0) {
    const first = originalLines[0];
    if (first !== undefined) {
      return [
        {
          startLine: 0,
          endLineExclusive: 1,
          newText: `${replacementText}\n${first}`,
        },
      ];
    }
  }

  return [
    {
      startLine: 0,
      endLineExclusive: 0,
      newText: replacementText,
    },
  ];
}
