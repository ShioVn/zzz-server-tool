import { getWeapons as apiGetWeapons, getAssetUrl } from "$lib/api/zzz-api";
import type { Weapon } from "$lib/types";

let _weapons = $state<Weapon[]>([]);
let _loading = $state(true);
let _error = $state<string | null>(null);
let _initialized = false;

async function init() {
	if (_initialized) return;
	_initialized = true;
	try {
		const data = await apiGetWeapons();
		_weapons = Object.entries(data).map(([id, w]: [string, any]) => ({
			id: Number(id),
			name: w.en || undefined,
			icon: getAssetUrl(w.icon),
			enumName: w.icon || undefined,
			rank: w.rank,
			type: w.type,
			sub: w.sub,
			atk: w.atk,
		}));
		_error = null;
	} catch (e) {
		_error = String(e);
		// console.error("Failed to load weapons:", e);
	} finally {
		_loading = false;
	}
}

init();

export function getWeapons() {
	// Auto-retry if empty and had error
	if (_weapons.length === 0 && _error && !_loading) {
		_loading = true;
		_initialized = false;
		init();
	}
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
	_initialized = false;
	init();
}
