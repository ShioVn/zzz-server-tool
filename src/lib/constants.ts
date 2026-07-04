// === Shared game data constants for ZZZ Server Tool ===
// Centralized to avoid duplication across components and enable env-based overrides.

/** Element ID → readable name */
export const ELEMENT_NAMES: Record<number, string> = {
	200: "Physical", 201: "Fire", 202: "Ice",
	203: "Electric", 204: "Wind", 205: "Ether", 300: "Lumiflux",
};

/** Element ID → icon basename (without extension) */
export const ELEMENT_ICONS: Record<number, string> = {
	200: "IconPhysical", 201: "IconFire", 202: "IconIce",
	203: "IconElectric", 204: "IconWind", 205: "IconEther", 300: "IconLumiflux",
};

/** Element ID → display accent color */
export const ELEMENT_COLORS: Record<number, string> = {
	200: "#a0a0a0", 201: "#f97316", 202: "#22d3ee",
	203: "#a78bfa", 204: "#34d399", 205: "#c084fc", 300: "#facc15",
};

/** Weapon type ID → readable name */
export const WEAPON_TYPE_NAMES: Record<number, string> = {
	1: "Attack", 2: "Stun", 3: "Anomaly",
	4: "Support", 5: "Defense", 6: "Rupture",
};

/** Weapon type ID → icon basename */
export const WEAPON_TYPE_ICONS: Record<number, string> = {
	1: "IconAttack", 2: "IconStun", 3: "IconAnomaly",
	4: "IconSupport", 5: "IconDefense", 6: "IconRupture",
};

/** Hit type ID → icon basename */
export const HIT_TYPE_ICONS: Record<number, string> = {
	101: "IconSlash", 102: "IconStrike", 103: "IconPierce",
};

/** Disc slot → accent color */
export const SLOT_COLORS = [
	"#f97316", // slot 1 — orange
	"#22d3ee", // slot 2 — cyan
	"#a78bfa", // slot 3 — violet
	"#34d399", // slot 4 — emerald
	"#f472b6", // slot 5 — pink
	"#fbbf24", // slot 6 — amber
];

// ── Rank helpers ──

/** Get rank label (S/A/B) from numeric rank or weapon ID */
export function getRankLabel(rankOrId: number): string {
	if (rankOrId >= 14000 || rankOrId >= 4) return "S";
	if (rankOrId >= 13000 || rankOrId >= 3) return "A";
	return "B";
}

/** Get rank class name for styling */
export function getRankClass(rankOrId: number): string {
	return rankOrId >= 14000 || rankOrId >= 4 ? "rank-s" : "rank-a";
}

/** Get inline SVG data URI for rank star icon */
export function getRankIconSvg(isS: boolean): string {
	if (isS) {
		return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23fbbf24'%3E%3Cpath d='M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z'/%3E%3C/svg%3E";
	}
	return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2394a3b8'%3E%3Cpath d='M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z'/%3E%3C/svg%3E";
}

/** Get element color for a given element ID */
export function getElementColor(val: number | undefined): string {
	return val != null ? (ELEMENT_COLORS[val] ?? "#64748b") : "#64748b";
}
