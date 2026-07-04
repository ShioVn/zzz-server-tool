import { json } from "@sveltejs/kit";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

export async function POST() {
	try {
		const root = resolve(process.cwd());
		// Check if already cloned
		if (existsSync(resolve(root, "build.zig"))) {
			return json({ success: true, message: "Repository already exists", data: { path: root } });
		}
		execSync("git clone https://github.com/Migan-Services/Remielle.git .", {
			cwd: root,
			stdio: "pipe",
			timeout: 300000, // 5min
		});
		return json({ success: true, message: "Repository cloned successfully", data: { path: root } });
	} catch (err) {
		return json({ success: false, message: err instanceof Error ? err.message : "Failed to clone repository" }, { status: 500 });
	}
}
