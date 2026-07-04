import { getWeapons as apiGetWeapons, getAssetUrl } from "$lib/api/zzz-api";
import type { Weapon } from "$lib/types";

let _weapons = $state<Weapon[]>([]);
let _loading = $state(true);
let _error = $state<string | null>(null);

/** Extract enum name from weapon icon (the icon field IS the code_name, e.g., "Weapon_A_1011") */
function extractEnumNameFromIcon(icon: string): string {
	// The icon from weapon.json is already the code_name like "Weapon_A_1011"
	// No need to parse URL - just return it directly
	return icon;
}

async function init() {
	try {
		const data = await apiGetWeapons();
		_weapons = Object.entries(data).map(([id, w]: [string, any]) => ({
			id: Number(id),
			name: w.en || undefined,
			icon: getAssetUrl(w.icon),
			enumName: w.icon ? extractEnumNameFromIcon(w.icon) : undefined,
			rank: w.rank,
			type: w.type,
			sub: w.sub,
		}));
	} catch (e) {
		_error = String(e);
		console.error("Failed to load weapons:", e);
	} finally {
		_loading = false;
	}
}

init();

export function getWeapons() {
	return _weapons;
}

export function isLoading() {
	return _loading;
}

export function getError() {
	return _error;
}

export function reloadWeapons() {
	_loading = true;
	_error = null;
	init();
}
