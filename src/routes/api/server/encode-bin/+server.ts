import { json } from "@sveltejs/kit";
import { encodeBinFile } from "$lib/server/server-manager";

export async function POST({ request }) {
	try {
		const body = await request.json();
		const path = body?.path ?? null;
		encodeBinFile(path);
		return json({ success: true, message: "Bin encoded" });
	} catch (err) {
		return json({ success: false, message: err instanceof Error ? err.message : "Failed to encode bin" }, { status: 500 });
	}
}
