import { json, type RequestEvent } from "@sveltejs/kit";
import { stopServerProcess, startServerProcess } from "$lib/server/server-manager";

export async function POST({ request }: RequestEvent) {
	try {
		const body = await request.json();
		const path = body?.path ?? null;
		const port = body?.port ?? undefined;
		const basename = body?.basename ?? undefined;
		const binRel = body?.binRel ?? undefined;
		// Always stop existing server first, in case module state was lost
		await stopServerProcess({ port, basename, binRel });
		await startServerProcess(path, { port, basename, binRel });
		return json({ success: true, message: "Server started" });
	} catch (err) {
		return json({ success: false, message: err instanceof Error ? err.message : "Failed to start server" }, { status: 500 });
	}
}
