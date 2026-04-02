export interface MolEntry {
  key: string;
  value?: string;
  children: MolEntry[];
  source: "heading" | "entry";
  line: number;
}

export interface MolDocument {
  entries: MolEntry[];
}

export type KeyTransform = (key: string) => string;

export interface ParseOptions {
  keyTransform?: KeyTransform;
  valueKey?: string;
  preserveRootHeadings?: boolean;
}

export interface PreparedLine {
  text: string;
  indent: number;
  trimmed: string;
  lineNumber: number;
}

export interface Frame {
  entry: MolEntry;
  indent: number;
  headingDepth?: number;
  mode: "pending" | "text" | "children";
  textBaseIndent?: number;
  fence?: FenceInfo;
}

export interface ParsedEntryLine {
  key: string;
  value?: string;
}

export interface FenceInfo {
  markerChar: "`" | "~";
  markerLength: number;
}
