/**
 * config.zon → USD_*.bin  PLAYERSAVE ENCODER (TypeScript port)
 *
 * Ported from tools/encode_zon.py. Encodes ZON config text
 * directly to USD_666.bin binary without needing Python.
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

// ─── wire types ───
const WIRE_VARINT = 0;
const WIRE_LEN = 2;

// ─── schema ───
type SchemaType = string | string[];
type SchemaEntry = [number, string, SchemaType];

const SCHEMA: Record<string, SchemaEntry[]> = {
	PlayerSave: [
		[1, "basic", "?BasicSave"], [2, "avatar", "?AvatarSave"],
		[3, "weapon", "?WeaponSave"], [4, "equip", "?EquipSave"],
		[5, "buddy", "?BuddySave"], [6, "hall", "?HallSave"],
		[8, "main_city_time", "?MainCityTimeSave"],
		[9, "quick_team", "?QuickTeamSave"],
		[10, "player_accessory", "?PlayerAccessorySave"],
	],
	BasicSave: [[1, "level", "u32"], [2, "avatar_id", "u32"], [3, "control_avatar_id", "u32"], [4, "control_guise_avatar_id", "u32"], [5, "control_guise_avatar_skin_id", "u32"]],
	AvatarSave: [[1, "items", ["AvatarItemSave"]]],
	AvatarItemSave: [[1, "id", "u32"], [2, "level", "u32"], [3, "exp", "u32"], [4, "rank", "u32"], [5, "talents", "u32"], [6, "mindscape_tab_state", "u32"], [7, "favorite", "bool"], [8, "skill_levels", ["u32"]], [9, "skin_id", "u32"], [12, "awake_available", "bool"], [13, "awake_enabled", "bool"], [14, "awake_id", "u32"], [16, "show_weapon", "u32"], [10, "weapon_uid", "u32"], [11, "equipment_uids", ["u32"]], [15, "awake_material_count", "u32"]],
	WeaponSave: [[1, "items", ["WeaponItemSave"]]],
	WeaponItemSave: [[1, "uid", "u32"], [2, "id", "u32"], [3, "level", "u32"], [4, "star", "u32"], [5, "refine", "u32"]],
	EquipSave: [[1, "items", ["EquipItemSave"]]],
	EquipItemSave: [[1, "uid", "u32"], [2, "id", "u32"], [3, "level", "u32"], [4, "star", "u32"], [5, "properties", ["EquipProperty"]]],
	EquipProperty: [[1, "key", "u32"], [2, "base_value", "u32"], [3, "add_value", "u32"]],
	BuddySave: [[1, "items", ["BuddyItemSave"]]],
	BuddyItemSave: [[1, "id", "u32"], [2, "level", "u32"], [3, "exp", "u32"], [4, "rank", "u32"], [5, "star", "u32"], [6, "favorite", "bool"], [7, "skill_levels", ["u32"]]],
	HallSave: [[1, "section_id", "u32"], [2, "position_id", "string"], [3, "position_transform", "?Transform"]],
	Transform: [[1, "position", ["f64"]], [2, "rotation", ["f64"]]],
	MainCityTimeSave: [[1, "time_in_minutes", "u32"], [2, "day_of_week", "u32"]],
	QuickTeamSave: [[1, "teams", ["QuickTeamItemSave"]]],
	QuickTeamItemSave: [[1, "name", "string"], [2, "avatar_ids", ["u32"]], [3, "buddy_id", "u32"]],
	PlayerAccessorySave: [[1, "avatars", ["PlayerAccessoryItemSave"]]],
	PlayerAccessoryItemSave: [[1, "id", "u32"], [2, "skin_id", "u32"]],
};

const SCALAR_WIRE: Record<string, number> = { u32: 0, i32: 0, u64: 0, i64: 0, bool: 0, f32: 5, f64: 1, string: 2 };

// ─── helpers ───

function varint(buf: number[], v: number): void {
	v >>>= 0; // ensure unsigned 32-bit
	while (true) {
		const b = v & 0x7f;
		v >>>= 7;
		buf.push(b | (v ? 0x80 : 0));
		if (!v) break;
	}
}

function u64varint(buf: number[], v: number): void {
	// For JavaScript, numbers are 53-bit. v is expected to be < 2^53.
	// We handle up to 10 bytes (max for 64-bit varint).
	while (true) {
		const b = v & 0x7f;
		v >>>= 7;
		buf.push(b | (v ? 0x80 : 0));
		if (!v) break;
	}
}

function encScalar(buf: number[], val: unknown, typ: string): void {
	switch (typ) {
		case "u32":
		case "i32":
			varint(buf, Number(val));
			break;
		case "u64":
		case "i64":
			u64varint(buf, Number(val));
			break;
		case "bool":
			varint(buf, val ? 1 : 0);
			break;
		case "f32": {
			const b = new ArrayBuffer(4);
			new Float32Array(b)[0] = Number(val);
			buf.push(...new Uint8Array(b));
			break;
		}
		case "f64": {
			const b = new ArrayBuffer(8);
			new Float64Array(b)[0] = Number(val);
			buf.push(...new Uint8Array(b));
			break;
		}
		case "string": {
			const e = Buffer.from(String(val), "utf-8");
			varint(buf, e.length);
			buf.push(...e);
			break;
		}
	}
}

function encodeStruct(data: Record<string, unknown>, name: string): Buffer {
	const buf: number[] = [];
	const fields = SCHEMA[name];
	if (!fields) throw new Error(`Unknown schema: ${name}`);

	for (const [fn, fname, ts] of fields) {
		const v = data[fname as keyof typeof data];
		if (v === undefined || v === null) continue;

		if (Array.isArray(ts)) {
			// repeated field
			const et = ts[0];
			const arr = v as unknown[];
			for (const item of arr) {
				if (et in SCALAR_WIRE) {
					varint(buf, (fn << 3) | SCALAR_WIRE[et]);
					encScalar(buf, item, et);
				} else {
					const inner = encodeStruct(item as Record<string, unknown>, et);
					varint(buf, (fn << 3) | 2);
					varint(buf, inner.length);
					buf.push(...inner);
				}
			}
		} else if (typeof ts === "string" && ts.startsWith("?")) {
			// optional struct
			const inner = encodeStruct(v as Record<string, unknown>, ts.slice(1));
			varint(buf, (fn << 3) | 2);
			varint(buf, inner.length);
			buf.push(...inner);
		} else if (typeof ts === "string" && ts in SCALAR_WIRE) {
			// scalar
			varint(buf, (fn << 3) | SCALAR_WIRE[ts]);
			encScalar(buf, v, ts);
		} else if (typeof ts === "string") {
			// named struct
			const inner = encodeStruct(v as Record<string, unknown>, ts);
			varint(buf, (fn << 3) | 2);
			varint(buf, inner.length);
			buf.push(...inner);
		}
	}

	return Buffer.from(buf);
}

// ─── public API ───

/**
 * Encode a parsed ZON config dict to binary save data.
 * @param data Parsed ZON object (must be a dict, i.e. .{...})
 * @param schemaName Top-level schema name (default "PlayerSave")
 * @returns Buffer with binary encoded data
 */
export function encodeConfig(data: Record<string, unknown>, schemaName: string = "PlayerSave"): Buffer {
	return encodeStruct(data, schemaName);
}

/**
 * Read a config.zon file, parse it, and encode to binary.
 * @param configPath Path to config.zon file
 * @param binPath Output path for USD_*.bin
 */
export function encodeConfigFileSync(configPath: string, binPath: string): void {
	const text = readFileSync(configPath, "utf-8");
	const data = parseZonConfig(text);
	const buf = encodeConfig(data);
	writeFileSync(binPath, buf);
}

// ─── embedded ZON parser (minimal, struct/dict only) ───

class ZonParser {
	private t: string;
	private p: number = 0;

	constructor(text: string) {
		this.t = text;
	}

	skip(): void {
		while (this.p < this.t.length) {
			const c = this.t[this.p];
			if (" \t\r\n,".includes(c)) {
				this.p++;
			} else if (c === "/" && this.p + 1 < this.t.length && this.t[this.p + 1] === "/") {
				const nl = this.t.indexOf("\n", this.p);
				this.p = nl < 0 ? this.t.length : nl + 1;
			} else {
				break;
			}
		}
	}

	parseValue(): unknown {
		this.skip();
		if (this.p >= this.t.length) throw new Error("Unexpected EOF");
		const c = this.t[this.p];
		if (c === '"') return this.readString();
		if (c === "-" || c === "+" || c === "." || (c >= "0" && c <= "9")) return this.readNumber();
		if (c === "." && this.p + 1 < this.t.length && this.t[this.p + 1] === "{") {
			this.p += 2;
			return this.readBody();
		}
		if (this.t.startsWith("true", this.p)) { this.p += 4; return true; }
		if (this.t.startsWith("false", this.p)) { this.p += 5; return false; }
		if (this.t.startsWith("null", this.p)) { this.p += 4; return null; }
		if (c === ".") {
			const start = this.p;
			while (this.p < this.t.length && /[a-zA-Z0-9._]/.test(this.t[this.p])) this.p++;
			return this.t.slice(start, this.p);
		}
		throw new Error(`Unexpected '${c}'`);
	}

	private readString(): string {
		this.p++; // skip opening "
		const r: string[] = [];
		while (this.p < this.t.length) {
			const c = this.t[this.p];
			if (c === '"') { this.p++; return r.join(""); }
			if (c === "\\") {
				this.p++;
				const m: Record<string, string> = { n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\" };
				r.push(m[this.t[this.p]] ?? this.t[this.p]);
			} else {
				r.push(c);
			}
			this.p++;
		}
		throw new Error("Unterminated string");
	}

	private readNumber(): unknown {
		const start = this.p;
		if (this.t[this.p] === "-" || this.t[this.p] === "+") this.p++;
		if (this.p + 1 < this.t.length && this.t[this.p] === "0" && (this.t[this.p + 1] === "x" || this.t[this.p + 1] === "X")) {
			this.p += 2;
			while (this.p < this.t.length && /[0-9a-fA-F]/.test(this.t[this.p])) this.p++;
			return parseInt(this.t.slice(start, this.p), 16);
		}
		while (this.p < this.t.length && this.t[this.p] >= "0" && this.t[this.p] <= "9") this.p++;
		let isFloat = false;
		if (this.p < this.t.length && this.t[this.p] === ".") {
			isFloat = true;
			this.p++;
			while (this.p < this.t.length && this.t[this.p] >= "0" && this.t[this.p] <= "9") this.p++;
		}
		const raw = this.t.slice(start, this.p);
		if (this.p < this.t.length && (this.t[this.p] === "." || this.t[this.p] === "_")) {
			// dot enum like .Weapon_A_1011, treat as string
			return raw;
		}
		return isFloat ? parseFloat(raw) : parseInt(raw, 10);
	}

	private readBody(): unknown {
		this.skip();
		if (this.p < this.t.length && this.t[this.p] === "}") { this.p++; return {}; }
		return this.isStruct() ? this.readFields() : this.readItems();
	}

	private isStruct(): boolean {
		const saved = this.p;
		try {
			this.skip();
			if (this.p >= this.t.length) return false;
			if (this.t[this.p] !== ".") return false;
			if (this.p + 1 < this.t.length && this.t[this.p + 1] === "{") return false;
			let ie = this.p + 1;
			while (ie < this.t.length && /[a-zA-Z0-9_]/.test(this.t[ie])) ie++;
			if (ie === this.p + 1) return false;
			let pk = ie;
			while (pk < this.t.length && " \t\r\n".includes(this.t[pk])) pk++;
			return pk < this.t.length && this.t[pk] === "=";
		} finally {
			this.p = saved;
		}
	}

	private readFields(): Record<string, unknown> {
		const r: Record<string, unknown> = {};
		while (this.p < this.t.length) {
			this.skip();
			if (this.p >= this.t.length) throw new Error("Unterminated struct");
			if (this.t[this.p] === "}") { this.p++; return r; }
			if (this.t[this.p] === ".") this.p++;
			const ks = this.p;
			while (this.p < this.t.length && /[a-zA-Z0-9_]/.test(this.t[this.p])) this.p++;
			const k = this.t.slice(ks, this.p);
			if (!k) throw new Error("Empty field name");
			this.expect("=");
			r[k] = this.parseValue();
		}
		throw new Error("Unterminated struct");
	}

	private readItems(): unknown[] {
		const r: unknown[] = [];
		while (this.p < this.t.length) {
			this.skip();
			if (this.p >= this.t.length) throw new Error("Unterminated array");
			if (this.t[this.p] === "}") { this.p++; return r; }
			r.push(this.parseValue());
		}
		throw new Error("Unterminated array");
	}

	private expect(ch: string): void {
		this.skip();
		if (this.p >= this.t.length || this.t[this.p] !== ch) {
			throw new Error(`Expected '${ch}' at pos ${this.p}`);
		}
		this.p++;
	}
}

function parseZonConfig(text: string): Record<string, unknown> {
	const parser = new ZonParser(text);
	const v = parser.parseValue();
	parser.skip();
	if (parser.p < parser.t.length) {
		throw new Error("Unexpected trailing content");
	}
	if (typeof v !== "object" || v === null || Array.isArray(v)) {
		throw new Error("Root must be .{...}");
	}
	return v as Record<string, unknown>;
}
