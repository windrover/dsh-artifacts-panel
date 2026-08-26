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
	let handler = null;
	const ctx = {
		webServer: {
			register(route) {
				handler = route.handler;
			}
		},
		effect(fn) {
			fn();
			return () => {};
		},
		...ctxExtra
	};
	apply(ctx, {});
	assert.ok(handler !== null, "route was registered");
	return handler;
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
	const handler = registerHarness();
	await writeFile(join(root, "x.ts"), "const a = 1;\nconst b = 2;\n");
	const { status, body } = await invoke(handler, makeReq("POST", { dir: root }));
	assert.equal(status, 200);
	assert.equal(body.files.length, 1);
	assert.equal(body.files[0].category, "code");
	assert.equal(body.files[0].lines, 2);
});

test("route: 404 for a missing directory", async () => {
	const handler = registerHarness();
	const { status, body } = await invoke(handler, makeReq("POST", { dir: join(root, "nope") }));
	assert.equal(status, 404);
	assert.match(body.error, /not found/);
});

test("route: 405 for a non-POST method", async () => {
	const handler = registerHarness();
	const { status } = await invoke(handler, makeReq("GET", {}));
	assert.equal(status, 405);
});

test("route: 400 when dir is missing", async () => {
	const handler = registerHarness();
	const { status } = await invoke(handler, makeReq("POST", {}));
	assert.equal(status, 400);
});

test("route: 403 when scanning outside workspaces under the default scope", async () => {
	const outside = await mkdtemp(join(tmpdir(), "dap-outside-"));
	try {
		const handler = registerHarness({
			workspaceRegistry: { list: () => [{ path: root }] }
		});
		const { status } = await invoke(handler, makeReq("POST", { dir: outside }));
		assert.equal(status, 403);
	} finally {
		await rm(outside, { recursive: true, force: true });
	}
});

test("route: 200 for any directory under scope any", async () => {
	const outside = await mkdtemp(join(tmpdir(), "dap-outside-"));
	try {
		let handler = null;
		const ctx = {
			webServer: {
				register(route) {
					handler = route.handler;
				}
			},
			effect(fn) {
				fn();
				return () => {};
			}
		};
		apply(ctx, { scope: "any" });
		const { status } = await invoke(handler, makeReq("POST", { dir: outside }));
		assert.equal(status, 200);
	} finally {
		await rm(outside, { recursive: true, force: true });
	}
});
