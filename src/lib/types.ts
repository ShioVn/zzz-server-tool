export interface Agent {
	id: number;
	name?: string;
	audio_event_replace_param: string;
	zonEnum: string;
	awakeningId?: number;
	icon?: string;
	element?: number;
	weaponType?: number;
	hitType?: number;
	camp?: number;
	rank?: number;
}

export interface Weapon {
	id: number;
	name?: string;
	icon?: string;
	enumName?: string;
	rank?: number;
	type?: number;
	sub?: string;
}

export interface Disc {
	id: number;
	name?: string;
	icon?: string;
}

export interface Endgame {
	id: number;
	name: string;
	type: string;
	subType: string;
	status: string;
	hardMode: boolean;
	description: string;
	zoneId: number;
	layerCount: number;
	begin?: string;
	end?: string;
	bossIcons: string[];
}

export interface StatEntry {
	statId: number;
	value: number;
	add?: number;
}

export interface AvatarOverride {
	id: string;
	level: number;
	rank: number;
	talents: number;
	awakening?: number;
	enumName?: string;
}

export interface WeaponConfig {
	id: string;
	level: number;
	star: number;
	refine: number;
	enumName?: string;
}

export interface DiscEntry {
	id: number;
	level: number;
	star: number;
	mainStat: StatEntry;
	subStats: StatEntry[];
	collapsed?: boolean;
}

export interface ImportHighlights {
	equipment: boolean;
	weapons: boolean;
	avatars: boolean;
}

export interface ZonConfig {
	avatarOverrides: AvatarOverride[];
	configWeapons: WeaponConfig[];
	equipment: DiscEntry[];
	shiyuZone?: number;
	daZone?: number;
	daHardZone?: number;
	importHighlights: ImportHighlights;
}

export interface ServerStatus {
	running: boolean;
	pid: number | null;
	logs: string;
}

export interface HoyoSdkStatus {
	running: boolean;
	pid: number | null;
}

export interface ApiResponse<T = unknown> {
	success: boolean;
	message?: string;
	data?: T;
}

export type Language = "en" | "vi";
export type ActiveTab = "agents" | "server" | "weapons" | "discs" | "endgames" | "remielle";

export interface AppState {
	activeTab: ActiveTab;
	language: Language;
	search: string;
	weaponSearch: string;
	discSearch: string;
	endgameSearch: string;
	endgameType: string;
	remiellePath: string;
	selectedAgents: Record<string, number[]>;
	selectedWeapons: Record<string, number[]>;
	zonConfig: ZonConfig;
}
