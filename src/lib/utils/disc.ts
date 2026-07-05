import type { DiscEntry, StatEntry, ZonConfig, AvatarOverride, WeaponConfig } from "$lib/types";
import { getWeapons } from "$lib/data/weapons.svelte";

// === Inline helper type for weapon lookups ===
interface Weapon { id: number; name?: string; icon?: string; enumName?: string; }

// Weapon list from API — use getter (not cached ref) so it reflects the async-loaded data
function getWeaponList(): Weapon[] {
	return getWeapons() as unknown as Weapon[];
}

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
		importHighlights: { equipment: false, weapons: false, avatars: false },
	};
}

// === Weapon enum name helpers ===

const weaponEnumCache = new Map<number, string>();

export function getWeaponEnumNameFromIcon(icon: string): string {
	// The icon from weapon list API is already the code_name (e.g., "Weapon_A_1011")
	// No URL parsing needed - return directly
	return icon;
}

export function getWeaponEnumName(id: string): string {
	const numId = Number(id);
	if (weaponEnumCache.has(numId)) return weaponEnumCache.get(numId)!;
	const weapon = getWeaponList().find((w) => w.id === numId);
	if (weapon?.enumName) {
		weaponEnumCache.set(numId, weapon.enumName);
		return weapon.enumName;
	}
	// Fallback: derive from id pattern. API uses Weapon_{Rank}_Common_{seq} for common weapons.
	// Numeric ID 13001 → Weapon_A_Common_01, 13020 → Weapon_A_Common_20, 14001 → Weapon_S_Common_01, etc.
	if (numId >= 14000) {
		const seq = numId - 14000 + 1;
		return `Weapon_S_Common_${String(seq).padStart(2, '0')}`;
	}
	if (numId >= 13000) {
		const seq = numId - 13000 + 1;
		return `Weapon_A_Common_${String(seq).padStart(2, '0')}`;
	}
	return id;
}

// === Download helper ===

export function downloadTextFile(content: string, filename: string, mimeType: string) {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

// === ZON parsing utilities ===

/**
 * Get the index of the next non-whitespace, non-comment character.
 */
function skipWhitespaceAndComments(text: string, start: number): number {
	let i = start;
	while (i < text.length) {
		if (text[i] === "/" && i + 1 < text.length && text[i + 1] === "/") {
			i = text.indexOf("\n", i);
			if (i < 0) return text.length;
			i++;
			continue;
		}
		if (text[i] === " " || text[i] === "\t" || text[i] === "\n" || text[i] === "\r" || text[i] === ",") {
			i++;
			continue;
		}
		break;
	}
	return i;
}

/**
 * Extract the content inside a top-level `{` `}` block starting at startIdx.
 */
function extractBraceBlock(text: string, startIdx: number, initialDepth = 0): { content: string; endIdx: number } | null {
	if (startIdx >= text.length) return null;
	let i = startIdx;
	let ch: string;
	// Skip prefix like ".{" or just "{"
	while (i < text.length) {
		ch = text[i];
		if (ch === "{") break;
		i++;
	}
	if (i >= text.length) return null;

	let depth = initialDepth;
	let inString = false;
	i++; // skip opening brace
	const startContent = i;
	while (i < text.length) {
		ch = text[i];
		if (inString) {
			if (ch === '"' && (i === 0 || text[i - 1] !== "\\")) inString = false;
		} else {
			if (ch === "{") depth++;
			else if (ch === "}") {
				depth--;
				if (depth === 0) return { content: text.substring(startContent, i), endIdx: i + 1 };
			} else if (ch === '"') inString = true;
		}
		i++;
	}
	return null;
}

/**
 * Find the content of a named section with pattern:
 * .sectionName = .{ ... }  or  .sectionName { ... }
 */
function findSectionContent(text: string, sectionName: string): string | null {
	const pattern = `\\.${sectionName}\\s*(?:=\\s*)?`;
	const regex = new RegExp(pattern);
	const match = text.match(regex);
	if (!match) return null;
	const fromIdx = (match.index || 0) + match[0].length;
	// Skip whitespace and optional dot before brace
	let i = skipWhitespaceAndComments(text, fromIdx);
	if (i < text.length && text[i] === ".") i++;
	i = skipWhitespaceAndComments(text, i);
	if (i < text.length && text[i] === "{") {
		const block = extractBraceBlock(text, i, 1);
		return block ? block.content : null;
	}
	return null;
}

/**
 * Parse entries from a section content. Each entry is a `.{}` block.
 * Returns array of entry contents (without the outer .{ }).
 */
function parseZonEntries(content: string): string[] {
	const entries: string[] = [];
	let i = 0;
	while (i < content.length) {
		i = skipWhitespaceAndComments(content, i);
		if (i >= content.length) break;
		// Look for ".{"
		if (content[i] === "." && i + 1 < content.length && content[i + 1] === "{") {
			const block = extractBraceBlock(content, i, 1);
			if (block) {
				entries.push(block.content.trim());
				i = block.endIdx;
			} else {
				i++;
			}
		} else {
			i++;
		}
	}
	return entries;
}

/**
 * Parse key-value pairs from a ZON entry content.
 * Handles:
 *   .key = value,
 *   .key = value
 * where value can be numeric, dot-prefixed enum, or quoted string.
 */
function parseZonEntryKv(entryContent: string): Record<string, string> {
	const result: Record<string, string> = {};
	// Match all .identifier = value patterns
	const kvRegex = /\.(\w+)\s*=\s*("[^"]*"|[^\s,}]+)/g;
	let m;
	while ((m = kvRegex.exec(entryContent)) !== null) {
		result[m[1]] = m[2].trim();
	}
	return result;
}

function stripDot(value: string): string {
	return value.startsWith(".") ? value.slice(1) : value;
}

// Reverse mapping for import: server .zon id (actual server enum names) -> local config ids
// These agents have different enum names in the server config vs API data
const ZON_ENUM_EXCEPTIONS_REVERSE: Record<string, string> = {
	"ZhuYuan": "zhuyuan",
	"nicole": "nostradamus",
	"koleda": "ookumamari",
	"xiaozhao": "furry",
};

// === ZON building ===
export function buildZonConfigText(
	config: ZonConfig,
	awakeneableAgents?: Array<{ id: number; code: string; awakening: number }>
): string {
	const lines: string[] = [];

	// === Non-editable header (MUST NOT be changed) ===
	lines.push(".{");
	lines.push("    // UDP bind address.");
	lines.push("    // Can be overridden by the `-b` option.");
	lines.push('    .bind_address = "127.0.0.1:20501",');
	lines.push("");
	lines.push("    // The amount of sessions allowed to be processed concurrently.");
	lines.push("    // Zero means unlimited amount.");
	lines.push("    // Can be overridden by the `-c` option.");
	lines.push("    .concurrent_sessions_limit = 0,");
	lines.push("");
	lines.push("    // The first player UID.");
	lines.push("    // All created account UIDs will be relative to this.");
	lines.push('    .base_player_uid = 666, // the number of the beast');
	lines.push("");

	// === Hadal zone entrances ===
	lines.push("    // Also known as \"Shiyu Defense\" and \"Deadly Assault\".");
	lines.push("    .hadal_zone_entrances = .{");
	// shiyuZone, daZone, daHardZone from user selection, fallback to defaults
	lines.push("        .{ .id = .hadal_zone_scheduled, .zone = " + (config.shiyuZone ?? 620561) + " },");
	lines.push("        .{ .id = .hadal_zone_stable, .zone = 61001 },");
	lines.push("        .{ .id = .hadal_zone_defensive, .zone = 61002 },");
	lines.push("        .{ .id = .boss_challenge_normal, .zone = " + (config.daZone ?? 6904311) + " },");
	lines.push("        .{ .id = .boss_challenge_hard, .zone = " + (config.daHardZone ?? 6904321) + " },");
	lines.push("    },");
	lines.push("");

	// === starting_items block ===
	lines.push("    // Added to the inventory upon the first login.");
	lines.push("    // If you're expecting this to change your existing inventory,");
	lines.push("    // you should remove your `Persistent` directory.");
	lines.push("    .starting_items = .{");

	// --- Avatar overrides (merge manual + auto-include awakening agents) ---
	const manualAvatars = [...config.avatarOverrides];

	if (awakeneableAgents && awakeneableAgents.length > 0) {
		for (const agent of awakeneableAgents) {
			const enumName = agent.code;
			const alreadyExists = manualAvatars.some(
				(a) => a.id.toLowerCase() === enumName || a.id === String(agent.id)
			);
			if (!alreadyExists) {
				manualAvatars.push({
					id: enumName,
					level: 60,
					rank: 6,
					talents: 6,
					awakening: agent.awakening,
				});
			}
		}
	}

	// Some agent enum names in the server use non‑lowercase casing (from audio_event_replace_param).
	// Map lowercased zonEnum -> actual server enum name.
	const ZON_ENUM_EXCEPTIONS: Record<string, string> = {
		"zhuyuan": "ZhuYuan",
		"nostradamus": "nicole",
		"ookumamari": "koleda",
		"furry": "xiaozhao",
	}

	if (manualAvatars.length > 0) {
		lines.push("        // Override values for avatars.");
		lines.push("        // Each one of these fields (except id) is optional.");
		lines.push("        .avatar_overrides = .{");
		for (const av of manualAvatars) {
			const zonId = ZON_ENUM_EXCEPTIONS[av.id.toLowerCase()] ?? av.id;
			lines.push("            .{");
			lines.push(`                .id = .${zonId},`);
			lines.push(`                .level = ${av.level || 60},`);
			lines.push(`                .rank = ${av.rank || 6},`);
			lines.push(`                .talents = ${av.talents || 0}, // Also known as "mindscapes".`);
			if (av.awakening) {
				lines.push(`                .awakening = ${av.awakening},`);
			}
			lines.push("");
			lines.push("            },");
		}
		lines.push("        },");
		lines.push("");
	} else {
		// Always output avatar_overrides even when empty (matching reference config format)
		lines.push("        // Override values for avatars.");
		lines.push("        // Each one of these fields (except id) is optional.");
		lines.push("        .avatar_overrides = .{");
		lines.push("        },");
		lines.push("");
	}

	// --- Weapons ---
	lines.push("        // Weapons. Also known as \"w-engines\".");
	lines.push("        .weapons = .{");
	if (config.configWeapons.length > 0) {
		const validWeapons = config.configWeapons.filter((w) => {
			const idNum = Number(w.id);
			if (isNaN(idNum)) return true; // enum-based assumed valid
			return getWeaponList().some((weapon) => weapon.id === idNum);
		});
		for (const w of validWeapons) {
			const enumName = w.enumName || getWeaponEnumName(w.id);
			lines.push("            .{");
			lines.push(`                .id = ${/^\d+$/.test(enumName) ? enumName : "." + enumName},`);
			lines.push(`                .level = ${w.level || 60},`);
			lines.push(`                .star = ${w.star || 5},`);
			lines.push(`                .refine = ${w.refine || 1}, // also known as "overclock"`);
			lines.push("            },");
		}
	}
	lines.push("        },");
	lines.push("");

	// --- Equipment (Drive Discs) ---
	lines.push("        // Equipment. Also known as \"drive discs\".");
	lines.push("        .equipment = .{");
	for (const entry of config.equipment) {
		lines.push("            .{");
		lines.push(`                .id = ${entry.id},`);
		lines.push(`                .level = ${entry.level ?? 15},`);
		lines.push(`                .star = ${entry.star ?? 5},`);
		lines.push("                .properties = .{");
		if (entry.mainStat) {
			lines.push(
				`                    .{ .key = ${entry.mainStat.statId}, .base_value = ${entry.mainStat.value}, .add_value = 1 },`
			);
		}
		const subs = getDiscEntrySubStats(entry);
		for (const sub of subs) {
			lines.push(
				`                    .{ .key = ${sub.statId}, .base_value = ${sub.value}, .add_value = ${(sub.add ?? 0) + 1} },`
			);
		}
		lines.push("                },");
		lines.push("            },");
	}
	lines.push("        },");

	// Close starting_items
	lines.push("    },");
	lines.push("");
	lines.push('    .dummy_cmd = "IECPJKNJHCF",');
	lines.push("}");

	return lines.join("\n");
}

// === ZON parsing ===

export function parseZonConfigText(text: string): ZonConfig {
	const config = createDefaultZonConfig();

	// Remove comments
	const cleanText = text.replace(/\/\/.*$/gm, "");

	// === Parse avatar_overrides ===
	const avatarContent = findSectionContent(cleanText, "avatar_overrides");
	if (avatarContent) {
		const entries = parseZonEntries(avatarContent);
		for (const entry of entries) {
			const kv = parseZonEntryKv(entry);
			if (kv.id) {
				const rawId = stripDot(kv.id);
				// Skip non-agent entries that leaked into avatar_overrides (Weapon_* or numeric disc IDs)
				if (rawId.startsWith("Weapon_") || /^\d+$/.test(rawId)) continue;
				// Apply reverse mapping: server enum name -> local config id
				const id = ZON_ENUM_EXCEPTIONS_REVERSE[rawId] ?? rawId;
				const override: AvatarOverride = {
					id,
					level: Number(kv.level) || 60,
					rank: Number(kv.rank) || 6,
					talents: Number(kv.talents) || 0,
				};
				if (kv.awakening && Number(kv.awakening) > 0) {
					override.awakening = Number(kv.awakening);
				}
				config.avatarOverrides.push(override);
			}
		}
	}

	// === Parse weapons ===
	const weaponContent = findSectionContent(cleanText, "weapons");
	if (weaponContent) {
		const entries = parseZonEntries(weaponContent);
		for (const entry of entries) {
			const kv = parseZonEntryKv(entry);
			if (kv.id) {
				const rawEnumName = stripDot(kv.id);
				// Apply reverse mapping: server enum name -> local config id
				const enumName = ZON_ENUM_EXCEPTIONS_REVERSE[rawEnumName] ?? rawEnumName;
				// Try to convert weapon enum name back to numeric id
				const weapon = getWeaponList().find(
					(w) => w.enumName && w.enumName === enumName
				);
				// Skip numeric IDs that don't match any known weapon
				if (!weapon && /^\d+$/.test(enumName)) continue;
				config.configWeapons.push({
					id: weapon ? String(weapon.id) : enumName,
					level: Number(kv.level) || 60,
					star: Number(kv.star) || 5,
					refine: Number(kv.refine) || 1,
					enumName,
				});
			}
		}
	}

	// === Parse equipment (discs) ===
	const equipContent = findSectionContent(cleanText, "equipment");
	if (equipContent) {
		const entries = parseZonEntries(equipContent);
		for (const entry of entries) {
			const kv = parseZonEntryKv(entry);
			if (kv.id) {
				const equipId = Number(kv.id);
				if (!Number.isFinite(equipId)) continue;
				const disc: DiscEntry = {
					id: equipId,
					level: Number(kv.level) || 15,
					star: Number(kv.star) || 5,
					mainStat: { statId: 11102, value: 750, add: 0 },
					subStats: [],
					collapsed: false,
				};

				// Parse properties
				const propsContent = findSectionContent(entry, "properties");
				if (propsContent) {
					const propEntries = parseZonEntries(propsContent);
					for (let pi = 0; pi < propEntries.length; pi++) {
						const pkv = parseZonEntryKv(propEntries[pi]);
						const statId = Number(pkv.key) || 11102;
						const value = Number(pkv.base_value) || 0;
						const rawAdd = Number(pkv.add_value) || 0;
						const add = Math.max(0, rawAdd - 1);
						if (pi === 0) {
							disc.mainStat = { statId, value, add };
						} else {
							disc.subStats.push({ statId, value, add });
						}
					}
				}

				config.equipment.push(disc);
			}
		}
	}

	// === Parse hadal_zone_entrances ===
	const zoneContent = findSectionContent(cleanText, "hadal_zone_entrances");
	if (zoneContent) {
		const entries = parseZonEntries(zoneContent);
		for (const entry of entries) {
			const kv = parseZonEntryKv(entry);
			if (kv.id && kv.zone) {
				const zoneName = stripDot(kv.id);
				const zoneVal = Number(kv.zone);
				if (zoneName === "hadal_zone_scheduled") config.shiyuZone = zoneVal;
				else if (zoneName === "boss_challenge_normal") config.daZone = zoneVal;
				else if (zoneName === "boss_challenge_hard") config.daHardZone = zoneVal;
			}
		}
	}


	return config;
}


