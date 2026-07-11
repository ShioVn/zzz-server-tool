// === Stat Calculation Engine for ZZZ Server Tool ===
// Pure functions — no Svelte runes.
// Formula: finalStat = baseStat × (1 + %bonus_sum) + flat_bonus_sum

import { discStatOptions } from "$lib/utils/disc";
import type { StatEntry } from "$lib/types";
import { SET_2PC_BONUSES, SET_2PC_BASE_PCT } from "$lib/data/discSetBonuses";

// ── Types ──

export interface FinalStats {
	hp: number;
	atk: number;
	def: number;
	impact: number;
	critRate: number;
	critDamage: number;
	anomalyMastery: number;
	anomalyProficiency: number;
	pen: number;
	penPercent: number;
	energyRegen: number;
}

export interface SetBonus {
	suitId: number;
	suitName: string;
	pieces: number;
	desc2: string;
	desc4: string;
}

// ── Base stat extraction ──

export function getCharacterBaseStats(detail: any, level: number, rank: number): FinalStats {
	const s = detail.stats ?? {};
	const lvPhase = detail.level?.[String(rank)] ?? {};
	const extra = detail.extra_level?.[String(rank)]?.extra ?? {};

	const lv = Math.max(1, Math.min(60, level));
	const hpG = Math.floor((s.hp_growth ?? 0) * (lv - 1) / 10000);
	const atkG = Math.floor((s.attack_growth ?? 0) * (lv - 1) / 10000);
	const defG = Math.floor((s.defence_growth ?? 0) * (lv - 1) / 10000);

	// Map extra_level prop IDs to FinalStats fields
	// FIXED: element_mystery = AP, element_abnormal_power = AM (swapped from before)
	const EXTRA_MAP: Record<number, { field: keyof FinalStats; divisor?: number }> = {
		12101: { field: 'atk' },
		20101: { field: 'critRate', divisor: 10000 },
		31201: { field: 'anomalyProficiency' },
		31402: { field: 'anomalyMastery' },
		21103: { field: 'critDamage', divisor: 10000 },
		23103: { field: 'penPercent', divisor: 10000 },
		23203: { field: 'pen' },
		30502: { field: 'energyRegen', divisor: 100 },
		30501: { field: 'energyRegen', divisor: 100 }, // Nicole/Ben etc use 30501
		12202: { field: 'impact' },
		11103: { field: 'hp' },
		12103: { field: 'atk' },
		13103: { field: 'def' },
	};

	const base: FinalStats = {
		hp: (s.hp_max ?? 0) + (lvPhase.hp_max ?? 0) + hpG,
		atk: (s.attack ?? 0) + (lvPhase.attack ?? 0) + atkG,
		def: (s.defence ?? 0) + (lvPhase.defence ?? 0) + defG,
		impact: s.break_stun ?? 0,
		critRate: (s.crit ?? 0) / 10000,
		critDamage: (s.crit_damage ?? 0) / 10000,
		// FIXED: swapped these two
		anomalyMastery: s.element_abnormal_power ?? 0,
		anomalyProficiency: s.element_mystery ?? 0,
		pen: s.pen_delta ?? 0,
		penPercent: (s.pen_rate ?? 0) / 10000,
		energyRegen: ((s.sp_recover ?? 0) + (lvPhase.sp_recover ?? 0)) / 100,
	};

	// Apply extra_level (core skill) bonuses — iterate all props
	for (const [propStr, entry] of Object.entries(extra)) {
		const propId = Number(propStr);
		const mapping = EXTRA_MAP[propId];
		if (!mapping) continue;
		const val = (entry as any)?.value ?? 0;
		if (mapping.divisor) {
			(base as any)[mapping.field] += val / mapping.divisor;
		} else {
			(base as any)[mapping.field] += val;
		}
	}

	return base;
}

// ── Disc stat values (S-rank level 15) ──

/** Get the display value for a disc main stat at S-rank lv15 */
export function getDiscMainStatRealValue(statId: number): number {
	const opt = discStatOptions.find((s) => s.id === statId);
	if (!opt?.baseValue) return 0;
	// Flat stats (HP/ATK/DEF/AP): baseValue × 4
	if ([11103, 12103, 13103, 31203].includes(statId)) return opt.baseValue * 4;
	// % stats: baseValue / 25 (gives display %)
	return opt.baseValue / 25;
}

/** Get the substat value per roll */
export function getSubstatPerRoll(statId: number): number {
	const opt = discStatOptions.find((s) => s.id === statId);
	return opt?.subValues?.[0] ?? 0;
}

/** Is this stat ID a %-of-base type? */
function isPercentStat(statId: number): boolean {
	return [11102, 12102, 13102].includes(statId); // HP%, ATK%, DEF%
}

/** Is this stat ID a flat additive type? */
function isFlatStat(statId: number): boolean {
	return [11103, 12103, 13103].includes(statId); // HP, ATK, DEF flat
}

// ── Apply contributions ──

export function applyDiscMainStat(stats: FinalStats, base: FinalStats, statId: number): FinalStats {
	if (!statId) return stats;
	const r = { ...stats };
	const val = getDiscMainStatRealValue(statId);
	if (statId === 11102) r.hp += base.hp * (val / 100);       // HP% of base
	else if (statId === 12102) r.atk += base.atk * (val / 100); // ATK% of base
	else if (statId === 13102) r.def += base.def * (val / 100); // DEF% of base
	else if (statId === 11103) r.hp += val;   // HP flat
	else if (statId === 12103) r.atk += val;  // ATK flat
	else if (statId === 13103) r.def += val;  // DEF flat
	else if (statId === 20103) r.critRate += val / 100;  // CRIT Rate %
	else if (statId === 21103) r.critDamage += val / 100; // CRIT DMG %
	else if (statId === 23103) r.penPercent += val / 100;  // PEN %
	else if (statId === 23203) r.pen += val;   // PEN flat
	else if (statId === 31203) r.anomalyProficiency += val;
	else if (statId === 31402) r.anomalyMastery += val;
	else if (statId === 30502) r.energyRegen += val / 100;  // ER%
	else if (statId === 12202) r.impact += val; // Impact
	return r;
}

export function applySubstats(stats: FinalStats, base: FinalStats, subs: StatEntry[]): FinalStats {
	let r = { ...stats };
	for (const sub of subs) {
		if (!sub.statId) continue;
		const rolls = (sub.add ?? 0) + 1;
		const perRoll = getSubstatPerRoll(sub.statId);
		if (perRoll <= 0) continue;
		const total = perRoll * rolls;
		const sid = sub.statId;

		if (sid === 11102) r.hp += base.hp * (total / 10000);       // HP% substat = perRoll/100 %
		else if (sid === 12102) r.atk += base.atk * (total / 10000); // ATK% substat
		else if (sid === 13102) r.def += base.def * (total / 10000); // DEF% substat
		else if (sid === 11103) r.hp += total;    // HP flat
		else if (sid === 12103) r.atk += total;   // ATK flat
		else if (sid === 13103) r.def += total;   // DEF flat
		else if (sid === 20103) r.critRate += total / 10000;  // CRIT Rate (perRoll=240 → 2.4%/roll)
		else if (sid === 21103) r.critDamage += total / 10000; // CRIT DMG (perRoll=480 → 4.8%/roll)
		else if (sid === 23103) r.penPercent += total / 10000; // PEN%
		else if (sid === 23203) r.pen += total;
		else if (sid === 31203) r.anomalyProficiency += total;
		else if (sid === 31402) r.anomalyMastery += total;
		else if (sid === 30502) r.energyRegen += total / 10000; // ER%
		else if (sid === 12202) r.impact += total;
	}
	return r;
}

export function applyWeaponToStats(stats: FinalStats, base: FinalStats, flatAtk: number, subStatId: number, subStatValue: number): FinalStats {
	let r = { ...stats };
	r.atk += flatAtk; // Weapon flat ATK
	// Weapon secondary stat
	if (subStatId && subStatValue) {
		if (subStatId === 12102) r.atk += base.atk * (subStatValue / 100); // ATK%
		else if (subStatId === 11102) r.hp += base.hp * (subStatValue / 100);
		else if (subStatId === 13102) r.def += base.def * (subStatValue / 100);
		else if (subStatId === 20103) r.critRate += subStatValue / 100;
		else if (subStatId === 21103) r.critDamage += subStatValue / 100;
		else if (subStatId === 23103) r.penPercent += subStatValue / 100;
		else if (subStatId === 23203) r.pen += subStatValue;
		else if (subStatId === 31203) r.anomalyProficiency += subStatValue;
		else if (subStatId === 31402) r.anomalyMastery += subStatValue;
		else if (subStatId === 30502) r.energyRegen += subStatValue / 100;
		else if (subStatId === 12202) r.impact += subStatValue;
	}
	return r;
}


export function applySetBonuses(stats: FinalStats, base: FinalStats, suitIds: number[]): FinalStats {
	let r = { ...stats };
	const counts: Record<number, number> = {};
	for (const id of suitIds) {
		if (!id) continue;
		const suitId = Math.floor(id / 100) * 100;
		counts[suitId] = (counts[suitId] || 0) + 1;
	}
	for (const [suitIdStr, count] of Object.entries(counts)) {
		if (count < 2) continue;
		const suitId = Number(suitIdStr);
		// Flat/value bonuses
		const bonuses = SET_2PC_BONUSES[suitId];
		if (bonuses) {
			for (const b of bonuses) {
				const field = b.field;
				if (typeof r[field] === "number") {
					if (field === "atk" && b.value === 0) continue; // Skip placeholders
					(r as any)[field] += b.value;
				}
			}
		}
		// % of base bonuses
		const pctBonuses = SET_2PC_BASE_PCT[suitId];
		if (pctBonuses) {
			for (const b of pctBonuses) {
				const field = b.field;
				if (typeof r[field] === "number") {
					(r as any)[field] += base[field] * b.pct;
				}
			}
		}
	}
	return r;
}

// ── Final computation ──

export function computeFinalStats(
	base: FinalStats,
	weapon: { flatAtk: number; subStatId: number; subStatValue: number } | null,
	discs: Array<{ mainStatId: number; subStats: StatEntry[]; equipId: number }>
): FinalStats {
	let stats = { ...base };
	// trueBase = character + weapon flat ATK (for %ATK calc)
	const trueBase = { ...base };

	// console.log(`[calcStats] base: HP=${base.hp.toFixed(2)} ATK=${base.atk.toFixed(2)} DEF=${base.def.toFixed(2)}`);

	// Weapon
	if (weapon) {
		// Add weapon flat ATK to trueBase first (before weapon substat %ATK)
		trueBase.atk += weapon.flatAtk;
		// console.log(`[calcStats] after weapon flat ${weapon.flatAtk}: ATK=${trueBase.atk.toFixed(2)}`);
		// Weapon substat %ATK uses trueBase (char + weapon flat) per user formula
		stats = applyWeaponToStats(stats, trueBase, weapon.flatAtk, weapon.subStatId, weapon.subStatValue);
		// console.log(`[calcStats] after weapon substat: HP=${stats.hp.toFixed(2)} ATK=${stats.atk.toFixed(2)} DEF=${stats.def.toFixed(2)}`);
	}

	// Discs
	const suitIds: number[] = [];
	for (let i = 0; i < discs.length; i++) {
		const d = discs[i];
		if (d.mainStatId) {
			const before = stats.atk;
			stats = applyDiscMainStat(stats, trueBase, d.mainStatId);
			// console.log(`[calcStats] disc ${i} main stat ${d.mainStatId}: ATK ${before.toFixed(2)} → ${stats.atk.toFixed(2)}`);
		}
		const beforeSub = stats.atk;
		stats = applySubstats(stats, trueBase, d.subStats ?? []);
		// console.log(`[calcStats] disc ${i} substats: ATK ${beforeSub.toFixed(2)} → ${stats.atk.toFixed(2)}`);
		if (d.equipId) suitIds.push(d.equipId);
	}

	// Set bonuses — use trueBase for %-of-base bonuses
	const beforeSet = stats.atk;
	stats = applySetBonuses(stats, trueBase, suitIds);
	// console.log(`[calcStats] after set bonuses: ATK ${beforeSet.toFixed(2)} → ${stats.atk.toFixed(2)}`);

	// console.log(`[calcStats] final: HP=${stats.hp.toFixed(2)} ATK=${stats.atk.toFixed(2)} DEF=${stats.def.toFixed(2)}`);

	return stats;
}
