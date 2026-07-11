
import { writeFileSync, unlinkSync, existsSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { resolve, join, basename } from "path";
import os from "os";
import {
	SERVER_PORT as CFG_SERVER_PORT,
	SERVER_PID_FILENAME,
	SERVER_BAT_FILENAME,
	SERVER_BASENAME,
	BIN_REL,
	SERVER_START_SCRIPT,
} from "$lib/config";

// === Server Management Utilities ===
// Strategy: Use a PowerShell helper to start cmd.exe and capture its PID
// at process creation time. Store PID in a file for later kill by PID tree.
// Fallback: kill any process listening on configured server port.

const SERVER_PORT = CFG_SERVER_PORT;
const SERVER_PID_PATH = join(os.tmpdir(), SERVER_PID_FILENAME);

// Paths relative to server root directory
const CONFIG_ZON_REL = join("gamesv", "config.zon");

let serverLogs: string[] = [];

function appendLog(msg: string) {
	serverLogs.push(`[${new Date().toISOString()}] ${msg}`);
	if (serverLogs.length > 500) serverLogs.splice(0, 100);
}

export function getServerLogs(): string {
	return serverLogs.join("\n");
}

export function getServerPid(): number | null {
	if (!existsSync(SERVER_PID_PATH)) return null;
	try {
		const pid = parseInt(readFileSync(SERVER_PID_PATH, "utf-8").trim(), 10);
		return isNaN(pid) ? null : pid;
	} catch {
		return null;
	}
}

// ─────── helpers ───────

/** Check if a PID is still alive. */
function isPidAlive(pid: number): boolean {
	try {
		const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
			encoding: "utf8", stdio: "pipe", timeout: 3000,
		});
		return out.trim().length > 0;
	} catch {
		return false;
	}
}

/** Check if any process is listening on SERVER_PORT. */
function isPortListening(port: number): boolean {
	try {
		const out = execSync(
			`netstat -ano | findstr :${port}`,
			{ encoding: "utf8", stdio: "pipe", timeout: 3000 }
		);
		return out.trim().split("\n").some(l => l.includes("LISTENING"));
	} catch {
		return false;
	}
}

/** Find PIDs listening on a given port. */
function findPidsByPort(port: number): number[] {
	try {
		const out = execSync(
			`netstat -ano | findstr :${port}`,
			{ encoding: "utf8", stdio: "pipe", timeout: 3000 }
		);
		return out.trim().split("\n")
			.filter(l => l.includes("LISTENING"))
			.map(l => {
				const parts = l.trim().split(/\s+/);
				return parseInt(parts[parts.length - 1], 10);
			})
			.filter(p => !isNaN(p));
	} catch {
		return [];
	}
}

/** Kill a PID and its entire process tree. */
function killProcessTree(pid: number): boolean {
	try {
		execSync(`taskkill /T /F /PID ${pid}`, { stdio: "ignore", timeout: 3000 });
		appendLog(`Killed process tree for PID ${pid}`);
		return true;
	} catch {
		return false;
	}
}

/** Kill ALL processes listening on a port (fallback cleanup). */
function killAllOnPort(port: number): number {
	const pids = findPidsByPort(port);
	let count = 0;
	for (const pid of pids) {
		if (killProcessTree(pid)) count++;
	}
	if (count > 0) appendLog(`Killed ${count} process(es) on port ${port} (fallback)`);
	return count;
}

// ─────── public API ───────

export function getRepoRoot(): string | null {
	for (const dir of [process.cwd(), resolve(process.cwd(), ".."), resolve(process.cwd(), "../..")]) {
		if (existsSync(join(dir, "build.zig"))) return dir;
		if (existsSync(join(dir, ".git"))) return dir;
	}
	return null;
}

export function isServerRunning(): boolean {
	// Validate stored PID
	const pid = getServerPid();
	if (pid !== null && !isPidAlive(pid)) {
		try { unlinkSync(SERVER_PID_PATH); } catch {}
	}
	return isPortListening(SERVER_PORT);
}

export async function waitForPort(port: number, timeoutMs: number = 30000): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (isPortListening(port)) return true;
		await new Promise((r) => setTimeout(r, 500));
	}
	return false;
}

/**
 * Start the server in a new visible cmd window.
 * Uses PowerShell Start-Process with -PassThru to capture the cmd.exe PID.
 */
export async function startServerProcess(path: string | null, opts?: { port?: number; basename?: string; pidFilename?: string; batFilename?: string; binRel?: string }): Promise<void> {
	await stopServerProcess(opts);

	const cwd = path || getRepoRoot() || process.cwd();
	appendLog(`Starting server in: ${cwd}`);

	return new Promise((resolve) => {
		// ── Write batch file ──
		const batContent =
			`@echo off\r\n` +
			`title ${SERVER_BASENAME}\r\n` +
			`cd /d "${cwd}"\r\n` +
			`echo Starting ZZZ Server in ${cwd}...\r\n` +
			`echo.\r\n` +
			`zig build serve-all\r\n` +
			`if errorlevel 1 echo. && pause\r\n`;

		// compute paths using overrides if provided
		const pidFilename = opts?.pidFilename ?? SERVER_PID_FILENAME;
		const batFilename = opts?.batFilename ?? SERVER_BAT_FILENAME;
		const serverBasename = opts?.basename ?? SERVER_BASENAME;
		const batPath = join(os.tmpdir(), batFilename);
		writeFileSync(batPath, batContent, "utf-8");
		appendLog(`Batch file ready: ${batPath}`);

		// ── Write PowerShell helper that starts cmd.exe + saves PID ──
		const psScriptPath = join(os.tmpdir(), opts?.pidFilename ? `${serverBasename}_start.ps1` : SERVER_START_SCRIPT);
		const psContent =
			`$p = Start-Process -FilePath "cmd.exe" -ArgumentList @('/k','${batPath.replace(/\\/g, "\\\\")}') -PassThru -WindowStyle Normal\r\n` +
			`$p.Id | Out-File -FilePath "${join(os.tmpdir(), pidFilename).replace(/\\/g, "\\\\")}" -Encoding ascii\r\n`;
		writeFileSync(psScriptPath, psContent, "utf-8");

		try {
			execSync(
				`powershell -NoProfile -ExecutionPolicy Bypass -File "${psScriptPath}"`,
				{ stdio: "pipe", timeout: 10000 }
			);

			// Read the PID file
			setTimeout(() => {
				if (existsSync(SERVER_PID_PATH)) {
					const pidStr = readFileSync(SERVER_PID_PATH, "utf-8").trim();
					const pid = parseInt(pidStr, 10);
					if (!isNaN(pid) && pid > 0) {
						appendLog(`Captured cmd.exe PID: ${pid} (via PID file)`);
					} else {
						appendLog(`Invalid PID from file: "${pidStr}"`);
					}
				} else {
					appendLog("PID file not found — will use port fallback for stop");
				}
				resolve();
			}, 1000);
		} catch (e) {
			appendLog(`PowerShell start failed: ${e}`);
			// Fallback to `start` command
			try {
				execSync(`start "${serverBasename}" cmd /k "${batPath}"`, { stdio: "pipe", timeout: 5000 });
			} catch {}
			setTimeout(() => resolve(), 2000);
		}
	});
}

/**
 * Stop the server:
 * 1. Read PID from file, kill the cmd.exe process tree → closes window + zig
 * 2. Fallback: kill any orphan on configured server port
 */
export async function stopServerProcess(opts?: { port?: number; basename?: string; pidFilename?: string; batFilename?: string; binRel?: string }): Promise<void> {
	// ── Step 1: Kill by PID file (closes terminal window) ──
	let killed = false;
	const pidFilename = opts?.pidFilename ?? SERVER_PID_FILENAME;
	const pidPath = join(os.tmpdir(), pidFilename);
	if (existsSync(pidPath)) {
		const pidStr = readFileSync(pidPath, "utf-8").trim();
		const pid = parseInt(pidStr, 10);
		if (!isNaN(pid) && pid > 0) {
			appendLog(`Killing cmd.exe PID ${pid} from PID file...`);
			if (killProcessTree(pid)) killed = true;
		}
		try { unlinkSync(pidPath); } catch {}
	} else {
		appendLog("No PID file found — searching for cmd.exe by port...");
	}

	// ── Step 2: Kill anything on configured port (orphans) ──
	const port = opts?.port ?? SERVER_PORT;
	killAllOnPort(port);

	// ── Cleanup PID file ──
	try { unlinkSync(pidPath); } catch {}

	appendLog("Server stopped");
}

/**
 * Save config.zon only. Server needs to be restarted to pick up changes.
 */
export function saveConfigFile(path: string | null, text: string): void {
	const cwd = path || process.cwd();
	const configPath = join(cwd, CONFIG_ZON_REL);
	writeFileSync(configPath, text, "utf-8");
	appendLog(`Saved config.zon to ${configPath}`);
}

/**
 * Encode config.zon → configured player bin (BIN_REL) using TS encoder.
 * Call this AFTER server has fully started, so zig build doesn't overwrite it.
 */
export function encodeBinFile(path: string | null, opts?: { binRel?: string }): boolean {
	const cwd = path || process.cwd();
	const configPath = join(cwd, CONFIG_ZON_REL);
	const binRel = opts?.binRel ?? BIN_REL;
	const sep = require("path").sep;
	const binPath = join(cwd, binRel.replace(/\//g, sep));

	if (!existsSync(configPath)) {
		appendLog("config.zon not found — cannot encode");
		return false;
	}

	try {
		// Dynamic require — encoder.ts was compiled to encoder.js at build time
		const encoderPath = join(__dirname, "encoder.js");
		if (!existsSync(encoderPath)) {
			appendLog("encoder.js not found — skipping encode");
			return false;
		}
		const { encodeConfigFileSync } = require(encoderPath) as any;
		encodeConfigFileSync(configPath, binPath);
		appendLog(`Encoded ${basename(binRel)} from config.zon (TS encoder)`);
		return true;
	} catch (e) {
		appendLog(`Encoder failed: ${e}`);
		return false;
	}
}

function getCtlBinary(cwd) {
	var candidates = [
		join(cwd, 'zig-out', 'bin', 'rmctl.exe'),
		join(cwd, 'zig-out', 'bin', 'rmctl'),
	];
	for (var _i = 0; _i < candidates.length; _i++) {
		if (existsSync(candidates[_i])) return candidates[_i];
	}
	return null;
}

export function runControlCommand(path, action, args) {
	const cwd = path || getRepoRoot() || process.cwd();
	const escapedArgs = [action].concat(args).map(function (arg) {
		if (/^[A-Za-z0-9._:\/\\-]+$/.test(arg)) return arg;
		return '"' + arg.replace(/(["\\$`])/g, '\\$1') + '"';
	});
	const binary = getCtlBinary(cwd);
	const cmd = binary
		? '"' + binary + '" ' + escapedArgs.join(' ')
		: 'zig build ctl -- ' + escapedArgs.join(' ');
	console.log('[server-manager] cmd="' + cmd + '" cwd="' + cwd + '"');
	appendLog('Running: ' + cmd + ' in ' + cwd);
	try {
		const out = execSync(cmd, { cwd, encoding: "utf8", timeout: 20000 });
		appendLog('Success: ' + out.trim());
		return { success: true, stdout: out.trim() };
	} catch (e) {
		const msg = e && e.stderr ? e.stderr.toString() : e && e.stdout ? e.stdout.toString() : String(e);
		appendLog('ctl command failed: ' + msg);
		throw new Error(msg);
	}
}
