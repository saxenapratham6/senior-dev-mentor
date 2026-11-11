// The repo index: everything plain code can work out about a repository for
// certain, with no AI. Tours are built from this, and anything an AI says
// about the repo later is checked against it.

export type FileKind = "source" | "test" | "config" | "doc" | "generated" | "migration" | "vendored" | "asset" | "secret" | "other";

/** A file found in the workspace. `text` is missing when it wasn't read (too big, binary, or may hold secrets). */
export interface RepoFile {
  path: string; // relative, with forward slashes
  size: number;
  text?: string;
}

export interface CodeSymbol {
  name: string;
  line: number; // 0-based
  kind: "function" | "class" | "type" | "const";
  usedBy?: string[]; // files that import this one and mention the name
}

export interface EntryPoint {
  line: number; // 0-based
  why: string; // Markdown, one sentence
}

export interface Route {
  line: number; // 0-based
  method: string; // GET, POST… or PAGE / API for file-based routes
  path: string;
}

export type Bucket = "start" | "core" | "supporting" | "skip";

export interface FileInfo {
  path: string;
  language?: string;
  kind: FileKind;
  size: number;
  lines: number;
  read: boolean;
  imports: string[]; // repo paths this file imports
  importedBy: string[];
  symbols: CodeSymbol[];
  entry?: EntryPoint;
  routes: Route[];
  /** The symbol other files use most: usually the reason the file exists. */
  main?: CodeSymbol;
  doc?: string; // the comment or docstring at the top of the file
  role?: string; // a short phrase, e.g. "describes the data", from the file's name and contents
  score: number; // 0 to 100
  reasons: string[]; // why it got that score, shown to the student
  bucket: Bucket;
  skipWhy?: string; // for "safe to skip": the reason
}

export interface Framework {
  id: string;
  name: string;
  what: string; // what it is, for someone who's never heard of it
  evidence: string; // where we saw it
}

export interface Manifest {
  path: string;
  kind: "npm" | "python" | "go" | "cargo" | "maven" | "gradle" | "ruby" | "php";
  name?: string;
  description?: string;
  scripts: Record<string, string>;
  scriptsLine?: number;
  deps: string[];
  /** Files the manifest says start the program, with what it says. */
  entries: { file: string; why: string }[];
}

export interface FolderInfo {
  path: string;
  role: string;
  files: number;
}

export interface RepoIndex {
  name: string;
  description?: string;
  readme?: string;
  languages: { name: string; files: number; lines: number }[];
  frameworks: Framework[];
  manifests: Manifest[];
  files: FileInfo[];
  folders: FolderInfo[];
  totalFiles: number; // found, before any limit
  truncated: boolean; // stopped scanning at the file limit
}
