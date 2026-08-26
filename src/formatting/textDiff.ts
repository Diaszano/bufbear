export interface LineEdit {
  readonly startLine: number;
  readonly endLineExclusive: number;
  readonly newText: string;
}

export function diffLines(
  originalLines: readonly string[],
  formattedLines: readonly string[]
): LineEdit[] {
  const originalCount = originalLines.length;
  const formattedCount = formattedLines.length;
  const width = formattedCount + 1;
  const lcs = new Uint32Array((originalCount + 1) * width);

  for (let i = originalCount - 1; i >= 0; i--) {
    for (let j = formattedCount - 1; j >= 0; j--) {
      lcs[i * width + j] =
        originalLines[i] === formattedLines[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }

  const matches: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < originalCount && j < formattedCount) {
    if (originalLines[i] === formattedLines[j]) {
      matches.push([i, j]);
      i++;
      j++;
    } else if (lcs[i * width + j] === lcs[(i + 1) * width + j + 1]) {
      i++;
      j++;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      i++;
    } else {
      j++;
    }
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
    if (!previous || previous.endLineExclusive !== edit.startLine) {
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
  if (previous && previous.endLineExclusive === originalStart) {
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
