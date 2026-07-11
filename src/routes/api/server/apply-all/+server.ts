import { json } from "@sveltejs/kit";
import type { ZonConfig } from "$lib/types";
import { applyAllConfig } from "$lib/server/apply-config";
import { DEFAULT_PLAYER_UID } from "$lib/config";

export async function POST({ request }: { request: Request }) {
	try {
		const body = await request.json();
		const config = body.config as ZonConfig;
		const uid = String(body.uid ?? DEFAULT_PLAYER_UID).trim() || DEFAULT_PLAYER_UID;
		const path = body.path ?? null;
		// console.log(`[apply-all] uid=${uid}, path=${path}, avatars=${config.avatarOverrides.length}, weapons=${config.configWeapons.length}, discs=${config.equipment.length}`);
		const msgs = await applyAllConfig(config, uid, path);
		// console.log(`[apply-all] results:`, msgs);
		return json({ success: true, messages: msgs });
	} catch (e) {
		const errMsg = String(e);
		// console.error(`[apply-all] error:`, errMsg);
		return json({ success: false, message: errMsg }, { status: 500 });
	}
}
