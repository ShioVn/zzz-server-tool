import { getCharacters, getCharacterDetail, getAssetUrl } from "$lib/api/zzz-api";
import type { Agent } from "$lib/types";
import { getCharacterBaseStats } from "$lib/stats/calculations";
import type { FinalStats } from "$lib/stats/calculations";

let _agents = $state<Agent[]>([]);
let _loading = $state(true);
let _error = $state<string | null>(null);

// Display name lookups extracted from detail API
let _elementNames = $state<Record<number, string>>({});
let _weaponTypeNames = $state<Record<number, string>>({});
let _hitTypeNames = $state<Record<number, string>>({});
let _campNames = $state<Record<number, string>>({});

async function init() {
	try {
		const data = await getCharacters();
		// First pass: create agents with basic data from index
		const agents = Object.entries(data).map(([id, c]: [string, any]) => {
			const potentialIds = c.potential || [];
			const awakeningId = potentialIds.find((p: number) => p % 100 === 0) || potentialIds[0];

			return {
				id: Number(id),
				name: c.en || undefined,
				audio_event_replace_param: (c.code || "").toLowerCase(),
				zonEnum: "",
				icon: getAssetUrl(c.icon),
				element: c.element,
				weaponType: c.type,
				hitType: c.hit,
				camp: c.camp,
				rank: c.rank,
				...(awakeningId ? { awakeningId } : {}),
			};
		});

		// Second pass: fetch character details to get zonEnum and name lookups
		const details = await Promise.allSettled(
			agents.map((a) =>
				getCharacterDetail(a.id).then((d) => ({
					id: a.id,
					tags: d.stats?.tags,
					code: d.code_name,
					weaponType: d.weapon_type,
					elementType: d.element_type,
					hitType: d.hit_type,
					camp: d.camp,
				}))
			)
		);

		for (const result of details) {
			if (result.status === "fulfilled") {
				const v = result.value;
				// Populate zonEnum from tags or code
				if (v.tags?.length) {
					const agent = agents.find((a) => a.id === v.id);
					if (agent) agent.zonEnum = v.tags[0].toLowerCase();
				} else if (v.code) {
					const agent = agents.find((a) => a.id === v.id);
					if (agent) agent.zonEnum = v.code.toLowerCase();
				}
				// Collect name lookups (merge across all agents — same IDs have same names)
				if (v.weaponType) Object.assign(_weaponTypeNames, v.weaponType);
				if (v.elementType) Object.assign(_elementNames, v.elementType);
				if (v.hitType) Object.assign(_hitTypeNames, v.hitType);
				if (v.camp) Object.assign(_campNames, v.camp);
			} else {
				// console.error(`Failed to load detail for agent ${result.reason}`);
			}
		}

		_agents = agents;
	} catch (e) {
		_error = String(e);
		// console.error("Failed to load agents:", e);
	} finally {
		_loading = false;
	}
}

// Start fetching immediately
init();

export function getAgents() {
	// Auto-retry if empty and had error
	if (_agents.length === 0 && _error && !_loading) {
		_loading = true;
		init();
	}
	return _agents;
}

export function isLoading() {
	return _loading;
}

export function getError() {
	return _error;
}

export function getElementNames() {
	return _elementNames;
}

export function getWeaponTypeNames() {
	return _weaponTypeNames;
}

export function getHitTypeNames() {
	return _hitTypeNames;
}

export function getCampNames() {
	return _campNames;
}


/** Reload agents from API */
export function reloadAgents() {
	_loading = true;
	_error = null;
	init();
}

/** Fetch agent detail from API and compute base stats at given level+rank */
export async function getAgentBaseStats(agentId: number, level: number, rank: number): Promise<FinalStats> {
	const detail = await getCharacterDetail(agentId);
	return getCharacterBaseStats(detail, level, rank);
}
