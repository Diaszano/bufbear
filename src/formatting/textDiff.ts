export interface LineEdit {
  readonly startLine: number;
  readonly endLineExclusive: number;
  readonly newText: string;
}

/**
 * Upper bound for the O(n*m) LCS matrix (~16 MiB of Uint32Array at 4M cells).
 * Beyond this, diffLines falls back to one coarse replace edit covering the
 * changed region instead of allocating an enormous matrix on the extension
 * host thread.
 */
const MAX_LCS_CELLS = 4 * 1024 * 1024;

export function diffLines(
  originalLines: readonly string[],
  formattedLines: readonly string[]
): LineEdit[] {
  const originalCount = originalLines.length;
  const formattedCount = formattedLines.length;

  // Trim the common prefix and suffix first. Formatting usually touches a
  // small region, so this keeps the quadratic LCS work confined to the
  // actually-changed middle instead of the whole document.
  const maxCommon = Math.min(originalCount, formattedCount);
  let prefix = 0;
  while (prefix < maxCommon && originalLines[prefix] === formattedLines[prefix]) {
    prefix++;
  }
  let suffix = 0;
  const maxSuffix = maxCommon - prefix;
  while (
    suffix < maxSuffix &&
    originalLines[originalCount - 1 - suffix] === formattedLines[formattedCount - 1 - suffix]
  ) {
    suffix++;
  }

  const midOriginalCount = originalCount - prefix - suffix;
  const midFormattedCount = formattedCount - prefix - suffix;

  // Anchor points already known to match (trimmed prefix/suffix), so the
  // gap-edit pass below only has to consider the middle region.
  const matches: [number, number][] = [];
  for (let k = 0; k < prefix; k++) {
    matches.push([k, k]);
  }

  if (midOriginalCount > 0 && midFormattedCount > 0 && midOriginalCount * midFormattedCount <= MAX_LCS_CELLS) {
    const width = midFormattedCount + 1;
    const lcs = new Uint32Array((midOriginalCount + 1) * width);

    for (let i = midOriginalCount - 1; i >= 0; i--) {
      const originalLine = originalLines[i + prefix];
      for (let j = midFormattedCount - 1; j >= 0; j--) {
        lcs[i * width + j] =
          originalLine === formattedLines[j + prefix]
            ? (lcs[(i + 1) * width + j + 1] ?? 0) + 1
            : Math.max(lcs[(i + 1) * width + j] ?? 0, lcs[i * width + j + 1] ?? 0);
      }
    }

    let i = 0;
    let j = 0;
    while (i < midOriginalCount && j < midFormattedCount) {
      if (originalLines[i + prefix] === formattedLines[j + prefix]) {
        matches.push([i + prefix, j + prefix]);
        i++;
        j++;
      } else if (lcs[i * width + j] === lcs[(i + 1) * width + j + 1]) {
        i++;
        j++;
      } else if ((lcs[(i + 1) * width + j] ?? 0) >= (lcs[i * width + j + 1] ?? 0)) {
        i++;
      } else {
        j++;
      }
    }
  }

  for (let k = suffix; k > 0; k--) {
    matches.push([originalCount - k, formattedCount - k]);
  }

  const edits: LineEdit[] = [];
  let originalCursor = 0;
  let formattedCursor = 0;
  for (const [matchedOriginal, matchedFormatted] of matches) {
    pushGapEdit(
      edits,
      originalLines,
      formattedLines,
      originalCursor,
      matchedOriginal,
      formattedCursor,
      matchedFormatted
    );
    originalCursor = matchedOriginal + 1;
    formattedCursor = matchedFormatted + 1;
  }
  pushGapEdit(edits, originalLines, formattedLines, originalCursor, originalCount, formattedCursor, formattedCount);

  return mergeAdjacentEdits(edits);
}

function mergeAdjacentEdits(edits: LineEdit[]): LineEdit[] {
  const merged: LineEdit[] = [];
  for (const edit of edits) {
    const previous = merged.at(-1);
    if (previous?.endLineExclusive !== edit.startLine) {
      merged.push(edit);
      continue;
    }
    const newText =
      previous.newText === ""
        ? edit.newText
        : edit.newText === ""
          ? previous.newText
          : `${previous.newText}\n${edit.newText}`;
    merged[merged.length - 1] = {
      startLine: previous.startLine,
      endLineExclusive: edit.endLineExclusive,
      newText
    };
  }
  return merged;
}

function pushGapEdit(
  edits: LineEdit[],
  originalLines: readonly string[],
  formattedLines: readonly string[],
  originalStart: number,
  originalEnd: number,
  formattedStart: number,
  formattedEnd: number
): void {
  const inserted = formattedLines.slice(formattedStart, formattedEnd);

  if (originalEnd > originalStart) {
    edits.push({
      startLine: originalStart,
      endLineExclusive: originalEnd,
      newText: inserted.join("\n")
    });
    return;
  }

  if (inserted.length === 0) {
    return;
  }

  const insertionText = inserted.join("\n");
  const previous = edits.at(-1);
  if (previous?.endLineExclusive === originalStart) {
    const joined = previous.newText === "" ? insertionText : `${previous.newText}\n${insertionText}`;
    edits[edits.length - 1] = { ...previous, newText: joined };
    return;
  }

  const anchor = originalLines[originalStart - 1];
  if (anchor !== undefined) {
    edits.push({
      startLine: originalStart - 1,
      endLineExclusive: originalStart,
      newText: `${anchor}\n${insertionText}`
    });
    return;
  }

  const first = originalLines[0];
  if (first !== undefined) {
    edits.push({ startLine: 0, endLineExclusive: 1, newText: `${insertionText}\n${first}` });
    return;
  }

  edits.push({ startLine: 0, endLineExclusive: 0, newText: insertionText });
}
