import { json } from "@sveltejs/kit";
import { isServerRunning, getServerPid, getServerLogs } from "$lib/server/server-manager";

export function GET() {
	return json({
		success: true,
		data: {
			running: isServerRunning(),
			pid: getServerPid(),
			logs: getServerLogs(),
		},
	});
}
