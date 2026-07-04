import { json } from "@sveltejs/kit";
import { existsSync } from "fs";
import { resolve } from "path";

export function GET() {
	// Check if remielle folder exists by looking for build.zig or .git
	const root = resolve(process.cwd());
	const hasBuildZig = existsSync(resolve(root, "build.zig"));
	const hasGit = existsSync(resolve(root, ".git"));
	const hasSrc = existsSync(resolve(root, "src"));

	return json({
		success: true,
		data: {
			detected: hasBuildZig || (hasGit && hasSrc),
			path: root,
		},
	});
}
