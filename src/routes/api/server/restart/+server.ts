import { json } from "@sveltejs/kit";
import { stopServerProcess, startServerProcess } from "$lib/server/server-manager";

export async function POST({ request }) {
	try {
		const body = await request.json();
		const path = body?.path ?? null;
		await stopServerProcess();
		await startServerProcess(path);
		return json({ success: true, message: "Server restarted" });
	} catch (err) {
		return json({ success: false, message: err instanceof Error ? err.message : "Failed to restart server" }, { status: 500 });
	}
}
