import type { DiscEntry, StatEntry, ZonConfig, AvatarOverride, WeaponConfig } from "$lib/types";

// === Hardcoded game data (must be in plain .ts since Svelte runes .svelte.ts can't be imported here) ===
export const discMainStatOptionsBySlot: Record<number, number[]> = {
	1: [11103],  // HP flat (fixed)
	2: [12103],  // ATK flat (fixed)
	3: [13103],  // DEF flat (fixed)
	4: [11102, 12102, 13102, 20103, 21103, 31203],  // %HP, %ATK, %DEF, CRIT Rate%, CRIT DMG%, AP
	5: [11102, 12102, 13102, 23103, 31803, 31903, 31603, 31703, 31503, 32303],  // %HP, %ATK, %DEF, PEN%, Elemental DMG%
	6: [11102, 12102, 13102, 31402, 12202, 30502],  // %HP, %ATK, %DEF, AM, Impact, ER%
};

// === Disc ID parsing utilities ===

export function getDiscSlotFromEquipId(equipId: number): number {
	return equipId % 10;
}

export function getDiscRankFromEquipId(equipId: number): number {
	return Math.floor((equipId % 100) / 10) + 2;
}

export function getDiscSuitIdFromEquipId(equipId: number): number {
	return Math.floor(equipId / 100) * 100;
}

/** Build equip ID with S rank always. rarity digit = 4 (S), slot = Z */
export function buildDiscEquipId(equipId: number, slot: number): number {
	const prefix = Math.floor(equipId / 100);
	// S rank = rarity digit 4 → 4*10 = 40
	return prefix * 100 + 40 + slot;
}

/** Get display name for a stat ID */
export function getStatName(statId: number): string {
	const opt = discStatOptions.find(s => s.id === statId);
	return opt?.name ?? String(statId);
}

// === Stat options ===

export interface StatOption {
	id: number;
	name: string;
	baseValue?: number;
	subValues?: number[];
}

export const discStatOptions: StatOption[] = [
	{ id: 11103, name: "HP", baseValue: 550, subValues: [112] },
	{ id: 11102, name: "HP%", baseValue: 750, subValues: [300] },
	{ id: 12103, name: "ATK", baseValue: 79, subValues: [19] },
	{ id: 12102, name: "ATK%", baseValue: 750, subValues: [300] },
	{ id: 13103, name: "DEF", baseValue: 46, subValues: [15] },
	{ id: 13102, name: "DEF%", baseValue: 1200, subValues: [480] },
	{ id: 23203, name: "PEN", subValues: [9] },
	{ id: 23103, name: "PEN%", baseValue: 600 },
	{ id: 31402, name: "AM", baseValue: 750 },
	{ id: 31203, name: "AP", baseValue: 23, subValues: [9] },
	{ id: 21103, name: "CRIT DMG%", baseValue: 1200, subValues: [480] },
	{ id: 20103, name: "CRIT Rate%", baseValue: 600, subValues: [240] },
	{ id: 30502, name: "ER%", baseValue: 1500 },
	{ id: 12202, name: "Impact", baseValue: 450 },
	{ id: 31803, name: "Electric DMG%", baseValue: 750 },
	{ id: 31903, name: "Ether DMG%", baseValue: 750 },
	{ id: 31603, name: "Fire DMG%", baseValue: 750 },
	{ id: 31703, name: "Ice DMG%", baseValue: 750 },
	{ id: 31503, name: "Physical DMG%", baseValue: 750 },
	{ id: 32303, name: "Wind DMG%", baseValue: 750 },
];

export function getDiscStatDefaultValue(statId: number | string, type: "main" | "sub" = "main"): number {
	const id = typeof statId === "string" ? Number(statId) : statId;
	const opt = discStatOptions.find((s) => s.id === id);
	if (type === "sub" && opt?.subValues?.length) return opt.subValues[0];
	if (type === "main" && opt?.baseValue) return opt.baseValue;
	return 1;
}

export function getDiscMainStatOptions(entry: DiscEntry): StatOption[] {
	const slot = getDiscSlotFromEquipId(entry.id);
	const allowedIds = discMainStatOptionsBySlot[slot] ?? [];
	return discStatOptions.filter((s) => allowedIds.includes(s.id));
}

export function canUseAsSubStat(stat: StatOption): boolean {
	return !!stat.subValues?.length;
}

/**
 * Get the real in-game display value for a substat entry.
 * Formula: base_per_roll * add_count, with % suffix for percentage stats.
 * This is display-only; the raw value is still used for config gen.
 */
export function getSubStatDisplayValue(stat: StatEntry): string {
	const opt = discStatOptions.find((s) => s.id === stat.statId);
	if (!opt?.subValues?.length) return String(stat.value);
	const basePerRoll = opt.subValues[0];
	const total = basePerRoll * ((stat.add ?? 0) + 1);
	const isPercent = opt.name.endsWith("%");
	if (isPercent) {
		return (total / 100).toFixed(1).replace(/\.0$/, "") + "%";
	}
	return String(total);
}

/** Flat main stat IDs that are displayed as ×4 (S rank at level 15) */
const _flatMainStatIds = new Set([11103, 12103, 13103, 31203]);

/**
 * Get the real in-game display value for a mainstat entry.
 * - Flat stats (HP/ATK/DEF/AP): baseValue × 4
 * - % stats (including AM, Impact, ER%): baseValue ÷ 25, then % suffix
 * This is display-only; the raw value is still used for config gen.
 */
export function getMainStatDisplayValue(stat: StatEntry): string {
	if (_flatMainStatIds.has(stat.statId)) {
		return String(stat.value * 4);
	}
	// %-based stats: baseValue / 25 → display as %
	const displayValue = stat.value / 25;
	return displayValue.toFixed(1).replace(/\.0$/, "") + "%";
}

export function getDefaultDiscMainStat(entry: DiscEntry): StatEntry {
	const slot = getDiscSlotFromEquipId(entry.id);
	const allowedIds = discMainStatOptionsBySlot[slot] ?? [];
	const firstId = allowedIds[0] ?? 11102;
	return { statId: firstId, value: getDiscStatDefaultValue(firstId), add: 0 };
}
export function getDiscEntrySubStats(entry: DiscEntry): StatEntry[] {
	// Always return exactly 4 unique substats (no duplicates with main stat or each other)
	const mainStatId = entry.mainStat?.statId;
	const subs: StatEntry[] = [];
	const usedIds = new Set<number>();
	if (mainStatId) usedIds.add(mainStatId);
	for (let i = 0; i < 4; i++) {
		if (i < entry.subStats.length && entry.subStats[i]) {
			const st = entry.subStats[i];
			if (usedIds.has(st.statId)) {
				// This stat is already used, find a replacement
				const opt = discStatOptions.find(s => s.subValues?.length && !usedIds.has(s.id));
				if (opt) {
					usedIds.add(opt.id);
					subs.push({ statId: opt.id, value: getDiscStatDefaultValue(opt.id, "sub"), add: 0 });
				} else {
					const fallback = discStatOptions.find(s => s.subValues?.length)!;
					subs.push({ statId: fallback.id, value: getDiscStatDefaultValue(fallback.id, "sub"), add: 0 });
				}
			} else {
				subs.push(st);
				usedIds.add(st.statId);
			}
		} else {
			const opt = discStatOptions.find(s => s.subValues?.length && !usedIds.has(s.id));
			if (opt) {
				usedIds.add(opt.id);
				subs.push({ statId: opt.id, value: getDiscStatDefaultValue(opt.id, "sub"), add: 0 });
			} else {
				const fallback = discStatOptions.find(s => s.subValues?.length)!;
				subs.push({ statId: fallback.id, value: getDiscStatDefaultValue(fallback.id, "sub"), add: 0 });
			}
		}
	}
	return subs;
}

export function createDiscEntry(id: number): DiscEntry {
	const slot = getDiscSlotFromEquipId(id);
	const mainStat = getDefaultDiscMainStat({ id, level: 0, star: 0, mainStat: { statId: 0, value: 0 }, subStats: [] });
	const entry: DiscEntry = {
		id,
		level: 15,
		star: 5,
		mainStat,
		subStats: [],
		collapsed: false,
	};
	// Initialize with 4 default substats
	entry.subStats = getDiscEntrySubStats(entry);
	return entry;
}

export function clampNumber(value: string | number | undefined, min: number, max: number, fallback: number): number {
	const n = typeof value === "string" ? Number(value) : value;
	if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
	return Math.max(min, Math.min(max, n));
}

/** Clean a weapon ID string by removing all non-digit characters */
export function cleanWeaponId(input: string): string {
	return input.trim().replace(/[^\d]/g, "");
}

// === ZON Config utilities ===

export function createDefaultZonConfig(): ZonConfig {
	return {
		avatarOverrides: [],
		configWeapons: [],
		equipment: [],
		shiyuZone: undefined,
		daZone: undefined,
		daHardZone: undefined,
	};
}

