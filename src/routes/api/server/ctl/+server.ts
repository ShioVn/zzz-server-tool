import { json, type RequestEvent } from "@sveltejs/kit";
import { runControlCommand } from "$lib/server/server-manager";

export async function POST({ request }: RequestEvent) {
	try {
		const body = await request.json();
		const path = body?.path ?? null;
		const action = body?.action;
		const args = body?.arguments ?? [];

		// console.log(`[/api/server/ctl] action=${action}, path=${path}, args=`, args);

		if (!action) {
			return json({ success: false, message: "Missing action parameter" }, { status: 400 });
		}

		const result = await runControlCommand(path, action, args);
		// console.log(`[/api/server/ctl] result:`, result);
		return json(result);
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : "Failed to run control command";
		// console.error(`[/api/server/ctl] error:`, errMsg);
		return json(
			{
				success: false,
				message: errMsg,
			},
			{ status: 500 }
		);
	}
}
