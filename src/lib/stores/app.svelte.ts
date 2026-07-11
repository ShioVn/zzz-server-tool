import { browser } from "$app/environment";
import type { ActiveTab, Language, ZonConfig, AppState } from "$lib/types";
import { createDefaultZonConfig } from "$lib/utils/disc";
import { DEFAULT_PLAYER_UID } from "$lib/config";

// === Persistent App State with Svelte 5 runes ===

let activeTab = $state<ActiveTab>("agents");
let language = $state<Language>("en");
let search = $state("");
let weaponSearch = $state("");
let discSearch = $state("");
let endgameSearch = $state("");
let endgameType = $state("Shiyu Defense");
let remiellePath = $state("");
let remielleUid = $state(DEFAULT_PLAYER_UID);

let zonConfig = $state<ZonConfig>(createDefaultZonConfig());
let selectedAgents = $state<Record<string, number[]>>({});
let selectedWeapons = $state<Record<string, number[]>>({});


export function persist() {
	if (!browser) return;
	try {
		localStorage.setItem("zzz-state", JSON.stringify({
			activeTab,
			language,
			search,
			weaponSearch,
			discSearch,
			endgameSearch,
			endgameType,
			remiellePath,
			remielleUid,

			zonConfig,
			selectedAgents,
			selectedWeapons,
		}));
	} catch { /* ignore */ }
}

function load() {
	if (!browser) return;
	try {
		const saved = localStorage.getItem("zzz-state");
		if (saved) {
			const parsed = JSON.parse(saved) as Partial<AppState> & { zonConfig?: ZonConfig };
			activeTab = parsed.activeTab ?? "agents";
			language = parsed.language ?? "en";
			search = parsed.search ?? "";
			weaponSearch = parsed.weaponSearch ?? "";
			discSearch = parsed.discSearch ?? "";
			endgameSearch = parsed.endgameSearch ?? "";
			endgameType = parsed.endgameType ?? "Shiyu Defense";
			remiellePath = parsed.remiellePath ?? "";
			remielleUid = parsed.remielleUid ?? DEFAULT_PLAYER_UID;

			zonConfig = parsed.zonConfig ?? createDefaultZonConfig();
			selectedAgents = parsed.selectedAgents ?? {};
			selectedWeapons = parsed.selectedWeapons ?? {};
		}
	} catch { /* ignore */ }
}

load();

// Note: $effect used in +layout.svelte for auto-persist tracking

export function getState() {
	return {
		get activeTab() { return activeTab; },
		set activeTab(v: ActiveTab) { activeTab = v; },
		get language() { return language; },
		set language(v: Language) { language = v; },
		get search() { return search; },
		set search(v: string) { search = v; },
		get weaponSearch() { return weaponSearch; },
		set weaponSearch(v: string) { weaponSearch = v; },
		get discSearch() { return discSearch; },
		set discSearch(v: string) { discSearch = v; },
		get endgameSearch() { return endgameSearch; },
		set endgameSearch(v: string) { endgameSearch = v; },
		get endgameType() { return endgameType; },
		set endgameType(v: string) { endgameType = v; },
		get remiellePath() { return remiellePath; },
		set remiellePath(v: string) { remiellePath = v; },
		get remielleUid() { return remielleUid; },
		set remielleUid(v: string) { remielleUid = v; },

		get zonConfig() { return zonConfig; },
		set zonConfig(v: ZonConfig) { zonConfig = v; },
		get selectedAgents() { return selectedAgents; },
		set selectedAgents(v: Record<string, number[]>) { selectedAgents = v; },
		get selectedWeapons() { return selectedWeapons; },
		set selectedWeapons(v: Record<string, number[]>) { selectedWeapons = v; },
	};
}
