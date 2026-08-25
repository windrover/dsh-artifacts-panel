/**
 * dsh-artifacts-panel — Host half type declarations.
 */
import type { Context } from '@deepseek-ai/cordis';

/** Stable type category key for an artifact file. */
export type ArtifactCategory =
	| 'code'
	| 'docs'
	| 'config'
	| 'data'
	| 'image'
	| 'media'
	| 'web'
	| 'archive'
	| 'other';

/** One scanned artifact file. */
export interface ArtifactRow {
	/** Absolute file path. */
	path: string;
	/** File basename. */
	name: string;
	/** Lowercase extension without the leading dot ('' when none). */
	ext: string;
	/** Type category key. */
	category: ArtifactCategory;
	/** Byte size. */
	size: number;
	/** Last-modified time in milliseconds since the epoch. */
	mtimeMs: number;
	/** Line count for text files within the size cap; null for binary/huge files. */
	lines: number | null;
}

/** Result of one scan. */
export interface ArtifactScanResult {
	/** Canonical scanned directory. */
	dir: string;
	/** Number of file rows returned. */
	scanned: number;
	/** Entries skipped (symlinks, non-files, skipped directories). */
	skipped: number;
	/** True when the maxFiles cap stopped the walk early. */
	limitReached: boolean;
	/** Artifact rows, directory-walk order. */
	files: ArtifactRow[];
}

/** Plugin configuration. */
export interface ArtifactsPanelConfig {
	/** Scan scope: only registered workspaces, or any directory. */
	scope: 'workspace' | 'any';
	/** Maximum recursion depth (0 = current directory only). */
	maxDepth: number;
	/** Maximum number of files per scan. */
	maxFiles: number;
	/** Maximum per-file size (bytes) that participates in line counting. */
	maxLineFileSize: number;
	/** Directory basenames skipped at every level. */
	skipDirs: string[];
}

/** Map a lowercase extension to a type category key. */
export declare function categorize(ext: string): ArtifactCategory;
/** Probe the first bytes of a file for binary content. */
export declare function isBinary(buffer: Uint8Array): boolean;
/** Count lines in a text buffer. */
export declare function countLines(text: string): number;
/** Scan one regular file into an artifact row. */
export declare function scanFile(filePath: string, cfg: ArtifactsPanelConfig): Promise<ArtifactRow>;
/** Resolve canonical allowed roots for the workspace scope. */
export declare function workspaceRoots(ctx: Context): Promise<string[]>;
/** Scan a directory recursively into artifact rows. */
export declare function scanWorkspace(dir: string, cfg: ArtifactsPanelConfig, roots: string[]): Promise<ArtifactScanResult>;
/** Plugin body: registers POST /api/artifacts/scan on the web server. */
export declare function apply(ctx: Context, config: ArtifactsPanelConfig): void;
