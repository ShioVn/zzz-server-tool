import type { ZonConfig, AvatarOverride, WeaponConfig, DiscEntry } from "$lib/types";
import { runControlCommand } from "$lib/server/server-manager";

export async function applyAllConfig(config: ZonConfig, uid: string, path: string | null = null): Promise<string[]> {
	const msgs: string[] = [];

	// 1. Avatar overrides
	for (const a of config.avatarOverrides) {
		const agentId = a.agentId ?? Number(a.id);
		try {
			await runControlCommand(path, "mod-avatar-meta", ["level", uid, String(agentId), String(a.level ?? 60)]);
			if (a.rank) await runControlCommand(path, "mod-avatar-meta", ["rank", uid, String(agentId), String(a.rank)]);
			if (a.talents) await runControlCommand(path, "mod-avatar-meta", ["talents", uid, String(agentId), String(a.talents)]);
			if (a.awakening) await runControlCommand(path, "mod-avatar-meta", ["awakening", uid, String(agentId), String(a.awakening)]);
			msgs.push(`Avatar ${agentId} OK`);
		} catch (e) {
			msgs.push(`Avatar ${agentId} FAIL: ${e}`);
		}
	}

	// 2. Weapons
	for (const w of config.configWeapons) {
		try {
			// console.log(`[applyConfig] Weapon ${w.id}`);
			await runControlCommand(path, "create-weapon", [
				uid, String(w.id), String(w.level ?? 60), "5", String(w.refine ?? 1),
			]);
			msgs.push(`Weapon ${w.id} OK`);
		} catch (e) {
			msgs.push(`Weapon ${w.id} FAIL: ${e}`);
		}
	}

	// 3. Discs
	for (const d of config.equipment) {
		try {
			// console.log(`[applyConfig] Disc ${d.id}`);
			const args: string[] = [
				uid, String(d.id), String(d.level ?? 15), String(d.star ?? 5),
				String(d.mainStat.statId), String(d.mainStat.value), String(d.mainStat.add ?? 0),
			];
			for (const s of d.subStats) {
				const rolls = (s.add ?? 0) + 1;
				args.push(String(s.statId), String(s.value), String(rolls));
			}
			await runControlCommand(path, "create-equip", args);
			msgs.push(`Disc ${d.id} OK`);
		} catch (e) {
			msgs.push(`Disc ${d.id} FAIL: ${e}`);
		}
	}

	// 4. Endgame zones
	if (config.shiyuZone) {
		try {
			// console.log(`[applyConfig] Shiyu Defense ${config.shiyuZone}`);
			await runControlCommand(path, "mod-hadal-entrance", ["hadal_zone_scheduled", uid, String(config.shiyuZone)]);
			msgs.push("Shiyu Defense OK");
		} catch (e) { msgs.push(`Shiyu FAIL: ${e}`); }
	}
	if (config.daZone) {
		try {
			// console.log(`[applyConfig] Deadly Assault ${config.daZone}`);
			await runControlCommand(path, "mod-hadal-entrance", ["boss_challenge_normal", uid, String(config.daZone)]);
			msgs.push("Deadly Assault OK");
		} catch (e) { msgs.push(`DA FAIL: ${e}`); }
	}
	if (config.daHardZone) {
		try {
			// console.log(`[applyConfig] DA Hard ${config.daHardZone}`);
			await runControlCommand(path, "mod-hadal-entrance", ["boss_challenge_hard", uid, String(config.daHardZone)]);
			msgs.push("Deadly Assault (Hard) OK");
		} catch (e) { msgs.push(`DA Hard FAIL: ${e}`); }
	}

	return msgs;
}
