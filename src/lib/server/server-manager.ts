import { writeFileSync, unlinkSync, existsSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { resolve, join } from "path";
import os from "os";

// === Server Management Utilities ===
// Strategy: Use a PowerShell helper to start cmd.exe and capture its PID
// at process creation time. Store PID in a file for later kill by PID tree.
// Fallback: kill any process listening on port 20501.

const SERVER_PORT = 20501;
const SERVER_PID_PATH = join(os.tmpdir(), "zzzsrv_pid.txt");
const SERVER_BAT_PATH = join(os.tmpdir(), "zzzsrv.bat");

// Paths relative to server root directory
const CONFIG_ZON_REL = join("gamesv", "config.zon");
const BIN_REL = join("Persistent", "LocalStorage", "USD_666.bin");

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
export async function startServerProcess(path: string | null): Promise<void> {
	await stopServerProcess();

	const cwd = path || getRepoRoot() || process.cwd();
	appendLog(`Starting server in: ${cwd}`);

	return new Promise((resolve) => {
		// ── Write batch file ──
		const batContent =
			`@echo off\r\n` +
			`title zzzsrv\r\n` +
			`cd /d "${cwd}"\r\n` +
			`echo Starting ZZZ Server in ${cwd}...\r\n` +
			`echo.\r\n` +
			`zig build serve-all\r\n` +
			`if errorlevel 1 echo. && pause\r\n`;

		writeFileSync(SERVER_BAT_PATH, batContent, "utf-8");
		appendLog(`Batch file ready: ${SERVER_BAT_PATH}`);

		// ── Write PowerShell helper that starts cmd.exe + saves PID ──
		const psScriptPath = join(os.tmpdir(), "zzzsrv_start.ps1");
		const psContent =
			`$p = Start-Process -FilePath "cmd.exe" -ArgumentList @('/k','${SERVER_BAT_PATH.replace(/\\/g, "\\\\")}') -PassThru -WindowStyle Normal\r\n` +
			`$p.Id | Out-File -FilePath "${SERVER_PID_PATH.replace(/\\/g, "\\\\")}" -Encoding ascii\r\n`;
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
				execSync(
					`start "zzzsrv" cmd /k "${SERVER_BAT_PATH}"`,
					{ stdio: "pipe", timeout: 5000 }
				);
			} catch {}
			setTimeout(() => resolve(), 2000);
		}
	});
}

/**
 * Stop the server:
 * 1. Read PID from file, kill the cmd.exe process tree → closes window + zig
 * 2. Fallback: kill any orphan on port 20501
 */
export async function stopServerProcess(): Promise<void> {
	// ── Step 1: Kill by PID file (closes terminal window) ──
	let killed = false;
	if (existsSync(SERVER_PID_PATH)) {
		const pidStr = readFileSync(SERVER_PID_PATH, "utf-8").trim();
		const pid = parseInt(pidStr, 10);
		if (!isNaN(pid) && pid > 0) {
			appendLog(`Killing cmd.exe PID ${pid} from PID file...`);
			if (killProcessTree(pid)) killed = true;
		}
		try { unlinkSync(SERVER_PID_PATH); } catch {}
	} else {
		appendLog("No PID file found — searching for cmd.exe by port...");
	}

	// ── Step 2: Kill anything on port 20501 (orphans) ──
	killAllOnPort(SERVER_PORT);

	// ── Cleanup PID file ──
	try { unlinkSync(SERVER_PID_PATH); } catch {}

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
 * Encode config.zon → USD_666.bin directly using TS encoder.
 * Call this AFTER server has fully started, so zig build doesn't overwrite it.
 */
export function encodeBinFile(path: string | null): boolean {
	const cwd = path || process.cwd();
	const configPath = join(cwd, CONFIG_ZON_REL);
	const binPath = join(cwd, BIN_REL);

	if (!existsSync(configPath)) {
		appendLog("config.zon not found — cannot encode");
		return false;
	}

	try {
		const { encodeConfigFileSync } = require("./encoder.js") as typeof import("./encoder");
		encodeConfigFileSync(configPath, binPath);
		appendLog("Encoded USD_666.bin from config.zon (TS encoder)");
		return true;
	} catch (e) {
		appendLog(`Encoder failed: ${e}`);
		return false;
	}
}
