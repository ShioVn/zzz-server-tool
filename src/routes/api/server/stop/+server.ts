import { json } from "@sveltejs/kit";
import { stopServerProcess } from "$lib/server/server-manager";

export async function POST() {
	try {
		await stopServerProcess();
		return json({ success: true, message: "Server stopped" });
	} catch (err) {
		return json({ success: false, message: err instanceof Error ? err.message : "Failed to stop server" }, { status: 500 });
	}
}
