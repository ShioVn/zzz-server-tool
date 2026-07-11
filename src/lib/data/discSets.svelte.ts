import { getLatestVersion, fetchJson } from "$lib/api/zzz-api";
import { API_BASE } from "$lib/api/config";

export type DiscSetDetail = {
	id: number;
	name: string;
	desc2: string;
	desc4: string;
};

// Use simple reactive counter + array for reactivity
let _items = $state<DiscSetDetail[]>([]);
let _loading = $state<Set<number>>(new Set());

function getItem(id: number): DiscSetDetail | undefined {
	return _items.find((d) => d.id === id);
}

async function fetchSetDetail(id: number): Promise<DiscSetDetail> {
	const ver = await getLatestVersion();
	const url = `${API_BASE}/zzz/${ver}/en/equipment/${id}.json`;
	const d = await fetchJson(url);
	return {
		id: d.id,
		name: d.name,
		desc2: (d.desc2 || "").replace(/<[^>]+>/g, ""),
		desc4: (d.desc4 || "").replace(/<[^>]+>/g, ""),
	};
}

export function getDiscSetDetail(id: number): DiscSetDetail | null {
	return getItem(id) ?? null;
}

export function getDiscSetName(id: number): string {
	return getItem(id)?.name ?? `#${id}`;
}

export async function ensureDiscSetDetail(id: number): Promise<DiscSetDetail | null> {
	if (getItem(id)) return getItem(id)!;
	if (_loading.has(id)) return null;
	_loading.add(id);
	try {
		const detail = await fetchSetDetail(id);
		_items = [..._items, detail];
		return detail;
	} catch {
		return null;
	} finally {
		_loading.delete(id);
	}
}
