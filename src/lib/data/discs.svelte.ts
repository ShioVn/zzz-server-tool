import { getEquipment, getAssetUrl } from "$lib/api/zzz-api";
import type { Disc } from "$lib/types";

let _discs = $state<Disc[]>([]);
let _loading = $state(true);
let _error = $state<string | null>(null);

async function init() {
	try {
		const data = await getEquipment();
		_discs = Object.entries(data).map(([id, d]: [string, any]) => ({
			id: Number(id),
			name: d.en?.name || undefined,
			icon: getAssetUrl(d.icon),
		}));
	} catch (e) {
		_error = String(e);
		console.error("Failed to load discs:", e);
	} finally {
		_loading = false;
	}
}

init();

export function getDiscs() {
	return _discs;
}

export function isLoading() {
	return _loading;
}

export function getError() {
	return _error;
}

export function reloadDiscs() {
	_loading = true;
	_error = null;
	init();
};
