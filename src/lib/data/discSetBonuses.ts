// === Disc Set Bonus Definitions ===
// Update this file whenever a new disc set is added to the game.
// Source: in-game set descriptions.
// ponytail: 4-pc bonuses not tracked here — only 2-pc flat/% bonuses used in stat calc.
//           Add 4-pc support when calc engine supports conditional buffs.

import type { FinalStats } from "$lib/stats/calculations";

export interface SetBonus2pc {
	field: keyof FinalStats;
	value: number;
}

export interface SetBonusPct {
	field: keyof FinalStats;
	pct: number;
}

/** Flat/additive 2-pc bonuses. value=0 entries are placeholders for %-of-base sets (see SET_2PC_BASE_PCT). */
export const SET_2PC_BONUSES: Record<number, Array<SetBonus2pc>> = {
	31000: [{ field: "critRate", value: 0.08 }],          // Woodpecker Electro: CRIT Rate +8%
	31100: [{ field: "penPercent", value: 0.08 }],         // Puffer Electro: PEN Ratio +8%
	31200: [{ field: "impact", value: 15 }],               // Shockstar Disco: Impact +15
	31300: [{ field: "anomalyProficiency", value: 30 }],   // Freedom Blues: AP +30
	31400: [{ field: "atk", value: 0 }],                   // Hormone Punk: ATK +10% (see BASE_PCT)
	31500: [{ field: "def", value: 0.16 }],                // Soul Rock: DEF +16%
	31600: [{ field: "energyRegen", value: 0.20 }],        // Swing Jazz: ER +20%
	31700: [{ field: "anomalyProficiency", value: 30 }],   // Chaotic Metal: AP +30
	31800: [{ field: "anomalyProficiency", value: 30 }],   // Chaos Jazz: AP +30
	31900: [{ field: "def", value: 0.12 }],                // Proto Punk: DEF +12%
	32000: [{ field: "critDamage", value: 0.10 }],         // Polar Metal: CRIT DMG +10%
	32100: [{ field: "atk", value: 0 }],                   // Thunder Metal: ATK +10% (see BASE_PCT)
	32200: [{ field: "critRate", value: 0.057 }],          // Inferno Metal: CRIT Rate +5.7%
	32300: [{ field: "anomalyProficiency", value: 30 }],   // Branch & Blade Song: AP +30
	32400: [{ field: "critDamage", value: 0.10 }],         // Shadow Harmony: CRIT DMG +10%
	32700: [{ field: "critDamage", value: 0.16 }],         // Branch & Blade Song S2: CRIT DMG +16%
};

/** 2-pc bonuses that are a % of base stat (e.g., ATK +10% of base ATK). */
export const SET_2PC_BASE_PCT: Record<number, Array<SetBonusPct>> = {
	31400: [{ field: "atk", pct: 0.10 }],  // Hormone Punk
	32100: [{ field: "atk", pct: 0.10 }],  // Thunder Metal
};
