import { json } from "@sveltejs/kit";
import { execSync, spawn } from "child_process";
import { existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { startServerProcess, waitForPort } from "$lib/server/server-manager";

export async function POST({ request }) {
	try {
		const body = await request.json();
		const path = body?.path ?? resolve(process.cwd());

		// Run envrc.ps1 if it exists
		const envrcScript = resolve(path, "envrc.ps1");
		if (existsSync(envrcScript)) {
			execSync(`powershell -NoProfile -File "${envrcScript}"`, {
				cwd: path,
				stdio: "pipe",
				timeout: 60000,
			});
		}

		// Start the server
		await startServerProcess(path);

		return json({ success: true, message: "Server setup started" });
	} catch (err) {
		return json({ success: false, message: err instanceof Error ? err.message : "Failed to setup server" }, { status: 500 });
	}
}
