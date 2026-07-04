// Centralized API service for ZZZ data from nanoka.cc
const BASE = "https://static.nanoka.cc";

let latestVersion: string | null = null;
const cache = new Map<string, any>();

async function fetchJson(url: string): Promise<any> {
	if (cache.has(url)) return cache.get(url);
	try {
		const res = await fetch(url);
		if (!res.ok) {
			throw new Error("Unable to connect with API");
		}
		const data = await res.json();
		cache.set(url, data);
		return data;
	} catch (error) {
		throw new Error("Unable to connect with API");
	}
}

/** Clear all cached API responses */
export function clearCache() {
	cache.clear();
	latestVersion = null;
}

/** Get the latest ZZZ version string from the manifest */
export async function getLatestVersion(): Promise<string> {
	if (latestVersion) return latestVersion!;
	const manifest = await fetchJson(`${BASE}/manifest.json`);
	latestVersion = manifest.zzz.latest as string;
	return latestVersion!;
}

/** Build a webp asset URL from an icon name/path */
export function getAssetUrl(icon?: string): string {
	if (!icon) return "";
	const parts = icon.replace(/\\\\/g, "/").split("/");
	const filename = parts[parts.length - 1].replace(/\.\w+$/, "");
	return `${BASE}/assets/zzz/${filename}.webp`;
}

async function getVersionedUrl(path: string): Promise<string> {
	const ver = await getLatestVersion();
	return `${BASE}/zzz/${ver}/${path}`;
}

/** Fetch all weapons from the API */
export async function getWeapons(): Promise<Record<string, any>> {
	return fetchJson(await getVersionedUrl("weapon.json"));
}

/** Fetch all characters from the API */
export async function getCharacters(): Promise<Record<string, any>> {
	return fetchJson(await getVersionedUrl("character.json"));
}

/** Fetch all equipment (discs) from the API */
export async function getEquipment(): Promise<Record<string, any>> {
	return fetchJson(await getVersionedUrl("equipment.json"));
}

/** Fetch shiyu defense data from the API */
export async function getShiyu(): Promise<Record<string, any>> {
	return fetchJson(await getVersionedUrl("shiyu.json"));
}

/** Fetch boss data from the API */
export async function getBosses(): Promise<Record<string, any>> {
	return fetchJson(await getVersionedUrl("boss.json"));
}

/** Fetch simulation data from the API */
export async function getSimul(): Promise<Record<string, any>> {
	return fetchJson(await getVersionedUrl("simul.json"));
}

/** Fetch a single weapon detail by id */
export async function getWeaponDetail(id: number | string): Promise<any> {
	const ver = await getLatestVersion();
	return fetchJson(`${BASE}/zzz/${ver}/en/weapon/${id}.json`);
}

/** Fetch a single character detail by id */
export async function getCharacterDetail(id: number | string): Promise<any> {
	const ver = await getLatestVersion();
	return fetchJson(`${BASE}/zzz/${ver}/en/character/${id}.json`);
}

/** Fetch a single shiyu detail by id */
export async function getShiyuDetail(id: number | string): Promise<any> {
	const ver = await getLatestVersion();
	return fetchJson(`${BASE}/zzz/${ver}/en/shiyu/${id}.json`);
}

/** Fetch a single boss detail by id */
export async function getBossDetail(id: number | string): Promise<any> {
	const ver = await getLatestVersion();
	return fetchJson(`${BASE}/zzz/${ver}/en/boss/${id}.json`);
}

/** Fetch a single simul detail by id */
export async function getSimulDetail(id: number | string): Promise<any> {
	const ver = await getLatestVersion();
	return fetchJson(`${BASE}/zzz/${ver}/en/simul/${id}.json`);
}

/** Fetch monster data (used to filter boss icons by rarity) */
export async function getMonsters(): Promise<Record<string, any>> {
	return fetchJson(await getVersionedUrl("monster.json"));
}

/** Check if a monster entry from detail API is a boss/elite (rarity >= 2) */
function isBossMonster(monsterEntry: any, monsters: Record<string, any>): boolean {
	if (!monsterEntry?.id) return false;
	const key = String(monsterEntry.id);
	const m = monsters[key];
	if (!m) return false;
	return m.rarity >= 2;
}

/** Extract up to 3 boss/monster icon paths from a zone detail API response */
export function extractBossIcons(detail: any, monsters: Record<string, any> = {}): string[] {
	if (!detail) return [];
	const icons: string[] = [];

	function tryPushImage(monsterEntry: any) {
		if (monsterEntry?.image && icons.length < 3 && isBossMonster(monsterEntry, monsters)) {
			icons.push(monsterEntry.image);
		}
	}

	function scanRooms(rooms: Record<string, any>) {
		const roomList = Object.values(rooms) as any[];
		for (const room of roomList) {
			if (room.monster_list) {
				const list = Object.values(room.monster_list) as any[];
				for (const m of list) tryPushImage(m);
			}
			if (icons.length === 0 && room.monster_icon) {
				icons.push(room.monster_icon);
			}
		}
	}

	if (detail.zone) {
		const zones = Object.entries(detail.zone) as [string, any][];
		zones.sort(([a], [b]) => String(a).localeCompare(String(b)));
		for (const [, zoneData] of zones) {
			if (zoneData?.layer_room) scanRooms(zoneData.layer_room);
			if (icons.length >= 3) break;
		}
	}

	if (detail.node) {
		const nodes = Object.values(detail.node) as any[];
		for (const node of nodes) {
			if (node.battle) {
				const battles = Object.values(node.battle) as any[];
				if (battles.length > 0) {
					const lastBattle = battles[battles.length - 1];
					if (lastBattle.layer_room) scanRooms(lastBattle.layer_room);
				}
			}
		}
	}

	return icons.slice(0, 3);
}

/** Extract an icon suit name from an equipment icon path */
export function getSuitNameFromIcon(icon?: string): string {
	if (!icon) return "";
	const match = icon.match(/Suit(\w+)/);
	return match ? match[1] : icon.replace(/\.\w+$/, "").split("/").pop() ?? "";
}
