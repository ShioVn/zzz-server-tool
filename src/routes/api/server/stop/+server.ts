import { json, type RequestEvent } from "@sveltejs/kit";
import { stopServerProcess } from "$lib/server/server-manager";

export async function POST({ request }: RequestEvent) {
	try {
		const body = await request.json();
		const port = body?.port ?? undefined;
		const basename = body?.basename ?? undefined;
		const binRel = body?.binRel ?? undefined;
		await stopServerProcess({ port, basename, binRel });
		return json({ success: true, message: "Server stopped" });
	} catch (err) {
		return json({ success: false, message: err instanceof Error ? err.message : "Failed to stop server" }, { status: 500 });
	}
}
