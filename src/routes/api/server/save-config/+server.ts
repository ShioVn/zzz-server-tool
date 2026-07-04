import { json } from "@sveltejs/kit";
import { saveConfigFile } from "$lib/server/server-manager";

export async function POST({ request }) {
	try {
		const body = await request.json();
		const path = body?.path ?? null;
		const text = body?.text ?? "";
		if (!text) {
			return json({ success: false, message: "No config text provided" }, { status: 400 });
		}
		saveConfigFile(path, text);
		return json({ success: true, message: "Config saved" });
	} catch (err) {
		return json({ success: false, message: err instanceof Error ? err.message : "Failed to save config" }, { status: 500 });
	}
}
