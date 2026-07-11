import { browser } from "$app/environment";
import { getState } from "$lib/stores/app.svelte";

let pollingInterval: ReturnType<typeof setInterval> | null = null;
let serverRunning = $state(false);
let serverPid = $state<number | null>(null);
let serverLogs = $state("");

async function fetchStatus() {
	try {
		const res = await fetch("/api/server/status");
		if (res.ok) {
			const data = await res.json();
			serverRunning = data.data?.running ?? false;
			serverPid = data.data?.pid ?? null;
			serverLogs = data.data?.logs ?? "";
		}
	} catch { /* ignore */ }
}

export function getServer() {
	return {
		get running() { return serverRunning; },
		set running(v: boolean) { serverRunning = v; },
		get pid() { return serverPid; },
		set pid(v: number | null) { serverPid = v; },
		get logs() { return serverLogs; },
		set logs(v: string) { serverLogs = v; },
		fetchStatus,
	};
}

export function startServerPolling() {
	if (!browser || pollingInterval) return;
	fetchStatus();
	pollingInterval = setInterval(fetchStatus, 8000);
}

export function stopServerPolling() {
	if (pollingInterval) {
		clearInterval(pollingInterval);
		pollingInterval = null;
	}
}

export async function runControlCommand(action: string, args: string[]) {
	const app = getState();
	// console.log(`[runControlCommand] action=${action}, path=${app.remiellePath}, args=`, args);
	const res = await fetch("/api/server/ctl", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ path: app.remiellePath, action, arguments: args }),
	});
	const data = await res.json();
	// console.log(`[runControlCommand] response:`, data);
	if (!data.success) {
		const errMsg = data.message || data.stderr || "ctl command failed";
		// console.error(`[runControlCommand-error] ${errMsg}`);
		throw new Error(errMsg);
	}
	return data;
}
