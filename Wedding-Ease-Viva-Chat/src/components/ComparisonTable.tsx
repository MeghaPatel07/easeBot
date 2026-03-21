import React, { useMemo, useState, useCallback } from "react";
import { ArrowUp, ArrowDown, CheckSquare, Table } from "lucide-react";

interface ComparisonTableProps {
  markdownTable: string;
  onSaveToPlanner?: () => void;
}

interface ParsedTable {
  headers: string[];
  rows: string[][];
}

/**
 * Check whether a string contains a markdown table.
 * Requires at least 3 lines with pipe characters, where the second line
 * is a separator row composed of dashes (and optional colons / pipes / spaces).
 */
export function isMarkdownTable(text: string): boolean {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 3) return false;

  let tableStart = -1;
  for (let i = 0; i < lines.length - 2; i++) {
    const headerLine = lines[i];
    const separatorLine = lines[i + 1];
    const dataLine = lines[i + 2];

    if (
      headerLine.includes("|") &&
      dataLine.includes("|") &&
      /^\|?[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)+\|?$/.test(separatorLine)
    ) {
      tableStart = i;
      break;
    }
  }

  return tableStart !== -1;
}

function parseMarkdownTable(markdown: string): ParsedTable | null {
  const lines = markdown
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 3) return null;

  // Find the separator row to locate the table start
  let separatorIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (/^\|?[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)+\|?$/.test(lines[i])) {
      separatorIdx = i;
      break;
    }
  }

  if (separatorIdx < 1) return null;

  const parseLine = (line: string): string[] => {
    // Strip leading/trailing pipes then split
    let trimmed = line.trim();
    if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
    if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
    return trimmed.split("|").map((cell) => cell.trim());
  };

  const headers = parseLine(lines[separatorIdx - 1]);
  const rows: string[][] = [];

  for (let i = separatorIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    // Stop if we hit a line that doesn't look like a table row
    if (!line.includes("|")) break;
    const cells = parseLine(line);
    // Pad or trim to match header length
    const normalized = headers.map((_, idx) => cells[idx] ?? "");
    rows.push(normalized);
  }

  if (rows.length === 0) return null;

  return { headers, rows };
}

/**
 * Strip currency symbols, commas, and common suffixes to extract a raw number.
 * Returns NaN if the value isn't numeric.
 */
function extractNumber(value: string): number {
  const cleaned = value.replace(/[$,€£₹]/g, "").replace(/\s/g, "").trim();
  const num = parseFloat(cleaned);
  return num;
}

function isNumericColumn(rows: string[][], colIdx: number): boolean {
  let numericCount = 0;
  for (const row of rows) {
    const val = row[colIdx];
    if (val && !isNaN(extractNumber(val))) {
      numericCount++;
    }
  }
  // Consider numeric if at least half of non-empty cells are numbers
  return numericCount > 0 && numericCount >= rows.length * 0.5;
}

type HighlightKind = "lowest-best" | "highest-best" | null;

function getHighlightKind(header: string): HighlightKind {
  const lower = header.toLowerCase();
  if (/price|cost|fee|budget|expense/i.test(lower)) return "lowest-best";
  if (/rating|score|stars|review|rank/i.test(lower)) return "highest-best";
  return null;
}

const ComparisonTable: React.FC<ComparisonTableProps> = ({
  markdownTable,
  onSaveToPlanner,
}) => {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const parsed = useMemo(() => parseMarkdownTable(markdownTable), [markdownTable]);

  const handleSort = useCallback(
    (colIdx: number) => {
      if (sortCol === colIdx) {
        setSortAsc((prev) => !prev);
      } else {
        setSortCol(colIdx);
        setSortAsc(true);
      }
    },
    [sortCol]
  );

  const sortedRows = useMemo(() => {
    if (!parsed) return [];
    if (sortCol === null) return parsed.rows;

    const numeric = isNumericColumn(parsed.rows, sortCol);
    const sorted = [...parsed.rows].sort((a, b) => {
      const aVal = a[sortCol] ?? "";
      const bVal = b[sortCol] ?? "";

      if (numeric) {
        const aNum = extractNumber(aVal);
        const bNum = extractNumber(bVal);
        const aOk = !isNaN(aNum);
        const bOk = !isNaN(bNum);
        if (aOk && bOk) return sortAsc ? aNum - bNum : bNum - aNum;
        if (aOk) return -1;
        if (bOk) return 1;
        return 0;
      }

      return sortAsc
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    });

    return sorted;
  }, [parsed, sortCol, sortAsc]);

  // Precompute best-value indices per column for highlighting
  const bestIndices = useMemo(() => {
    if (!parsed) return new Map<string, Set<number>>();
    const map = new Map<string, Set<number>>();

    parsed.headers.forEach((header, colIdx) => {
      const kind = getHighlightKind(header);
      if (!kind || !isNumericColumn(sortedRows, colIdx)) return;

      let bestVal: number | null = null;
      const indices = new Set<number>();

      sortedRows.forEach((row, rowIdx) => {
        const num = extractNumber(row[colIdx]);
        if (isNaN(num)) return;

        if (bestVal === null) {
          bestVal = num;
          indices.add(rowIdx);
        } else if (
          (kind === "lowest-best" && num < bestVal) ||
          (kind === "highest-best" && num > bestVal)
        ) {
          bestVal = num;
          indices.clear();
          indices.add(rowIdx);
        } else if (num === bestVal) {
          indices.add(rowIdx);
        }
      });

      map.set(`${colIdx}`, indices);
    });

    return map;
  }, [parsed, sortedRows]);

  if (!parsed) {
    return null;
  }

  const { headers } = parsed;

  return (
    <div className="my-3 w-full">
      {/* Header bar */}
      <div className="flex items-center gap-1.5 mb-1.5 text-xs text-stone-500">
        <Table className="w-3.5 h-3.5 text-[#A2B29D]" />
        <span className="font-medium">Comparison</span>
      </div>

      {/* Scrollable table wrapper */}
      <div className="overflow-x-auto rounded-xl border border-[#EBE4D9]">
        <table className="w-full border-collapse text-left min-w-[400px]">
          <thead>
            <tr className="bg-[#f4f4ed]">
              {headers.map((header, colIdx) => (
                <th
                  key={colIdx}
                  onClick={() => handleSort(colIdx)}
                  className="px-3 py-2 text-xs font-semibold text-stone-700 cursor-pointer select-none whitespace-nowrap"
                >
                  <span className="inline-flex items-center gap-1">
                    {header}
                    {sortCol === colIdx &&
                      (sortAsc ? (
                        <ArrowUp className="w-3 h-3 text-[#A2B29D]" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-[#A2B29D]" />
                      ))}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className={`transition-colors hover:bg-[#f0ede5] ${
                  rowIdx % 2 === 0 ? "bg-white" : "bg-stone-50"
                }`}
              >
                {row.map((cell, colIdx) => {
                  const highlighted = bestIndices
                    .get(`${colIdx}`)
                    ?.has(rowIdx);
                  return (
                    <td
                      key={colIdx}
                      className={`px-3 py-2 text-sm text-stone-600 ${
                        highlighted
                          ? "text-green-700 font-semibold bg-green-50/60"
                          : ""
                      }`}
                    >
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Save to Planner button */}
      {onSaveToPlanner && (
        <div className="mt-2 flex justify-end">
          <button
            onClick={onSaveToPlanner}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#A2B29D] border border-[#A2B29D]/40 rounded-lg hover:bg-[#A2B29D]/10 transition-colors"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            Save to Planner
          </button>
        </div>
      )}
    </div>
  );
};

export default ComparisonTable;
