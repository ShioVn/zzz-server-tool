import { json } from "@sveltejs/kit";
import { waitForPort } from "$lib/server/server-manager";

export async function GET() {
	const ready = await waitForPort(12401, 15000);
	return json({
		success: true,
		data: { ready },
	});
}
