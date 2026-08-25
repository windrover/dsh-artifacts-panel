/**
 * dsh-artifacts-panel — Host half.
 *
 * Registers one exact HTTP route on the DSH web server:
 *
 *   POST /api/artifacts/scan   body: { "dir": "/abs/path" }
 *
 * Recursively scans `dir` and returns one metadata row per file:
 * path, name, extension, type category, byte size, mtime (ms), and line
 * count (null for binary files and files above the size cap). The browser
 * half fetches this route and does all grouping/sorting locally, so the
 * wire stays small (metadata only, never file contents).
 *
 * Safety: with `scope: workspace` (default) the route refuses any directory
 * that is not a registered workspace or one of its subdirectories. The
 * workspace set is read from the host workspaceRegistry at request time.
 */
import { promises as fs } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { basename, extname, join, sep } from "node:path";
import z from "@deepseek-ai/schemastery";

export const name = "dsh-artifacts-panel";

/** Services required for load ordering: the web server and the workspace registry must exist first. */
export const inject = ["webServer", "workspaceRegistry"];

/** Plugin configuration (also declared in cordis.patch.yml). */
export const Config = z.object({
	scope: z.union([z.const("workspace"), z.const("any")]).default("workspace"),
	maxDepth: z.natural().default(8),
	maxFiles: z.natural().default(5000),
	maxLineFileSize: z.number().min(0).default(1048576),
	skipDirs: z.array(z.string()).default(["node_modules", ".git", ".svn", ".hg", "dist", "build", ".next", ".nuxt", ".turbo", ".cache", "__pycache__", ".venv", "venv", "target", "coverage", ".idea", ".vscode", ".DS_Store"])
});

/**
 * Map a file extension to a stable type category key. The browser half owns
 * the localized label for each key.
 * @param ext - lowercase extension without the leading dot.
 * @returns category key.
 */
function categorize(ext) {
	if (ext === "") return "other";
	if (["js", "ts", "jsx", "tsx", "mjs", "cjs", "py", "java", "c", "cpp", "h", "hpp", "cs", "go", "rs", "rb", "php", "swift", "kt", "scala", "sh", "bash", "zsh", "bat", "cmd", "ps1", "lua", "pl", "pm", "r"].includes(ext)) return "code";
	if (["md", "markdown", "mdx", "txt", "rst", "adoc", "pdf", "doc", "docx", "ppt", "pptx", "odt", "epub"].includes(ext)) return "docs";
	if (["json", "yaml", "yml", "toml", "ini", "conf", "cfg", "env", "properties"].includes(ext)) return "config";
	if (["csv", "tsv", "sql", "db", "sqlite", "sqlite3", "parquet", "arrow", "feather"].includes(ext)) return "data";
	if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif", "tiff"].includes(ext)) return "image";
	if (["mp3", "wav", "flac", "ogg", "m4a", "aac", "opus", "mp4", "webm", "mov", "mkv", "avi", "gifv"].includes(ext)) return "media";
	if (["css", "scss", "sass", "less", "html", "htm", "vue", "svelte", "jsx", "tsx"].includes(ext)) return "web";
	if (["zip", "tar", "gz", "bz2", "xz", "7z", "rar", "tgz", "zst"].includes(ext)) return "archive";
	return "other";
}

/**
 * Probe for binary content: a NUL byte or a non-whitespace control character
 * in the first 8 KiB means binary. Tab/newline/carriage-return/form-feed are
 * legitimately present in text; every other C0 control and DEL is not.
 * @param buffer - the first bytes of the file.
 * @returns true when the file looks binary.
 */
function isBinary(buffer) {
	const end = Math.min(buffer.length, 8192);
	for (let index = 0; index < end; index += 1) {
		const byte = buffer[index];
		if (byte === 0) return true;
		if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13 && byte !== 12) return true;
		if (byte === 127) return true;
	}
	return false;
}

/**
 * Count lines in a text buffer. Cheap and deterministic: newline count,
 * +1 when the content is non-empty and does not end with a newline.
 * @param text - decoded file content.
 * @returns line count.
 */
function countLines(text) {
	let lines = 0;
	for (let index = 0; index < text.length; index += 1) if (text.charCodeAt(index) === 10) lines += 1;
	if (text.length > 0 && text.charCodeAt(text.length - 1) !== 10) lines += 1;
	return lines;
}

/**
 * Scan one regular file into an artifact row.
 * @param filePath - absolute file path.
 * @param cfg - resolved plugin config.
 * @returns the artifact row.
 */
async function scanFile(filePath, cfg) {
	const stat = await fs.stat(filePath);
	const ext = extname(filePath).toLowerCase().replace(/^\./, "");
	const name = basename(filePath);
	let lines = null;
	if (stat.size <= cfg.maxLineFileSize) {
		try {
			const buffer = await readFile(filePath);
			if (!isBinary(buffer.subarray(0, 8192))) lines = countLines(buffer.toString("utf8"));
		} catch {
			lines = null;
		}
	}
	return {
		path: filePath,
		name,
		ext,
		category: categorize(ext),
		size: stat.size,
		mtimeMs: stat.mtimeMs,
		lines
	};
}

/**
 * Resolve the canonical allowed roots for the configured scope.
 * @param ctx - plugin context (workspaceRegistry available in the web profile).
 * @returns canonical workspace root paths; empty array in "any" scope.
 */
async function workspaceRoots(ctx) {
	const registry = ctx.workspaceRegistry;
	if (registry === void 0) return [];
	try {
		const roots = [];
		for (const workspace of registry.list()) {
			try {
				roots.push(await realpath(workspace.path));
			} catch {
				/* a disappeared workspace directory is not a scan root */
			}
		}
		return roots;
	} catch {
		return [];
	}
}

/**
 * Scan a directory recursively into artifact rows.
 * @param dir - absolute directory to scan.
 * @param cfg - resolved plugin config.
 * @param roots - canonical allowed roots (empty = no restriction).
 * @returns scan result.
 */
async function scanWorkspace(dir, cfg, roots) {
	const canonical = await realpath(dir);
	const canonicalRoots = roots.length > 0 ? await Promise.all(roots.map((root) => realpath(root).catch(() => null))) : [];
	const allowedRoots = canonicalRoots.filter((root) => root !== null);
	if (allowedRoots.length > 0) {
		const allowed = allowedRoots.some((root) => canonical === root || canonical.startsWith(root + sep));
		if (!allowed) {
			const error = new Error(`directory is outside the registered workspaces: ${canonical}`);
			error.status = 403;
			throw error;
		}
	}
	const files = [];
	let scanned = 0;
	let skipped = 0;
	let limitReached = false;
	const pending = [{ path: canonical, depth: 0 }];
	while (pending.length > 0) {
		if (scanned >= cfg.maxFiles) {
			limitReached = true;
			break;
		}
		const { path, depth } = pending.pop();
		let entries;
		try {
			entries = await fs.readdir(path, { withFileTypes: true });
		} catch {
			skipped += 1;
			continue;
		}
		for (const entry of entries) {
			if (scanned >= cfg.maxFiles) {
				limitReached = true;
				break;
			}
			if (entry.isSymbolicLink()) {
				skipped += 1;
				continue;
			}
			const childPath = join(path, entry.name);
			if (entry.isDirectory()) {
				if (cfg.skipDirs.includes(entry.name)) {
					skipped += 1;
					continue;
				}
				if (depth + 1 <= cfg.maxDepth) pending.push({ path: childPath, depth: depth + 1 });
				continue;
			}
			if (!entry.isFile()) {
				skipped += 1;
				continue;
			}
			try {
				files.push(await scanFile(childPath, cfg));
			} catch {
				skipped += 1;
			}
			scanned += 1;
		}
	}
	return {
		dir: canonical,
		scanned: files.length,
		skipped,
		limitReached,
		files
	};
}

/**
 * Send a JSON response.
 * @param res - node http response.
 * @param status - HTTP status.
 * @param value - JSON-serializable body.
 */
function sendJson(res, status, value) {
	const body = JSON.stringify(value);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"content-length": Buffer.byteLength(body)
	});
	res.end(body);
}

/**
 * Read a JSON request body (bounded to 1 MiB).
 * @param req - node http request.
 * @returns parsed body.
 */
async function readJson(req) {
	let body = "";
	let total = 0;
	for await (const chunk of req) {
		total += chunk.length;
		if (total > 1048576) throw new Error("request body too large");
		body += chunk;
	}
	if (body === "") return {};
	return JSON.parse(body);
}

/**
 * Plugin body: register the scan route on the web server.
 * @param ctx - plugin context carrying webServer (and, in the web profile, workspaceRegistry).
 * @param config - validated plugin config.
 */
function apply(ctx, config) {
	const cfg = Config(config ?? {});
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: "/api/artifacts/scan",
		handler: async (req, res) => {
			if (req.method !== "POST") {
				sendJson(res, 405, { error: "method not allowed" });
				return;
			}
			let payload;
			try {
				payload = await readJson(req);
			} catch (error) {
				sendJson(res, 400, { error: `bad request: ${String(error?.message ?? error)}` });
				return;
			}
			const dir = typeof payload?.dir === "string" ? payload.dir.trim() : "";
			if (dir === "") {
				sendJson(res, 400, { error: "missing dir" });
				return;
			}
			try {
				const roots = cfg.scope === "any" ? [] : await workspaceRoots(ctx);
				const result = await scanWorkspace(dir, cfg, roots);
				sendJson(res, 200, result);
			} catch (error) {
				sendJson(res, Number(error?.status) > 0 ? error.status : 500, {
					error: String(error?.message ?? error)
				});
			}
		}
	}), "artifacts-panel: scan route");
}

export { apply, categorize, countLines, isBinary, scanFile, scanWorkspace, workspaceRoots };
