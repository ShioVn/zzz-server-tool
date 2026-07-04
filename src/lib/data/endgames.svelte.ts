import { getShiyu, getBosses, getSimul, getShiyuDetail, getBossDetail, getSimulDetail, getMonsters, extractBossIcons } from "$lib/api/zzz-api";
import type { Endgame } from "$lib/types";

let _endgames = $state<Endgame[]>([]);
let _loading = $state(true);
let _error = $state<string | null>(null);

function computeStatus(begin?: string, end?: string): string {
	if (!begin && !end) return "UNKNOWN";
	const now = new Date();
	if (begin) {
		const start = new Date(begin);
		if (now < start) return "UPCOMING";
	}
	if (end) {
		const endDate = new Date(end);
		if (now > endDate) return "ENDED";
	}
	return "ACTIVE";
}

function shiyuSubType(sort: number, en: string): string {
	if (sort === 1) return "Critical Node";
	if (sort === 2) return "Stable Node";
	if (sort === 3) return "Disputed Node";
	if (sort === 4) return "Ambush Node";
	return en || "Unknown";
}

async function init() {
	try {
			const [shiyuData, bossData, simulData, monsters] = await Promise.all([
			getShiyu(),
			getBosses(),
			getSimul(),
			getMonsters(),
		]);

		const results: Endgame[] = [];

		// Helper: fetch detail and extract boss icons
		async function fetchBossIcons(id: number, type: "shiyu" | "boss" | "simul"): Promise<string[]> {
			try {
				const detail = await (type === "shiyu"
					? getShiyuDetail(id)
					: type === "boss"
						? getBossDetail(id)
						: getSimulDetail(id));
				return extractBossIcons(detail, monsters);
			} catch {
				return [];
			}
		}

		// --- Shiyu Defense (shiyu.json) ---
		const shiyuPromises: Promise<Endgame>[] = [];
		for (const [id, e] of Object.entries(shiyuData)) {
			const entry = e as any;
			const subType = shiyuSubType(entry.sort, entry.en);
			const status = computeStatus(entry.begin, entry.end);
			const numId = Number(id);
			shiyuPromises.push(
				fetchBossIcons(numId, "shiyu").then((bossIcons) => ({
					id: numId,
					name: `Shiyu Defense #${id}`,
					type: "Shiyu Defense",
					subType,
					status,
					hardMode: false,
					description: entry.begin && entry.end ? `${entry.begin} ~ ${entry.end}` : "",
					zoneId: numId,
					layerCount: status === "ACTIVE" || status === "UPCOMING" ? 8 : 7,
					begin: entry.begin,
					end: entry.end,
					bossIcons,
				}))
			);
		}

		// --- Deadly Assault (boss.json) ---
		const bossPromises: Promise<Endgame>[] = [];
		for (const [id, e] of Object.entries(bossData)) {
			const entry = e as any;
			const isHard = entry.zone_type === 1002;
			const subType = isHard ? "Deadly Assault (Hard)" : "Deadly Assault";
			const status = computeStatus(entry.begin, entry.end);
			const numId = Number(id);
			bossPromises.push(
				fetchBossIcons(numId, "boss").then((bossIcons) => ({
					id: numId,
					name: `${subType} #${id}`,
					type: "Deadly Assault",
					subType,
					status,
					hardMode: isHard,
					description: entry.begin && entry.end ? `${entry.begin} ~ ${entry.end}` : "",
					zoneId: numId,
					layerCount: 7,
					begin: entry.begin,
					end: entry.end,
					bossIcons,
				}))
			);
		}

		// --- Simulation (simul.json) ---
		const simulPromises: Promise<Endgame>[] = [];
		for (const [id, e] of Object.entries(simulData)) {
			const entry = e as any;
			const end = entry.end && entry.end !== "" ? entry.end : undefined;
			const status = end ? computeStatus(undefined, end) : "UNKNOWN";
			const numId = Number(id);
			simulPromises.push(
				fetchBossIcons(numId, "simul").then((bossIcons) => ({
					id: numId,
					name: `Threshold Simulation #${id}`,
					type: "Simulation",
					subType: "Threshold Simulation",
					status,
					hardMode: false,
					description: end ? `Ends: ${end}` : "",
					zoneId: numId,
					layerCount: 7,
					begin: entry.begin,
					end,
					bossIcons,
				}))
			);
		}

		// Await all detail fetches in parallel
		const allEndgames = await Promise.all([
			...shiyuPromises,
			...bossPromises,
			...simulPromises,
		]);
		results.push(...allEndgames);

		// Sort: newest (by begin date) first, fallback to ID descending
		results.sort((a, b) => {
			const aBegin = a.begin ? new Date(a.begin).getTime() : 0;
			const bBegin = b.begin ? new Date(b.begin).getTime() : 0;
			if (aBegin !== bBegin) return bBegin - aBegin;
			return b.id - a.id;
		});

		_endgames = results;
	} catch (e) {
		_error = String(e);
		console.error("Failed to load endgames:", e);
	} finally {
		_loading = false;
	}
}

init();

export function getEndgames() {
	return _endgames;
}

export function isLoading() {
	return _loading;
}

export function getError() {
	return _error;
}

export function reloadEndgames() {
	_loading = true;
	_error = null;
	init();
}
