/**
 * dsh-artifacts-panel — unit tests (node:test).
 *
 * Covers the host half's pure functions (categorize / countLines / isBinary),
 * the recursive scanner's boundary behavior (skipDirs / maxFiles / maxDepth /
 * scope 403 / missing-dir 404), the workspace-root resolution, and the HTTP
 * route behavior (405 / 400 / 200 / 403 / 404) through a stubbed ctx.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	Config,
	apply,
	categorize,
	countLines,
	isBinary,
	readArtifactFile,
	scanWorkspace,
	workspaceRoots
} from "../lib/index.js";

let root;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "dap-test-"));
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

test("categorize maps extensions to stable categories", () => {
	const cases = {
		code: ["js", "ts", "py", "go", "rs", "sh", "lua"],
		docs: ["md", "markdown", "txt", "pdf", "docx"],
		config: ["json", "yaml", "toml", "env", "ini"],
		data: ["csv", "tsv", "sqlite", "db", "parquet"],
		image: ["png", "jpg", "svg", "webp", "ico"],
		media: ["mp3", "wav", "mp4", "webm", "ogg"],
		web: ["css", "html", "vue", "svelte"],
		archive: ["zip", "tar", "gz", "7z", "zst"],
		other: ["xyz", "unknown", ""]
	};
	for (const [expected, exts] of Object.entries(cases)) {
		for (const ext of exts) assert.equal(categorize(ext), expected, `extension "${ext}"`);
	}
});

test("countLines counts newline-terminated and trailing-newline-less text", () => {
	assert.equal(countLines(""), 0);
	assert.equal(countLines("a"), 1);
	assert.equal(countLines("a\n"), 1);
	assert.equal(countLines("a\nb"), 2);
	assert.equal(countLines("a\nb\n"), 2);
	assert.equal(countLines("\n"), 1);
});

test("isBinary probes the first bytes for NUL and control characters", () => {
	assert.equal(isBinary(Buffer.from("hello world\n")), false);
	assert.equal(isBinary(Buffer.from("line1\nline2\tline3\r\n")), false);
	assert.equal(isBinary(Buffer.from([0x00, 0x01, 0x02])), true);
	assert.equal(isBinary(Buffer.from("abc\x07def")), true);
	assert.equal(isBinary(Buffer.from("abc\x7f")), true);
});

test("scanWorkspace returns one metadata row per file", async () => {
	const aContent = "const x = 1;\nconst y = 2;\n";
	await writeFile(join(root, "a.js"), aContent);
	await writeFile(join(root, "b.md"), "# hi\n");
	await mkdir(join(root, "sub"));
	await writeFile(join(root, "sub", "c.json"), '{"k":1}\n');
	const result = await scanWorkspace(root, Config({}), []);
	assert.equal(result.limitReached, false);
	assert.deepEqual(result.files.map((file) => file.name).sort(), ["a.js", "b.md", "c.json"]);
	assert.deepEqual(result.dirs, [join(await realpath(root), "sub")]);
	const byName = Object.fromEntries(result.files.map((file) => [file.name, file]));
	assert.equal(byName["a.js"].category, "code");
	assert.equal(byName["a.js"].lines, 2);
	assert.equal(byName["a.js"].size, Buffer.byteLength(aContent));
	assert.ok(byName["a.js"].path.startsWith(await realpath(root)));
	assert.equal(byName["b.md"].category, "docs");
	assert.equal(byName["c.json"].category, "config");
});

test("scanWorkspace skips configured directories", async () => {
	await writeFile(join(root, "keep.txt"), "keep");
	await mkdir(join(root, "node_modules"));
	await writeFile(join(root, "node_modules", "skip.js"), "x");
	await mkdir(join(root, ".git"));
	await writeFile(join(root, ".git", "config"), "x");
	const result = await scanWorkspace(root, Config({}), []);
	assert.deepEqual(result.files.map((file) => file.name), ["keep.txt"]);
	assert.deepEqual(result.dirs, []);
});

test("scanWorkspace reports only immediate, non-skipped subdirectories", async () => {
	await mkdir(join(root, "sub1"));
	await mkdir(join(root, "sub2"));
	await mkdir(join(root, "sub2", "deep"));
	await mkdir(join(root, "node_modules"));
	await mkdir(join(root, ".git"));
	await writeFile(join(root, "root.txt"), "x");
	const result = await scanWorkspace(root, Config({}), []);
	const base = await realpath(root);
	assert.deepEqual([...result.dirs].sort(), [join(base, "sub1"), join(base, "sub2")].sort());
});

test("scanWorkspace enforces maxFiles and flags limitReached", async () => {
	for (let index = 0; index < 5; index += 1) await writeFile(join(root, `f${index}.txt`), "x");
	const result = await scanWorkspace(root, Config({ maxFiles: 3 }), []);
	assert.equal(result.files.length, 3);
	assert.equal(result.limitReached, true);
});

test("scanWorkspace respects maxDepth", async () => {
	await writeFile(join(root, "top.txt"), "x");
	await mkdir(join(root, "d1"));
	await writeFile(join(root, "d1", "mid.txt"), "x");
	await mkdir(join(root, "d1", "d2"));
	await writeFile(join(root, "d1", "d2", "deep.txt"), "x");
	const result = await scanWorkspace(root, Config({ maxDepth: 1 }), []);
	assert.deepEqual(result.files.map((file) => file.name).sort(), ["mid.txt", "top.txt"]);
});

test("scanWorkspace rejects a missing directory with 404", async () => {
	await assert.rejects(scanWorkspace(join(root, "does-not-exist"), Config({}), []), (error) => error.status === 404);
});

test("scanWorkspace rejects a directory outside registered workspaces with 403", async () => {
	const outside = await mkdtemp(join(tmpdir(), "dap-outside-"));
	try {
		const roots = [await realpath(root)];
		await assert.rejects(scanWorkspace(outside, Config({}), roots), (error) => error.status === 403);
	} finally {
		await rm(outside, { recursive: true, force: true });
	}
});

test("workspaceRoots resolves registered workspace paths canonically", async () => {
	const ctx = { workspaceRegistry: { list: () => [{ path: root }] } };
	assert.deepEqual(await workspaceRoots(ctx), [await realpath(root)]);
});

test("workspaceRoots returns [] without a registry", async () => {
	assert.deepEqual(await workspaceRoots({}), []);
});

/* --- HTTP route behavior through a stubbed ctx --- */

function makeReq(method, body) {
	return {
		method,
		[Symbol.asyncIterator]: async function* () {
			yield Buffer.from(body === void 0 ? "" : JSON.stringify(body));
		}
	};
}

function makeRes() {
	const calls = [];
	return {
		calls,
		writeHead(status, headers) {
			calls.push(["head", status, headers]);
		},
		end(payload) {
			calls.push(["end", payload]);
		}
	};
}

function registerHarness(ctxExtra) {
	const routes = new Map();
	const tools = [];
	const ctx = {
		webServer: {
			register(route) {
				routes.set(route.path, route.handler);
			}
		},
		tools: {
			register(definition) {
				tools.push(definition);
				return () => {};
			}
		},
		effect(fn) {
			fn();
			return () => {};
		},
		...ctxExtra
	};
	apply(ctx, {});
	assert.ok(routes.has("/api/artifacts/scan"), "scan route was registered");
	assert.ok(routes.has("/api/artifacts/read"), "read route was registered");
	assert.equal(tools[0]?.name, "artifacts_list", "agent tool was registered");
	return { routes, tools };
}

async function invoke(handler, req) {
	const res = makeRes();
	await handler(req, res);
	const head = res.calls.find(([kind]) => kind === "head");
	const end = res.calls.find(([kind]) => kind === "end");
	return {
		status: head === void 0 ? null : head[1],
		body: end === void 0 ? null : JSON.parse(end[1])
	};
}

test("route: 200 with a scan result for an existing directory", async () => {
	const handler = registerHarness().routes.get("/api/artifacts/scan");
	await writeFile(join(root, "x.ts"), "const a = 1;\nconst b = 2;\n");
	const { status, body } = await invoke(handler, makeReq("POST", { dir: root }));
	assert.equal(status, 200);
	assert.equal(body.files.length, 1);
	assert.equal(body.files[0].category, "code");
	assert.equal(body.files[0].lines, 2);
});

test("route: 404 for a missing directory", async () => {
	const handler = registerHarness().routes.get("/api/artifacts/scan");
	const { status, body } = await invoke(handler, makeReq("POST", { dir: join(root, "nope") }));
	assert.equal(status, 404);
	assert.match(body.error, /not found/);
});

test("route: 405 for a non-POST method", async () => {
	const handler = registerHarness().routes.get("/api/artifacts/scan");
	const { status } = await invoke(handler, makeReq("GET", {}));
	assert.equal(status, 405);
});

test("route: 400 when dir is missing", async () => {
	const handler = registerHarness().routes.get("/api/artifacts/scan");
	const { status } = await invoke(handler, makeReq("POST", {}));
	assert.equal(status, 400);
});

test("route: 403 when scanning outside workspaces under the default scope", async () => {
	const outside = await mkdtemp(join(tmpdir(), "dap-outside-"));
	try {
		const handler = registerHarness({
			workspaceRegistry: { list: () => [{ path: root }] }
		}).routes.get("/api/artifacts/scan");
		const { status } = await invoke(handler, makeReq("POST", { dir: outside }));
		assert.equal(status, 403);
	} finally {
		await rm(outside, { recursive: true, force: true });
	}
});

test("route: 200 for any directory under scope any", async () => {
	const outside = await mkdtemp(join(tmpdir(), "dap-outside-"));
	try {
		const routes = new Map();
		const ctx = {
			webServer: {
				register(route) {
					routes.set(route.path, route.handler);
				}
			},
			tools: {
				register() {
					return () => {};
				}
			},
			effect(fn) {
				fn();
				return () => {};
			}
		};
		apply(ctx, { scope: "any" });
		const handler = routes.get("/api/artifacts/scan");
		const { status } = await invoke(handler, makeReq("POST", { dir: outside }));
		assert.equal(status, 200);
	} finally {
		await rm(outside, { recursive: true, force: true });
	}
});

/* --- read route & readArtifactFile --- */

test("readArtifactFile returns bounded text for a text file", async () => {
	const content = "line1\nline2\n";
	const file = join(root, "note.txt");
	await writeFile(file, content);
	const result = await readArtifactFile(file, Config({}), []);
	assert.equal(result.binary, false);
	assert.equal(result.truncated, false);
	assert.equal(result.text, content);
	assert.equal(result.name, "note.txt");
	assert.ok(result.path.endsWith("note.txt"));
});

test("readArtifactFile flags binary files without decoding", async () => {
	const file = join(root, "img.bin");
	await writeFile(file, Buffer.from([0x00, 0x01, 0x89, 0x50, 0x4e, 0x47]));
	const result = await readArtifactFile(file, Config({}), []);
	assert.equal(result.binary, true);
	assert.equal(result.text, null);
});

test("readArtifactFile truncates oversized text and marks truncated", async () => {
	const file = join(root, "big.txt");
	await writeFile(file, "0123456789abcdef");
	const result = await readArtifactFile(file, Config({ maxPreviewBytes: 6 }), []);
	assert.equal(result.truncated, true);
	assert.equal(result.text.length, 6);
	assert.equal(result.text, "012345");
});

test("readArtifactFile rejects missing files with 404", async () => {
	await assert.rejects(readArtifactFile(join(root, "nope.txt"), Config({}), []), (error) => error.status === 404);
});

test("readArtifactFile rejects directories with 400", async () => {
	await mkdir(join(root, "sub"));
	await assert.rejects(readArtifactFile(join(root, "sub"), Config({}), []), (error) => error.status === 400);
});

test("readArtifactFile rejects paths outside workspaces with 403", async () => {
	const outside = await mkdtemp(join(tmpdir(), "dap-outside-"));
	try {
		const file = join(outside, "x.txt");
		await writeFile(file, "x");
		const roots = [await realpath(root)];
		await assert.rejects(readArtifactFile(file, Config({}), roots), (error) => error.status === 403);
	} finally {
		await rm(outside, { recursive: true, force: true });
	}
});

test("route read: 200 with file content", async () => {
	const handler = registerHarness().routes.get("/api/artifacts/read");
	const file = join(root, "hello.txt");
	await writeFile(file, "hello world");
	const { status, body } = await invoke(handler, { method: "GET", url: `/api/artifacts/read?path=${encodeURIComponent(file)}` });
	assert.equal(status, 200);
	assert.equal(body.text, "hello world");
	assert.equal(body.binary, false);
});

test("route read: 400 when path is missing", async () => {
	const handler = registerHarness().routes.get("/api/artifacts/read");
	const { status } = await invoke(handler, { method: "GET", url: "/api/artifacts/read" });
	assert.equal(status, 400);
});

test("route read: 405 for a non-GET method", async () => {
	const handler = registerHarness().routes.get("/api/artifacts/read");
	const { status } = await invoke(handler, makeReq("POST", { dir: root }));
	assert.equal(status, 405);
});

test("route read: 404 for a missing file", async () => {
	const handler = registerHarness().routes.get("/api/artifacts/read");
	const { status } = await invoke(handler, { method: "GET", url: `/api/artifacts/read?path=${encodeURIComponent(join(root, "nope.txt"))}` });
	assert.equal(status, 404);
});

test("route read: 403 outside workspaces under the default scope", async () => {
	const outside = await mkdtemp(join(tmpdir(), "dap-outside-"));
	try {
		const file = join(outside, "x.txt");
		await writeFile(file, "x");
		const handler = registerHarness({
			workspaceRegistry: { list: () => [{ path: root }] }
		}).routes.get("/api/artifacts/read");
		const { status } = await invoke(handler, { method: "GET", url: `/api/artifacts/read?path=${encodeURIComponent(file)}` });
		assert.equal(status, 403);
	} finally {
		await rm(outside, { recursive: true, force: true });
	}
});

/* --- artifacts_list agent tool --- */

test("tool: artifacts_list registers with expected name and parameters", () => {
	const { tools } = registerHarness();
	const tool = tools[0];
	assert.equal(tool.name, "artifacts_list");
	const properties = tool.parameters.properties;
	assert.equal(properties.dir.type, "string");
	assert.equal(properties.pattern.type, "string");
	assert.equal(properties.maxFiles.type, "integer");
});

test("tool: execute scans a directory and summarizes by type", async () => {
	const { tools } = registerHarness();
	await writeFile(join(root, "a.js"), "const a = 1;\n");
	await writeFile(join(root, "b.md"), "# hi\n");
	const value = await tools[0].execute({ dir: root }, { agent: { session: { header: { cwd: root } } } });
	assert.equal(value.dir, await realpath(root));
	assert.equal(value.scanned, 2);
	assert.equal(value.totalSize, Buffer.byteLength("const a = 1;\n") + Buffer.byteLength("# hi\n"));
	assert.equal(value.byType.code, 1);
	assert.equal(value.byType.docs, 1);
	assert.equal(value.files.length, 2);
});

test("tool: execute defaults to the session cwd and applies the pattern filter", async () => {
	const { tools } = registerHarness();
	await writeFile(join(root, "a.js"), "x");
	await writeFile(join(root, "b.md"), "x");
	const value = await tools[0].execute({ pattern: "js" }, { agent: { session: { header: { cwd: root } } } });
	assert.equal(value.scanned, 1);
	assert.equal(value.files[0].name, "a.js");
});

test("tool: execute clamps maxFiles and flags limitReached", async () => {
	const { tools } = registerHarness();
	for (let index = 0; index < 5; index += 1) await writeFile(join(root, `f${index}.txt`), "x");
	const value = await tools[0].execute({ dir: root, maxFiles: 3 }, { agent: { session: { header: { cwd: root } } } });
	assert.equal(value.scanned, 3);
	assert.equal(value.limitReached, true);
});

test("tool: execute rejects without a dir and without a session cwd", async () => {
	const { tools } = registerHarness();
	await assert.rejects(tools[0].execute({}, {}), /no dir given/);
});

test("tool: execute enforces the workspace scope", async () => {
	const outside = await mkdtemp(join(tmpdir(), "dap-outside-"));
	try {
		const { tools } = registerHarness({
			workspaceRegistry: { list: () => [{ path: root }] }
		});
		await assert.rejects(tools[0].execute({ dir: outside }, { agent: { session: { header: { cwd: root } } } }), (error) => error.status === 403);
	} finally {
		await rm(outside, { recursive: true, force: true });
	}
});
