<script lang="ts">
	import { getState } from "$lib/stores/app.svelte";
	import { DEFAULT_PLAYER_UID } from "$lib/config";
	import { runControlCommand } from "$lib/stores/server.svelte";
	import { t } from "$lib/i18n/index.svelte";
	import { showToast } from "$lib/stores/toast.svelte";
	import type { AvatarOverride } from "$lib/types";
	import { getAgentBaseStats } from "$lib/data/agents.svelte";
	import { getDiscs } from "$lib/data/discs.svelte";
	import { getWeapons } from "$lib/data/weapons.svelte";
	import { getWeaponDetail, getAssetUrl } from "$lib/api/zzz-api";
	import { getElementColor, SLOT_COLORS, WEAPON_TYPE_NAMES, WEAPON_TYPE_ICONS, getRankIconSvg } from "$lib/constants";
	import { ensureDiscSetDetail, getDiscSetDetail, getDiscSetName } from "$lib/data/discSets.svelte";
	import {
		discStatOptions, getStatName, buildDiscEquipId, discMainStatOptionsBySlot,
		getDiscSlotFromEquipId, getDiscSuitIdFromEquipId, getDefaultDiscMainStat,
		getDiscEntrySubStats, getDiscStatDefaultValue, getMainStatDisplayValue,
		getSubStatDisplayValue, getDiscMainStatOptions, clampNumber,
	} from "$lib/utils/disc";
	import {
		getDiscMainStatRealValue,
		applyWeaponToStats, applyDiscMainStat, applySubstats,
		applySetBonuses, computeFinalStats,
	} from "$lib/stats/calculations";
	import type { FinalStats } from "$lib/stats/calculations";
	import type { StatEntry, DiscEntry } from "$lib/types";
	import type { Agent } from "$lib/types";
	import { getAgents } from "$lib/data/agents.svelte";

	const app = getState();
	let { agent, onClose }: { agent: Agent; onClose: () => void } = $props();

	// ── Base stats ──
	let baseStats = $state<FinalStats | null>(null);
	let playerUid = $state(DEFAULT_PLAYER_UID);
	let loading = $state(true);
	let level = $state(60);
	let talents = $state(6);

	// ── Weapon ──
	let selectedWeaponId = $state<number | null>(null);
	let selectedRefine = $state(1);
	let weaponFlatAtk = $state(0);
	let weaponSubStatId = $state(0);
	let weaponSubStatValue = $state(0);
	let weaponDetailData = $state<any>(null);

	// ── Discs: 6 slots ──
	type DiscSlot = { equipId: number; mainStatId: number; subStats: StatEntry[] };
	let discSlots = $state<DiscSlot[]>(
		Array.from({ length: 6 }, () => ({ equipId: 0, mainStatId: 0, subStats: [] }))
	);

	// Track what's been created on the server to avoid duplicates on re-save
	let committedWeaponId = $state<number | null>(null);
	let committedDiscIds = $state<Set<number>>(new Set());

	// ── Picker overlay ──
	let pickerSlotIndex = $state<number | null>(null);
	let pickerSearch = $state("");
	let showCatalog = $state(false);

	// ── Add/Edit modal (identical to DiscsTab) ──
	let modalDisc = $state<{ suitId: number; name?: string; icon?: string } | null>(null);
	let modalSlot = $state(1);
	let modalLevel = $state(15);
	let modalStar = $state(5);
	let modalMainStat = $state<StatEntry>({ statId: 11102, value: 750, add: 1 });
	let modalSubStats = $state<StatEntry[]>([]);
	let editIndex = $state<number | null>(null);
	let pendingSlotIndex = $state<number | null>(null);
	let savePending = $state(false);

	// ── Weapon picker state ──
	let showWeaponPicker = $state(false);
	let weaponPickerSearch = $state("");
	let wpActiveType = $state<number | null>(null);
	let wpActiveRank = $state<number | null>(null);

	// ── Derived ──
	const discs = $derived.by(() => getDiscs());
	const weapons = $derived.by(() => getWeapons());
	const agents = $derived.by(() => getAgents());

	// Claimed inventory entry indices by OTHER agents (not current agent).
	// Maps each equipId claim to a specific inventory index so duplicate discs work.
	const claimedEntryIndices = $derived.by<Set<number>>(() => {
		const claimed = new Set<number>();
		const currentId = agent.zonEnum || String(agent.id);
		for (const ao of app.zonConfig.avatarOverrides) {
			// Skip current agent — their discs should remain selectable
			if (ao.id === currentId || ao.id === String(agent.id)) continue;
			if (!ao.discSlotIds?.length) continue;
			for (const equipId of ao.discSlotIds) {
				if (!equipId) continue;
				// Find first unclaimed inventory entry with this equipId
				for (let i = 0; i < app.zonConfig.equipment.length; i++) {
					if (app.zonConfig.equipment[i].id !== equipId) continue;
					if (claimed.has(i)) continue;
					claimed.add(i);
					break;
				}
			}
		}
		return claimed;
	});

	const filteredCatalog = $derived(
		pickerSearch
			? discs.filter((d) => d.name?.toLowerCase().includes(pickerSearch.toLowerCase()))
			: discs
	);

	const filteredWeapons = $derived(
		weapons
			.filter((w) => {
				if (weaponPickerSearch && !w.name?.toLowerCase().includes(weaponPickerSearch.toLowerCase())) return false;
				if (wpActiveType != null && w.type !== wpActiveType) return false;
				if (wpActiveRank != null && w.rank !== wpActiveRank) return false;
				return true;
			})
			.sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
	);

	const weaponSubStatName = $derived<string>(
		weaponDetailData?.rand_property?.name ?? ""
	);

	// Find signature weapon for this agent (code_name like Weapon_S_1591)
	const signatureWeaponId = $derived.by<number | null>(() => {
		if (!agent?.id) return null;
		const prefix = `Weapon_`;
		const match = weapons.find((w) => w.enumName?.startsWith(prefix) && w.enumName.endsWith(`_${agent.id}`));
		return match?.id ?? null;
	});

	function equipSignatureWeapon() {
		const id = signatureWeaponId;
		if (id) {
			selectWeapon(id);
			showToast(t("toast.signatureWeaponEquipped"), "success");
		}
	}

	function selectWeapon(id: number) {
		selectedWeaponId = id;
		selectedRefine = 1;
		// Add to weapon inventory if absent
		const exists = app.zonConfig.configWeapons.find((w) => w.id === String(id));
		if (!exists) {
			const w = weapons.find((w2) => w2.id === id);
			app.zonConfig.configWeapons.push({
				id: String(id),
				level: 60,
				star: 5,
				refine: 1,
				enumName: w?.enumName,
			});
		}
		showWeaponPicker = false;
		weaponPickerSearch = "";
		wpActiveType = null;
		wpActiveRank = null;
	}

	function removeWeapon() {
		selectedWeaponId = null;
		weaponDetailData = null;
		weaponRawData = null;
		weaponFlatAtk = 0;
		weaponSubStatId = 0;
		weaponSubStatValue = 0;
	}

	function saveWeaponConfig() {
		if (!selectedWeaponId) {
			showToast(t("toast.noWeaponSelected"), "error");
			return;
		}
		const w = weapons.find((w2) => w2.id === selectedWeaponId);
		const entry = {
			id: String(selectedWeaponId),
			level: level,
			star: 5,
			refine: selectedRefine,
			enumName: w?.enumName,
		};
		app.zonConfig.configWeapons.push(entry);
		showToast(t("toast.weaponSavedToConfig"), "success");
	}

	const weaponSubStatDisplay = $derived.by<string>(() => {
		if (!weaponDetailData?.rand_property) return "";
		const rp = weaponDetailData.rand_property;
		const isPct = rp.format?.includes("%");
		const val = weaponSubStatValue;
		if (isPct) {
			return val.toFixed(1) + "%";
		}
		return String(Math.round(val));
	});

	const weaponPassiveDesc = $derived.by<string>(() => {
		if (!weaponDetailData?.talents) return "";
		const t = weaponDetailData.talents[String(selectedRefine)];
		if (!t?.desc) return "";
		return t.desc.replace(/<[^>]+>/g, "");
	});

	const suitIds = $derived(discSlots.map((d) => d.equipId).filter(Boolean));

	const computedStats = $derived.by<FinalStats | null>(() => {
		if (!baseStats) return null;
		return computeFinalStats(
			baseStats,
			{ flatAtk: weaponFlatAtk, subStatId: weaponSubStatId, subStatValue: weaponSubStatValue },
			discSlots.map((d) => ({ mainStatId: d.mainStatId, subStats: d.subStats, equipId: d.equipId }))
		);
});

	// ── Lifecycle ──
	let loaded = $state(false);
	$effect(() => {
		loadAgentData();
		if (!loaded) {
			restoreLoadout();
			loaded = true;
		}
	});

	function restoreLoadout() {
		const e = agent.zonEnum || String(agent.id);
		const ao = app.zonConfig.avatarOverrides.find((a) => a.id === e || a.id === String(agent.id));
		if (!ao) return;

		// Restore talents (mindscape) from saved config
		if (ao.talents != null) talents = ao.talents;

		// Restore weapon
		if (ao.weaponId) {
			selectedWeaponId = ao.weaponId;
			selectedRefine = ao.weaponRefine ?? 1;
			committedWeaponId = ao.weaponId; // Mark as already committed
		}

		// Restore discs (fixed 6-element array, 0 = empty)
		if (ao.discSlotIds?.length) {
			const restored = discSlots.map((slot, i) => {
				const id = ao.discSlotIds![i];
				if (!id) return { equipId: 0, mainStatId: 0, subStats: [] };
				const entry = app.zonConfig.equipment.find((d) => d.id === id);
				if (!entry) return { equipId: 0, mainStatId: 0, subStats: [] };
				// Mark disc as already committed (was previously saved to server)
				committedDiscIds.add(id);
				return {
					equipId: id,
					mainStatId: entry.mainStat.statId,
					subStats: entry.subStats.map((s) => ({ ...s })),
				};
			});
			discSlots = restored;
		}
	}

	async function loadAgentData() {
		loading = true;
		try {
			baseStats = await getAgentBaseStats(agent.id, level, 6);
		} catch (e) {
			// Failed to load agent detail
		} finally {
			loading = false;
		}
	}

	// Fetch weapon detail once when weapon ID changes (NOT on level change)
	let weaponRawData = $state<any>(null);
	$effect(() => {
		if (!selectedWeaponId) {
			weaponRawData = null;
			weaponDetailData = null;
			return;
		}
		getWeaponDetail(selectedWeaponId).then((d: any) => {
			weaponRawData = d;
		}).catch(() => {
			weaponRawData = null;
		});
	});

	// Recalc ATK + sub stat when level or raw data changes (no API call)
	$effect(() => {
		const d = weaponRawData;
		if (!d || !selectedWeaponId) {
			weaponFlatAtk = 0;
			weaponSubStatId = 0;
			weaponSubStatValue = 0;
			weaponDetailData = null;
			return;
		}

		weaponDetailData = d;
		const w = weapons.find((x) => x.id === selectedWeaponId);
		const maxAtk = w?.atk ?? 0;
		const baseAtk = d.base_property?.value ?? 0;
		const lv = Math.max(1, Math.min(60, level));

		// ATK scaling
		if (maxAtk > 0 && baseAtk > 0) {
			weaponFlatAtk = Math.round(baseAtk + (maxAtk - baseAtk) * (lv - 1) / 59);
		} else {
			weaponFlatAtk = maxAtk;
		}

		// Sub stat scaling
		const rp = d.rand_property;
		// console.log(`[weapon] rand_property:`, rp);
		if (rp) {
			// Use name2 (display name) if available for mapping, else fallback to name
			const nameForMapping = rp.name2 || rp.name;
			const sid = subStatNameToId(nameForMapping);
			// console.log(`[weapon] substat nameForMapping="${nameForMapping}" → id=${sid}, value=${rp.value}, format=${rp.format}`);
			weaponSubStatId = sid;
			const isPct = rp.format?.includes("%");
			const baseVal = isPct ? rp.value / 100 : rp.value;
			const subScale = 1 + (2.5 - 1) * (lv - 1) / 59;
			weaponSubStatValue = baseVal * subScale;
			// console.log(`[weapon] isPct=${isPct}, baseVal=${baseVal}, subScale=${subScale}, final=${weaponSubStatValue}`);
		} else {
			weaponSubStatId = 0;
			weaponSubStatValue = 0;
			// console.log(`[weapon] no rand_property`);
		}
	});

	// Helper: map sub-stat name (from weapon API) to stat ID
	// Derived from discStatOptions to stay in sync — weapon API names must match option names.
	// Keys that don't appear in discStatOptions are weapon-specific flat ATK (no disc equivalent).
	function subStatNameToId(name: string): number {
		// Try direct match against discStatOptions names first
		const opt = discStatOptions.find((s) => s.name === name);
		if (opt) {
			// console.log(`[subStatNameToId] "${name}" → direct match ${opt.id}`);
			return opt.id;
		}
		// Weapon API uses different names for some stats
		const aliases: Record<string, string> = {
			"Percent ATK": "ATK%",
			"CRIT Rate": "CRIT Rate%",
			"CRIT DMG": "CRIT DMG%",
			"PEN Ratio": "PEN%",
			"Energy Regen": "ER%",
			"Anomaly Mastery": "AM",
			"Anomaly Proficiency": "AP",
		};
		const canonical = aliases[name];
		// console.log(`[subStatNameToId] "${name}" → canonical="${canonical}"`);
		if (canonical) {
			const aliasOpt = discStatOptions.find((s) => s.name === canonical);
			if (aliasOpt) {
				// console.log(`[subStatNameToId] canonical "${canonical}" → ${aliasOpt.id}`);
				return aliasOpt.id;
			}
		}
		// console.log(`[subStatNameToId] "${name}" → NO MATCH (0)`);
		return 0;
	}

	// ── Handlers: picker ──
	function openSlotPicker(slotIdx: number) { pickerSlotIndex = slotIdx; pickerSearch = ""; showCatalog = false; }
	function closeSlotPicker() { pickerSlotIndex = null; pickerSearch = ""; showCatalog = false; }

	function selectInventoryDisc(index: number) {
		if (pickerSlotIndex == null) return;
		const entry = app.zonConfig.equipment[index];
		if (!entry) return;

		// Assign the existing disc directly (only free discs shown in picker)
		discSlots[pickerSlotIndex] = {
			equipId: entry.id,
			mainStatId: entry.mainStat.statId,
			subStats: entry.subStats.map((s) => ({ ...s })),
		};
		discSlots = [...discSlots];
		showToast(t("toast.discEquipped"), "success");
		closeSlotPicker();
	}

	function removeDisc(slotIdx: number) {
		discSlots[slotIdx] = { equipId: 0, mainStatId: 0, subStats: [] };
		discSlots = [...discSlots];
	}

	function getMainStatOptions(slot: number) {
		const allowed = discMainStatOptionsBySlot[slot as keyof typeof discMainStatOptionsBySlot];
		if (!allowed) return [];
		return allowed.map((id) => discStatOptions.find((s) => s.id === id)).filter(Boolean);
	}

	function getDefaultSubStats(mainStatId: number): StatEntry[] {
		const ids = new Set([mainStatId]);
		const r: StatEntry[] = [];
		for (const o of discStatOptions) {
			if (!o.subValues?.length) continue;
			if (!ids.has(o.id) && r.length < 4) { ids.add(o.id); r.push({ statId: o.id, value: 0, add: 0 }); }
		}
		return r;
	}

	// ── Handlers: add/edit modal (same as DiscsTab) ──
	function openAddModal(disc: { id: number; name?: string; icon?: string }) {
		modalDisc = { suitId: disc.id, name: disc.name, icon: disc.icon };
		modalSlot = (pickerSlotIndex ?? 0) + 1;  // Store as 1-6 internally for game
		modalLevel = 15; modalStar = 5;
		const tempId = buildDiscEquipId(disc.id, modalSlot);
		const tmp: DiscEntry = { id: tempId, level: 15, star: 5, mainStat: { statId: 11102, value: 750, add: 1 }, subStats: [] };
		modalMainStat = getDefaultDiscMainStat(tmp);
		modalSubStats = getDiscEntrySubStats({ ...tmp, mainStat: modalMainStat });
		editIndex = null;
	}

	function openEditModal(index: number) {
		const entry = app.zonConfig.equipment[index];
		if (!entry) return;
		const suitId = getDiscSuitIdFromEquipId(entry.id);
		const d = discs.find((x) => x.id === suitId);
		modalDisc = { suitId, name: d?.name, icon: d?.icon };
		modalSlot = getDiscSlotFromEquipId(entry.id);
		modalLevel = entry.level ?? 15; modalStar = entry.star ?? 5;
		modalMainStat = { ...entry.mainStat };
		modalSubStats = entry.subStats.map((s) => ({ ...s }));
		editIndex = index;
	}

	function closeModal() { modalDisc = null; editIndex = null; }

	function handleSlotChange(newSlot: number) {
		modalSlot = newSlot;
		if (!modalDisc) return;
		const tmp: DiscEntry = { id: buildDiscEquipId(modalDisc.suitId, newSlot), level: modalLevel, star: modalStar, mainStat: { statId: 11102, value: 750, add: 1 }, subStats: [] };
		modalMainStat = getDefaultDiscMainStat(tmp);
		modalSubStats = getDiscEntrySubStats({ ...tmp, mainStat: modalMainStat });
	}

	function handleMainStatChange(statId: number) {
		if (!modalDisc) return;
		modalMainStat = { statId, value: getDiscStatDefaultValue(statId), add: 1 };
		const tmp: DiscEntry = { id: buildDiscEquipId(modalDisc.suitId, modalSlot), level: modalLevel, star: modalStar, mainStat: modalMainStat, subStats: [] };
		modalSubStats = getDiscEntrySubStats({ ...tmp, mainStat: modalMainStat });
	}

	function handleSubStatChange(subIndex: number, field: string, value: string) {
		if (!modalDisc) return;
		const nextSubStats = [...modalSubStats];
		if (field === "statId") {
			const newId = Number(value);
			if (newId === modalMainStat.statId) {
				const oldMain = { ...modalMainStat };
				const oldSub = { ...nextSubStats[subIndex] };
				modalMainStat = { statId: oldSub.statId, value: oldSub.value, add: oldSub.add ?? 1 };
				nextSubStats[subIndex] = { statId: oldMain.statId, value: oldMain.value, add: 1 };
			} else {
				const dup = nextSubStats.findIndex((s, i) => i !== subIndex && s.statId === newId);
				if (dup >= 0) {
					const t = { ...nextSubStats[dup] };
					nextSubStats[dup] = { ...nextSubStats[subIndex] };
					nextSubStats[subIndex] = t;
				} else {
					nextSubStats[subIndex] = { statId: newId, value: getDiscStatDefaultValue(newId, "sub"), add: 0 };
				}
			}
		} else if (field === "value") {
			nextSubStats[subIndex] = { ...nextSubStats[subIndex], value: clampNumber(value, 0, 999999, nextSubStats[subIndex].value) };
		} else if (field === "add") {
			nextSubStats[subIndex] = { ...nextSubStats[subIndex], add: clampNumber(value, 0, 5, nextSubStats[subIndex].add ?? 0) };
		}
		modalSubStats = nextSubStats;
	}

	function updateModalSubStat(index: number, patch: Partial<StatEntry>) {
		modalSubStats = modalSubStats.map((sub, i) => (i === index ? { ...sub, ...patch } : sub));
	}

	function saveModalDisc() {
		if (!modalDisc) return;
		const entry: DiscEntry = {
			id: buildDiscEquipId(modalDisc.suitId, modalSlot),
			level: modalLevel, star: modalStar,
			mainStat: { ...modalMainStat },
			subStats: modalSubStats.map((s) => ({ ...s })),
		};
		if (editIndex != null) app.zonConfig.equipment[editIndex] = entry;
		else app.zonConfig.equipment.push(entry);

		// Auto-assign to pending slot
		if (pendingSlotIndex != null) {
			discSlots[pendingSlotIndex] = {
				equipId: entry.id,
				mainStatId: entry.mainStat.statId,
				subStats: entry.subStats.map((s) => ({ ...s })),
			};
			discSlots = [...discSlots];
		}

		showToast(editIndex != null ? t("toast.discUpdated") : t("disc.added"), "success");
		const wasPending = pendingSlotIndex != null;
		closeModal();
		pendingSlotIndex = null;
		if (wasPending) closeSlotPicker();
		// If editing an already-committed disc, mark for re-send on next save
		if (editIndex != null) committedDiscIds.delete(entry.id);
	}

	function removeInventoryDisc(index: number) { app.zonConfig.equipment.splice(index, 1); closeModal(); }

	// ── Save / Remove agent config ──
	async function saveAgent() {
		const e = agent.zonEnum || String(agent.id);
		const existingAo = app.zonConfig.avatarOverrides.find((a) => a.id === e || a.id === String(agent.id));
		let ao: AvatarOverride;
		if (!existingAo) {
			ao = { id: e, agentId: agent.id, level, rank: 6, talents: talents };
			if (agent.awakeningId && talents > 0) ao.awakening = agent.awakeningId;
			app.zonConfig.avatarOverrides.push(ao);
		} else {
			existingAo.agentId = agent.id;
			existingAo.level = level;
			// ponytail: rank=6 is intentionally always max (A6) so server overrides apply full mindscape cinema
			existingAo.rank = 6;
			existingAo.talents = talents;
			if (agent.awakeningId && talents > 0) existingAo.awakening = agent.awakeningId;
			ao = existingAo;
		}

		// Save weapon (null = clear)
		ao.weaponId = selectedWeaponId ?? undefined;
		ao.weaponRefine = selectedWeaponId ? selectedRefine : undefined;

		// Save discs (fixed 6-element array, 0 = empty)
		ao.discSlotIds = discSlots.map((s) => s.equipId);

		try {
			savePending = true;
			const uid = playerUid || DEFAULT_PLAYER_UID;
			// console.log(`[SaveAgent] uid=${uid}, agentId=${agent.id}, level=${level}, talents=${talents}`);
			
			// 1. avatar level
			// console.log(`[CLI] mod-avatar-meta level ${uid} ${agent.id} ${level}`);
			const res1 = await runControlCommand("mod-avatar-meta", ["level", uid, String(agent.id), String(level)]);
			// console.log(`[CLI-Result] level:`, res1);
			
			// 2. avatar rank (ascension)
			// console.log(`[CLI] mod-avatar-meta rank ${uid} ${agent.id} 6`);
			const res2 = await runControlCommand("mod-avatar-meta", ["rank", uid, String(agent.id), "6"]);
			// console.log(`[CLI-Result] rank:`, res2);
			
			// 3. avatar talents (mindscapes)
			// console.log(`[CLI] mod-avatar-meta talents ${uid} ${agent.id} ${talents}`);
			const res3 = await runControlCommand("mod-avatar-meta", ["talents", uid, String(agent.id), String(talents)]);
			// console.log(`[CLI-Result] talents:`, res3);
			
			// 4. avatar awakening
			if (agent.awakeningId && talents > 0) {
				// console.log(`[CLI] mod-avatar-meta awakening ${uid} ${agent.id} ${agent.awakeningId}`);
				const res4 = await runControlCommand("mod-avatar-meta", ["awakening", uid, String(agent.id), String(agent.awakeningId)]);
				// console.log(`[CLI-Result] awakening:`, res4);
			}

			// 5. weapon — skip if already sent
			if (selectedWeaponId && selectedWeaponId !== committedWeaponId) {
				// console.log(`[CLI] create-weapon ${uid} ${selectedWeaponId} ${level} 5 ${selectedRefine}`);
				const resW = await runControlCommand("create-weapon", [uid, String(selectedWeaponId), String(level), "5", String(selectedRefine)]);
				// console.log(`[CLI-Result] weapon:`, resW);
				committedWeaponId = selectedWeaponId;
			}

			// 6. discs — only send NEW or edited ones
			for (const slot of discSlots) {
				if (slot.equipId !== 0 && !committedDiscIds.has(slot.equipId)) {
					const entry = app.zonConfig.equipment.find((d) => d.id === slot.equipId);
					if (entry) {
						const args = [
							uid,
							String(entry.id),
							String(entry.level ?? 15),
							String(entry.star ?? 5),
							String(entry.mainStat.statId),
							String(entry.mainStat.value),
							String(entry.mainStat.add ?? 0)
						];
						for (const sub of entry.subStats) {
							const rolls = (sub.add ?? 0) + 1;
					args.push(String(sub.statId), String(sub.value), String(rolls));
						}
						// console.log(`[CLI] disc entry`, { mainStat: entry.mainStat, subStats: entry.subStats });
						// console.log(`[CLI] create-equip payload`, args);
						const resD = await runControlCommand("create-equip", args);
						// console.log(`[CLI-Result] disc:`, resD);
						committedDiscIds.add(slot.equipId);
					}
				}
			}

			showToast(t("toast.calcSaved"), "success");
			} catch (err) {
				showToast("Failed to apply changes to server: " + String(err), "error");
			} finally {
				savePending = false;
			}

			onClose();
	}
	function removeAgent() {
		const e = agent.zonEnum || String(agent.id);
		const i = app.zonConfig.avatarOverrides.findIndex((a) => a.id === e || a.id === String(agent.id));
		if (i >= 0) { app.zonConfig.avatarOverrides.splice(i, 1); showToast(t("toast.calcRemoved"), "success"); }
		onClose();
	}

	// ── Pure helpers ──
	function getSuitName(eid: number): string { if (!eid) return ""; return discs.find((d) => d.id === Math.floor(eid / 100) * 100)?.name ?? ""; }
	function getSuitIcon(eid: number): string | undefined { if (!eid) return; return discs.find((d) => d.id === Math.floor(eid / 100) * 100)?.icon; }
	function getDiscIconUrl(sid: number): string | undefined { return discs.find((d) => d.id === sid)?.icon; }
	function slotAccent(slot: number): string { return SLOT_COLORS[Math.min(slot - 1, 5)]; }
	function fmtNum(n: number): string { return Number.isFinite(n) ? String(Math.round(n)) : "0"; }
	function fmtPct(n: number): string {
		if (!Number.isFinite(n)) return "0%";
		const v = n * 100;
		return Number.isInteger(v) ? v.toFixed(0) + "%" : v.toFixed(1) + "%";
	}
	function fmtImpact(n: number): string { return Number.isFinite(n) ? String(Math.round(n)) : "0"; }
	function fmtEr(n: number): string { return Number.isFinite(n) ? n.toFixed(2) : "0.00"; }
	function cl(n: number): string { return Number.isFinite(n) ? n.toLocaleString() : "0"; }
	function elName(id: number | undefined): string { const m: Record<number, string> = { 200: "Physical", 201: "Fire", 202: "Ice", 203: "Electric", 204: "Wind", 205: "Ether", 300: "Lumiflux" }; return id != null ? (m[id] ?? "Unknown") : "Unknown"; }
	function wpName(id: number | undefined): string { const m: Record<number, string> = { 1: "Attack", 2: "Stun", 3: "Anomaly", 4: "Support", 5: "Defense", 6: "Rupture" }; return id != null ? (m[id] ?? "Unknown") : "Unknown"; }

	const setBonuses = $derived.by(() => {
		const c: Record<number, number> = {};
		const uniqueSuits = new Set<number>();
		for (const id of suitIds) {
			if (!id) continue;
			const base = Math.floor(id / 100) * 100;
			c[base] = (c[base] || 0) + 1;
			uniqueSuits.add(base);
		}
		// Fetch set details lazily
		for (const sid of uniqueSuits) {
			ensureDiscSetDetail(sid);
		}
		return Object.entries(c).filter(([, v]) => v >= 2).map(([k, v]) => {
			const d = getDiscSetDetail(Number(k));
			return {
				suitName: getDiscSetName(Number(k)),
				pieces: v,
				desc2: d?.desc2 ?? "",
				desc4: d?.desc4 ?? "",
			};
		});
	});
</script>

<!-- ═══════ MAIN PANEL ═══════ -->
{#if loading}
	<div class="overlay" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="presentation">
		<div class="panel"><div class="py-16 text-center text-sm text-slate-400">{t("calc.loading")}</div></div>
	</div>
{:else}
	<div class="overlay" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="presentation">
		<div class="panel" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && onClose()} role="dialog" aria-modal="true" tabindex="0">
			<button class="close-btn" aria-label="Close" onclick={onClose}>✕</button>

			<!-- Header -->
			<div class="header" style="--el:{getElementColor(agent.element)}">
				<div class="avatar-box">
					{#if agent.icon}<img src={agent.icon} alt={agent.name ?? ""} class="avatar" />{/if}
					<div class="rank-badge {(agent.rank ?? 0) >= 4 ? 'rank-s' : 'rank-a'}">{(agent.rank ?? 0) >= 4 ? 'S' : 'A'}</div>
				</div>
				<div class="header-text">
					<h2 class="name">{agent.name ?? `Agent #${agent.id}`}</h2>
					<div class="tags">
						<span class="tag" style="--tc:{getElementColor(agent.element)}">{elName(agent.element)}</span>
						<span class="tag">{wpName(agent.weaponType)}</span>
					</div>
					<div class="controls">
						<label class="ctrl">Lv <select class="sel" bind:value={level}>{#each Array.from({ length: 60 }, (_, i) => i + 1) as lv}<option>{lv}</option>{/each}</select></label>
						<label class="ctrl">Talents <select class="sel" bind:value={talents}>{#each [0, 1, 2, 3, 4, 5, 6] as r}<option>{r}</option>{/each}</select></label>
					</div>
				</div>
			</div>

			<!-- Body: split -->
			<div class="body-split">
				<!-- LEFT: weapon card + 6 disc slots -->
				<div class="left-col">
					<!-- Weapon equip card -->
{#if weaponDetailData}
    {@const wp = weaponDetailData}
    <div class="weapon-card" onclick={() => showWeaponPicker = true} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && (showWeaponPicker = true)}>
        <div class="weapon-card-inner">
            <div class="weapon-card-header">
                <div class="weapon-card-left">
                    {#if wp.code_name}<img src={getAssetUrl(wp.code_name)} alt={wp.name ?? ""} class="weapon-card-icon" />{/if}
                    <div class="weapon-card-name-wrap">
                        <span class="weapon-card-name">{wp.name ?? `Weapon #${selectedWeaponId}`}</span>
                        <span class="weapon-card-rank" class:rank-s={wp.rarity >= 4} class:rank-a={wp.rarity === 3}>{wp.rarity >= 4 ? 'S' : 'A'}</span>
                    </div>
                </div>
                <div class="weapon-card-actions">
                    <span class="weapon-remove" onclick={(e) => { e.stopPropagation(); removeWeapon(); }} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && removeWeapon()} aria-label="Remove">✕</span>
                </div>
            </div>
            <div class="weapon-card-stats">
                <div class="weapon-stat-item"><span class="weapon-stat-label">ATK</span><span class="weapon-stat-value">{weaponFlatAtk.toLocaleString()}</span></div>
                <div class="weapon-stat-item"><span class="weapon-stat-label">{weaponSubStatName}</span><span class="weapon-stat-value">{weaponSubStatDisplay}</span></div>
            </div>
            <div class="weapon-card-passive">
                <span class="weapon-passive-label">Passive</span>
                <span class="weapon-passive-text">{weaponPassiveDesc}</span>
            </div>
            <div class="weapon-card-refine">
                <span class="weapon-refine-label">R</span>
                {#each [1, 2, 3, 4, 5] as r}
                    <span class="ref-btn" class:active={selectedRefine === r} onclick={(e) => { e.stopPropagation(); selectedRefine = r; }} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && (selectedRefine = r)}>{r}</span>
                {/each}
            </div>
        </div>
    </div>
{:else}
    <div class="weapon-card weapon-card-empty" onclick={() => showWeaponPicker = true} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && (showWeaponPicker = true)}>
        <div class="weapon-empty-inner">
            <div class="weapon-empty-icon">⚔</div>
            <div class="weapon-empty-text">Select Weapon</div>
            <div class="weapon-empty-hint">Click to browse</div>
        </div>
    </div>
    <button class="weapon-card weapon-sig-btn" onclick={equipSignatureWeapon} disabled={!signatureWeaponId}>
        <span>⚔</span>
        <span>Signature Weapon</span>
    </button>
{/if}
					<div class="slot-grid">
						{#each discSlots as slot, i}
							{@const sNum = i}
							{@const slotNum = i + 1}
							{@const filled = slot.equipId !== 0}
							<button class="slot-box" class:filled={filled} style="--ac:{slotAccent(slotNum)}" onclick={() => openSlotPicker(i)}>
								<div class="slot-box-inner">
									{#if filled}
										{@const msVal = getDiscMainStatRealValue(slot.mainStatId)}
										{@const msIsFlat = [11103,12103,13103,31203].includes(slot.mainStatId)}
										{@const msStr = msIsFlat ? msVal.toFixed(0) : msVal.toFixed(1) + "%"}
										<div class="slot-card-header">
											<div class="slot-card-left">
												{#if getSuitIcon(slot.equipId)}<img src={getSuitIcon(slot.equipId)} alt="" class="slot-icon" />{/if}
												<span class="slot-set-name">{getSuitName(slot.equipId)}</span>
											</div>
											<span class="slot-remove" onclick={() => removeDisc(i)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && removeDisc(i)} aria-label="Remove">✕</span>
										</div>
										<div class="slot-ms-row">
											<span class="slot-ms-label">{getStatName(slot.mainStatId)}</span>
											<span class="slot-ms-value">{msStr}</span>
										</div>
										<div class="slot-subs">
											{#each slot.subStats as sub}
												{@const perRoll = discStatOptions.find((o) => o.id === sub.statId)?.subValues?.[0] ?? 0}
												{@const totalVal = perRoll * ((sub.add ?? 0) + 1)}
												{@const isFlat = [11103,12103,13103,31203,31402,12202,23203].includes(sub.statId)}
												{@const subStr = isFlat ? totalVal.toFixed(0) : (totalVal/100).toFixed(1)+"%"}
												<div class="slot-sub">
													<span class="slot-sub-name">{getStatName(sub.statId)}</span>
													<span class="slot-sub-val">{subStr}</span>
													<span class="slot-sub-rolls">+{sub.add ?? 0}</span>
												</div>
											{/each}
										</div>
									{:else}
										<div class="slot-empty-wrap">
											<span class="slot-empty-label">S{sNum}</span>
											<div class="slot-empty-plus">+</div>
										</div>
									{/if}
								</div>
							</button>
						{/each}
					</div>
				</div>

				<!-- RIGHT: stats -->
				<div class="right-col">
					{#if baseStats}
						{@const s = computedStats}
						<div class="stats-card">
							<h3 class="sec-title">FINAL STATS</h3>
							<div class="stat-list">
								<div class="stat-line"><span class="sl">HP</span><span class="sv">{cl(s?.hp ?? baseStats.hp)}</span></div>
								<div class="stat-line"><span class="sl">ATK</span><span class="sv">{cl(s?.atk ?? baseStats.atk)}</span></div>
								<div class="stat-line"><span class="sl">DEF</span><span class="sv">{cl(s?.def ?? baseStats.def)}</span></div>
								<div class="stat-divider"></div>
								<div class="stat-line"><span class="sl">Impact</span><span class="sv">{fmtImpact(s?.impact ?? baseStats.impact)}</span></div>
								<div class="stat-line"><span class="sl">CRIT Rate</span><span class="sv">{fmtPct(s?.critRate ?? baseStats.critRate)}</span></div>
								<div class="stat-line"><span class="sl">CRIT DMG</span><span class="sv">{fmtPct(s?.critDamage ?? baseStats.critDamage)}</span></div>
								<div class="stat-line"><span class="sl">Anomaly Mastery</span><span class="sv">{fmtNum(s?.anomalyMastery ?? baseStats.anomalyMastery)}</span></div>
								<div class="stat-line"><span class="sl">Anomaly Proficiency</span><span class="sv">{fmtNum(s?.anomalyProficiency ?? baseStats.anomalyProficiency)}</span></div>
								<div class="stat-line"><span class="sl">PEN Ratio</span><span class="sv">{fmtPct(s?.penPercent ?? baseStats.penPercent)}</span></div>
								<div class="stat-line"><span class="sl">Energy Regen</span><span class="sv">{fmtEr(s?.energyRegen ?? baseStats.energyRegen)}</span></div>
							</div>
						</div>
					{/if}
					{#if setBonuses.length > 0}
						<div class="set-card">
							<h3 class="sec-title">SET BONUSES</h3>
							{#each setBonuses as set}
								<div class="set-block">
									<span class="set-name">{set.suitName}</span>
									<div class="set-row"><span class="check">✓</span><span class="set-desc">(2) {set.desc2}</span><span class="badge-set">+stat</span></div>
									{#if set.pieces >= 4}<div class="set-row"><span class="info">ℹ</span><span class="set-desc">(4) {set.desc4}</span><span class="badge-combat">combat</span></div>{/if}
								</div>
							{/each}
						</div>
					{/if}
					<div class="footer-col">
						<button class="btn btn-remove" onclick={removeAgent}>{t("calc.removeAgent")}</button>
						<button class="btn btn-primary" onclick={saveAgent} disabled={savePending}>
							{#if savePending}
								<svg class="h-4 w-4 mr-2 inline-block animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" stroke-width="3" stroke-opacity="0.25"></circle><path d="M22 12a10 10 0 0 1-10 10" stroke-width="3"></path></svg>
							{/if}
							{t("calc.saveAgent")}
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- ═══════ PICKER OVERLAY: inventory + catalog ═══════ -->
{#if pickerSlotIndex != null}
	<div class="overlay picker-z" onclick={closeSlotPicker} onkeydown={(e) => e.key === 'Escape' && closeSlotPicker()} role="presentation">
		<div class="picker-panel" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && closeSlotPicker()} role="dialog" aria-modal="true" tabindex="0">
			<div class="picker-head">
			<h3 class="picker-title">Slot {pickerSlotIndex} — Select Disc</h3>
			</div>

			{#if !showCatalog}
				<!-- ══ INVENTORY VIEW (same layout as DiscsTab) ══ -->
				<div class="picker-actions">
					<input type="search" class="search-input" placeholder="Search inventory..." bind:value={pickerSearch} />
					<span class="text-[10px] text-slate-500">{app.zonConfig.equipment.length} discs</span>
				</div>
				<div class="picker-inv-scroll">
					<div class="inv-grid">
						{#each app.zonConfig.equipment as entry, i}
							{@const slotMatch = getDiscSlotFromEquipId(entry.id) === (pickerSlotIndex ?? 0) + 1}
							{@const searchMatch = !pickerSearch || (getSuitName(entry.id) ?? "").toLowerCase().includes(pickerSearch.toLowerCase())}
							{@const freeDisc = !claimedEntryIndices.has(i)}
							{#if slotMatch && searchMatch && freeDisc}
								{@const suitId = getDiscSuitIdFromEquipId(entry.id)}
								{@const slot = getDiscSlotFromEquipId(entry.id)}
								{@const displaySlot = slot - 1}
								{@const accent = slotAccent(slot)}
								{@const icon = getDiscIconUrl(suitId)}
								<button class="inv-card" style="--card-accent: {accent}" onclick={() => selectInventoryDisc(i)}>
									<div class="inv-slot-badge" style="background:{accent}">S{displaySlot}</div>
									<div class="inv-icon-wrap">
										{#if icon}<img src={icon} alt={getSuitName(entry.id)} class="inv-icon" loading="lazy" />
										{:else}<div class="inv-icon-fallback">{(getSuitName(entry.id) || "?").charAt(0)}</div>{/if}
									</div>
									<div class="inv-header">
										<p class="inv-name">{getSuitName(entry.id)}</p>
										<div class="inv-meta"><span class="inv-level">Lv.{entry.level ?? 15}</span><span class="inv-star">{'★'.repeat(entry.star ?? 5)}</span></div>
									</div>
									<div class="inv-mainstat">
										<span class="inv-stat-label">{getStatName(entry.mainStat.statId)}</span>
										<span class="inv-stat-value">{getMainStatDisplayValue(entry.mainStat)}</span>
									</div>
									{#if entry.subStats?.length}
										<div class="inv-substats">
											{#each entry.subStats.slice(0, 4) as sub}
												<div class="inv-substat">
													<span class="inv-sub-label">{getStatName(sub.statId)}</span>
													<span class="inv-sub-value">{getSubStatDisplayValue(sub)}</span>
													{#if (sub.add ?? 0) > 0}<span class="inv-sub-roll">+{sub.add}</span>{/if}
												</div>
											{/each}
										</div>
									{/if}
								</button>
							{/if}
						{/each}
						<button class="inv-card inv-add-card" onclick={() => { showCatalog = true; pickerSearch = ""; }}>
							<div class="inv-add-icon">+</div>
							<p class="inv-add-text">Add New Disc</p>
						</button>
					</div>
				</div>
			{:else}
				<!-- ══ CATALOG VIEW ══ -->
				<div class="picker-actions">
					<input type="search" class="search-input" placeholder="Search discs..." bind:value={pickerSearch} />
					<button class="back-btn" onclick={() => { showCatalog = false; pickerSearch = ""; }}>← Back</button>
				</div>
				<div class="picker-inv-scroll">
					<div class="disc-grid">
						{#each filteredCatalog as disc}
							<button class="catalog-card" onclick={() => { showCatalog = false; pendingSlotIndex = pickerSlotIndex; openAddModal(disc); }}>
								<div class="catalog-card-glow"></div>
								{#if disc.icon}<img src={disc.icon} alt={disc.name ?? String(disc.id)} class="catalog-icon" loading="lazy" />
								{:else}<div class="catalog-icon-fallback">?</div>{/if}
								<div class="catalog-info"><p class="catalog-name">{disc.name ?? `Set #${disc.id}`}</p><p class="catalog-id">ID {disc.id}</p></div>
								<div class="catalog-add-hint">
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
								</div>
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- ═══════ ADD/EDIT MODAL (same as DiscsTab) ═══════ -->
{#if modalDisc}
	{@const accent = slotAccent(modalSlot)}
	{@const displayModalSlot = modalSlot - 1}
	<div class="modal-overlay" onclick={closeModal} onkeydown={(e) => e.key === 'Escape' && closeModal()} role="presentation">
		<div class="modal-panel" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && closeModal()} role="dialog" aria-modal="true" aria-label="Configure disc" tabindex="0">
			<button class="modal-close" aria-label="Close" onclick={closeModal}>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
			</button>
			<div class="modal-header" style="--accent: {accent}">
				<div class="modal-icon-wrap">
					{#if modalDisc.icon}<img src={modalDisc.icon} alt={modalDisc.name ?? ""} class="modal-icon" />
					{:else}<div class="modal-icon-fallback">{(modalDisc.name ?? "?").charAt(0)}</div>{/if}
					<div class="modal-slot-badge" style="background:{accent}">S{displayModalSlot}</div>
				</div>
				<div class="modal-title-group">
					<h2 class="modal-name">{modalDisc.name ?? `Disc Set #${modalDisc.suitId}`}</h2>
					<p class="modal-subtitle">Set ID: {modalDisc.suitId} &middot; {editIndex != null ? "Editing" : "Adding"}</p>
				</div>
			</div>
			<div class="modal-body">
				<div class="modal-row-2">
					<div class="field-group">
						<span id="modal-slot-label" class="field-label">Slot</span>
						<div class="slot-selector" aria-labelledby="modal-slot-label" role="radiogroup">
							{#each [1, 2, 3, 4, 5, 6] as s}
								{@const displaySlot = s - 1}
								<button class="slot-btn" class:active={modalSlot === s} style={modalSlot === s ? `--btn-accent: ${slotAccent(s)}` : ""} onclick={() => handleSlotChange(s)}>{displaySlot}</button>
							{/each}
						</div>
					</div>
					<div class="field-group">
						<span class="field-label">Level</span>
						<div class="level-display">Lv.15</div>
					</div>
				</div>
				<div class="field-group">
					<label for="modal-mainstat" class="field-label">Main Stat</label>
					<div class="mainstat-row">
						<select id="modal-mainstat" class="field-input modal-select flex-1" value={modalMainStat.statId} onchange={(e) => handleMainStatChange(Number((e.target as HTMLSelectElement).value))}>
							{#each getDiscMainStatOptions({ id: buildDiscEquipId(modalDisc.suitId, modalSlot), level: modalLevel, star: modalStar, mainStat: modalMainStat, subStats: [] }) as opt}
								<option value={opt.id}>{opt.name}</option>
							{/each}
						</select>
						<input id="modal-mainstat-value" type="number" class="field-input !w-28" value={modalMainStat.value} oninput={(e) => { modalMainStat = { ...modalMainStat, value: clampNumber((e.target as HTMLInputElement).value, 0, 999999, modalMainStat.value) }; }} />
					</div>
				</div>
				<div class="field-group">
					<span id="modal-substats-label" class="field-label">Sub Stats</span>
					<div class="substats-grid" aria-labelledby="modal-substats-label">
						{#each modalSubStats as sub, si}
							<div class="substat-row">
								<select id={"modal-substat-" + si + "-stat"} class="field-input modal-select flex-1" value={sub.statId} onchange={(e) => handleSubStatChange(si, "statId", (e.target as HTMLSelectElement).value)}>
									{#each discStatOptions.filter((s) => s.subValues?.length && (s.id === sub.statId || (s.id !== modalMainStat.statId && !modalSubStats.find((x, i) => i !== si && x.statId === s.id)))) as opt}
										<option value={opt.id}>{opt.name}</option>
									{/each}
								</select>
								<input type="number" class="field-input !w-20" value={sub.value} oninput={(e) => { updateModalSubStat(si, { value: clampNumber((e.target as HTMLInputElement).value, 0, 999999, sub.value ?? 0) }); }} />
								<select class="field-input !w-16" value={sub.add ?? 0} onchange={(e) => { updateModalSubStat(si, { add: clampNumber((e.target as HTMLSelectElement).value, 0, 5, sub.add ?? 0) }); }}>
									{#each [0, 1, 2, 3, 4, 5] as a}<option value={a}>+{a}</option>{/each}
								</select>
							</div>
						{/each}
					</div>
				</div>
			</div>
			<div class="modal-footer">
				{#if editIndex != null}
					<button class="footer-btn remove-btn" onclick={() => removeInventoryDisc(editIndex!)}>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c-.84 0-1.673.025-2.5.075V3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25v.325C11.673 4.025 10.84 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" /></svg>
						Remove
					</button>
				{/if}
				<button class="footer-btn primary-btn" onclick={saveModalDisc}>{editIndex != null ? "Update" : "Add to Config"}</button>
			</div>
		</div>
	</div>
{/if}

<!-- ═══════ WEAPON PICKER ═══════ -->
{#if showWeaponPicker}
	<div class="overlay picker-z" onclick={() => { showWeaponPicker = false; weaponPickerSearch = ""; wpActiveType = null; wpActiveRank = null; }} onkeydown={(e) => e.key === 'Escape' && (showWeaponPicker = false)} role="presentation">
		<div class="picker-panel" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && (showWeaponPicker = false)} role="dialog" aria-modal="true" tabindex="0">
			<div class="picker-head">
				<h3 class="picker-title">Select Weapon</h3>
				<button class="close-btn" aria-label="Close" onclick={() => { showWeaponPicker = false; weaponPickerSearch = ""; wpActiveType = null; wpActiveRank = null; }}>✕</button>
			</div>
			<div class="picker-actions">
				<input type="search" class="search-input" placeholder="Search weapons..." bind:value={weaponPickerSearch} />
			</div>
			<div class="picker-filters">
				{#each [1,2,3,4,5,6] as t}
					<button class="chip-filter" class:active={wpActiveType === t} onclick={() => wpActiveType = wpActiveType === t ? null : t}>
						<img src={getAssetUrl(WEAPON_TYPE_ICONS[t])} alt="" class="h-4 w-4" />
						{WEAPON_TYPE_NAMES[t]}
					</button>
				{/each}
				<div class="w-px h-5 bg-slate-700/50 mx-1"></div>
				<button class="chip-filter" class:active={wpActiveRank === 4} onclick={() => wpActiveRank = wpActiveRank === 4 ? null : 4}>
					<img src={getRankIconSvg(true)} alt="S" class="h-4 w-4" /> S
				</button>
				<button class="chip-filter" class:active={wpActiveRank === 3} onclick={() => wpActiveRank = wpActiveRank === 3 ? null : 3}>
					<span class="font-bold">A</span>
				</button>
				{#if wpActiveType != null || wpActiveRank != null}
					<button class="chip-filter text-rose-300 border-rose-700/40" onclick={() => { wpActiveType = null; wpActiveRank = null; }}>
						✕ Clear
					</button>
				{/if}
			</div>
			<div class="picker-inv-scroll">
				<div class="weapon-picker-grid">
					{#each filteredWeapons as w (w.id)}
						{@const isActive = selectedWeaponId === w.id}
						<button
							class="weapon-picker-card"
							class:active={isActive}
							class:rank-s={w.rank === 4}
							class:rank-a={w.rank === 3}
							onclick={() => selectWeapon(w.id)}
						>
							<div class="weapon-picker-rank" class:rank-s={w.rank === 4} class:rank-a={w.rank === 3}>
								{w.rank === 4 ? 'S' : 'A'}
							</div>
							{#if w.icon}
								<img src={w.icon} alt={w.name ?? String(w.id)} class="weapon-picker-icon" loading="lazy" />
							{:else}
								<div class="weapon-picker-icon-fallback">?</div>
							{/if}
							<div class="weapon-picker-info">
								<p class="weapon-picker-name">{w.name ?? `Weapon #${w.id}`}</p>
								<p class="weapon-picker-id">ID: {w.id}</p>
							</div>
							{#if isActive}
								<div class="weapon-picker-check">✓</div>
							{/if}
						</button>
					{/each}
					{#if filteredWeapons.length === 0}
						<div class="text-center text-sm text-slate-400 py-8">No weapons found</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes fadeIn{from{opacity:0}to{opacity:1}}
	@keyframes slideUp{from{opacity:0;transform:translateY(20px)scale(.97)}to{opacity:1;transform:translateY(0)scale(1)}}

	.overlay{position:fixed;inset:0;background:rgba(2,6,23,.7);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:1000;animation:fadeIn.15s;padding:1rem}
	.picker-z{z-index:1001}
	.panel{position:relative;width:100%;max-width:960px;height:85vh;background:rgba(15,23,42,.97);border:1px solid rgba(148,163,184,.15);border-radius:28px;box-shadow:0 24px 80px rgba(0,0,0,.6);animation:slideUp.2s;display:flex;flex-direction:column;overflow:hidden}
	.close-btn{position:absolute;top:12px;right:12px;width:32px;height:32px;border-radius:50%;border:none;background:rgba(71,85,105,.25);color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:5;font-size:16px;line-height:1;transition:all.15s}
	.close-btn:hover{background:rgba(239,68,68,.25);color:#fca5a5}

	.header{display:flex;align-items:center;gap:.75rem;padding:.8rem 1.25rem .6rem;border-bottom:1px solid rgba(148,163,184,.08);flex-shrink:0}
	.avatar-box{position:relative;flex-shrink:0;width:48px;height:48px;border-radius:12px;overflow:hidden;box-shadow:0 0 0 2px var(--el,#22d3ee);background:rgba(30,41,59,.7)}
	.avatar{width:100%;height:100%;object-fit:cover}
	.rank-badge{position:absolute;bottom:-3px;right:-3px;width:18px;height:18px;border-radius:50%;font-size:8px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid rgba(2,6,23,.8)}
	.rank-s{background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1e1b0a}
	.rank-a{background:linear-gradient(135deg,#a78bfa,#8b5cf6);color:#1e1b4b}
	.name{font-size:.9rem;font-weight:700;color:#f1f5f9;margin:0}
	.tags{display:flex;gap:.2rem;margin-top:.1rem}
	.tag{font-size:8px;font-weight:600;padding:0 .4rem;border-radius:999px;background:rgba(71,85,105,.25);color:var(--tc,#94a3b8);border:1px solid color-mix(in srgb,var(--tc,transparent)30%,transparent);text-transform:uppercase}
	.controls{display:flex;gap:.4rem;margin-top:.2rem}
	.ctrl{display:flex;align-items:center;gap:.2rem;font-size:9px;font-weight:600;color:#64748b;text-transform:uppercase}
	.sel{padding:.2rem .35rem;font-size:.7rem;border-radius:7px;border:1px solid rgba(71,85,105,.6);background:rgba(2,6,23,.8);color:#f8fafc;outline:none;cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2364748b'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right .3rem center;background-size:.6rem;padding-right:1rem}
	.body-split{flex:1;display:flex;overflow:hidden}
	.left-col{width:66%;overflow-y:auto;padding:.6rem .4rem .6rem .8rem}
	.right-col{width:34%;overflow-y:auto;padding:.6rem .8rem .6rem .4rem;border-left:1px solid rgba(148,163,184,.08);display:flex;flex-direction:column;gap:.5rem}
	.sec-title{font-size:.6rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin:0 0 .35rem}

	.ref-btn{width:22px;height:22px;border-radius:5px;border:1px solid rgba(71,85,105,.35);background:rgba(30,41,59,.4);color:#94a3b8;font-size:9px;font-weight:600;cursor:pointer;transition:all.1s}
	.ref-btn.active{border-color:#22d3ee;background:rgba(34,211,238,.12);color:#a5f3fc}

	/* ── Weapon Card ── */
	.weapon-card{display:block;width:100%;text-align:left;border-radius:14px;border:2px dashed rgba(71,85,105,.25);background:rgba(15,23,42,.3);cursor:pointer;transition:all.15s;margin-bottom:.5rem;padding:0}
	.weapon-card:hover{border-color:rgba(148,163,184,.3);background:rgba(30,41,59,.5)}
	.weapon-card-empty{min-height:80px;display:flex;align-items:center;justify-content:center}
	.weapon-card-inner{padding:.45rem .55rem;display:flex;flex-direction:column;gap:.2rem}
	.weapon-card-header{display:flex;align-items:center;justify-content:space-between}
	.weapon-card-left{display:flex;align-items:center;gap:.4rem;min-width:0}
	.weapon-card-icon{width:40px;height:40px;object-fit:contain;border-radius:8px;background:rgba(30,41,59,.6);flex-shrink:0;padding:3px}
	.weapon-card-name-wrap{display:flex;align-items:center;gap:.4rem;min-width:0}
	.weapon-card-name{font-size:.8rem;font-weight:700;color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
	.weapon-card-rank{width:20px;height:20px;border-radius:50%;font-size:8px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid rgba(2,6,23,.8);color:#1e1b0a}
	.weapon-card-rank.rank-s{background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1e1b0a}
	.weapon-card-rank.rank-a{background:linear-gradient(135deg,#a78bfa,#8b5cf6);color:#1e1b4b}
	.weapon-remove{width:20px;height:20px;border-radius:50%;border:none;background:rgba(239,68,68,.15);color:#fca5a5;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;opacity:0;transition:opacity .12s}
	.weapon-card:hover .weapon-remove{opacity:1}
	.weapon-card-actions{display:flex;align-items:center;gap:.3rem}
	.weapon-card-stats{display:flex;gap:.75rem;border-top:1px solid rgba(71,85,105,.1);padding:.12rem 0;width:100%}
	.weapon-stat-item{display:flex;align-items:center;gap:.25rem;min-width:0}
	.weapon-stat-label{font-size:.6rem;font-weight:700;color:#94b8b8;text-transform:uppercase;letter-spacing:.03em}
	.weapon-stat-value{font-size:.75rem;font-weight:800;color:#f8fafc;font-variant-numeric:tabular-nums}
	.weapon-card-passive{display:flex;align-items:flex-start;gap:.3rem;width:100%}
	.weapon-passive-label{font-size:.55rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.03em;flex-shrink:0;margin-top:1px}
	.weapon-passive-text{font-size:.6rem;color:#a5b4cb;line-height:1.3;overflow:hidden;text-overflow:ellipsis}
	.weapon-card-refine{display:flex;align-items:center;gap:.2rem}
	.weapon-empty-inner{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.15rem;padding:.8rem}
	.weapon-empty-icon{font-size:1.5rem;opacity:.5}
	.weapon-empty-text{font-size:.8rem;font-weight:600;color:#64748b}
	.weapon-empty-hint{font-size:.6rem;color:#475569}
	.weapon-sig-btn{display:flex;align-items:center;justify-content:center;gap:.35rem;padding:.5rem .75rem;border-radius:14px;border:2px solid rgba(34,211,238,.3);background:rgba(34,211,238,.08);color:#22d3ee;font-size:.7rem;font-weight:700;cursor:pointer;transition:all.15s;margin-bottom:.5rem}
	.weapon-sig-btn:hover:not(:disabled){border-color:#22d3ee;background:rgba(34,211,238,.15);transform:translateY(-1px)}
	.weapon-sig-btn:disabled{border-color:rgba(71,85,105,.15);background:rgba(15,23,42,.3);color:#475569;cursor:not-allowed;opacity:.6}

	/* ── Weapon Picker ── */
	.weapon-picker-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:.6rem}
	.weapon-picker-card{position:relative;display:flex;flex-direction:column;align-items:center;gap:.4rem;padding:.7rem .5rem .6rem;border-radius:14px;border:1px solid rgba(71,85,105,.2);background:rgba(15,23,42,.5);cursor:pointer;transition:all.12s;overflow:hidden}
	.weapon-picker-card:hover{border-color:rgba(34,211,238,.3);background:rgba(15,23,42,.75);transform:translateY(-2px)}
	.weapon-picker-card.active{border-color:#22d3ee;background:rgba(34,211,238,.08)}
	.weapon-picker-rank{position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:50%;font-size:8px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid rgba(2,6,23,.8);z-index:1}
	.weapon-picker-rank.rank-s{background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1e1b0a}
	.weapon-picker-rank.rank-a{background:linear-gradient(135deg,#a78bfa,#8b5cf6);color:#1e1b4b}
	.weapon-picker-icon{width:44px;height:44px;object-fit:contain;border-radius:8px;background:rgba(30,41,59,.5)}
	.weapon-picker-icon-fallback{width:44px;height:44px;border-radius:8px;background:rgba(30,41,59,.5);display:flex;align-items:center;justify-content:center;font-size:1rem;color:#64748b}
	.weapon-picker-info{text-align:center;min-width:0;width:100%}
	.weapon-picker-name{font-size:.68rem;font-weight:600;color:#e2e8f0;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2}
	.weapon-picker-id{font-size:.5rem;color:#64748b;margin:.05rem 0 0}
	.weapon-picker-check{position:absolute;top:4px;left:4px;width:18px;height:18px;border-radius:50%;background:#22d3ee;color:#02050f;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;z-index:1}

	/* slot CSS block – replaced with larger, more spacious sizes */
	.slot-grid{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:1rem;align-content:start;min-width:0}
	.slot-box{border-radius:14px;border:2px dashed rgba(71,85,105,.25);background:rgba(15,23,42,.3);min-height:90px;cursor:pointer;transition:all.15s}
	.slot-box:hover{border-color:rgba(148,163,184,.3);background:rgba(30,41,59,.5)}
	.slot-box.filled{border-style:solid;border-color:rgba(71,85,105,.15);background:rgba(15,23,42,.5)}
	.slot-box.filled:hover{border-color:rgba(34,211,238,.3)}
	.slot-box-inner{height:100%;display:flex;flex-direction:column;padding:.45rem .5rem;position:relative}
	.slot-empty-label{font-size:.8rem;font-weight:700;color:#64748b}
	.slot-card-header{display:flex;align-items:center;justify-content:space-between;width:100%;margin-bottom:.15rem}
	.slot-card-left{display:flex;align-items:center;gap:.35rem;min-width:0}
	.slot-icon{width:32px;height:32px;object-fit:contain;border-radius:7px;background:rgba(30,41,59,.6);flex-shrink:0;padding:2px}
	.slot-set-name{font-size:.75rem;font-weight:700;color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2}
	.slot-remove{width:20px;height:20px;border-radius:50%;border:none;background:rgba(239,68,68,.15);color:#fca5a5;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;opacity:0;transition:opacity.12s}
	.slot-box.filled:hover .slot-remove{opacity:1}
	.slot-ms-row{display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(71,85,105,.1);padding:.12rem 0;margin:0;width:100%}
	.slot-ms-label{font-size:.6rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.03em}
	.slot-ms-value{font-size:.85rem;font-weight:800;color:#f8fafc;font-variant-numeric:tabular-nums}
	.slot-subs{display:flex;flex-direction:column;width:100%;margin-top:.08rem}
	.slot-sub{display:flex;align-items:center;gap:4px;padding:.06rem 0;line-height:1}
	.slot-sub-name{font-size:.6rem;color:#94a3b8;min-width:0;white-space:nowrap}
	.slot-sub-val{font-size:.7rem;font-weight:700;color:#cbd5e1;font-variant-numeric:tabular-nums}
	.slot-sub-rolls{font-size:.5rem;color:#22d3ee;font-weight:600;background:rgba(34,211,238,.07);border-radius:3px;padding:0 .25rem;margin-left:auto;line-height:1.2}
	.slot-empty-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:.35rem;position:absolute;inset:0}
	.slot-empty-plus{width:36px;height:36px;border-radius:50%;border:2px solid rgba(71,85,105,.35);background:rgba(30,41,59,.3);color:#94a3b8;font-size:22px;font-weight:200;display:flex;align-items:center;justify-content:center;transition:all.15s;line-height:1}
	.slot-box:hover .slot-empty-plus{border-color:rgba(34,211,238,.5);color:#a5f3fc;background:rgba(34,211,238,.08)}

	.stats-card,.set-card{background:rgba(30,41,59,.2);border:1px solid rgba(71,85,105,.1);border-radius:12px;padding:.5rem .65rem}
	.stat-list{display:grid;gap:.15rem}
	.stat-line{display:flex;justify-content:space-between;align-items:center}
	.sl{font-size:.68rem;font-weight:500;color:#94a3b8}
	.sv{font-size:.75rem;font-weight:700;color:#f1f5f9;font-variant-numeric:tabular-nums}
	.set-block{padding:.2rem 0;border-bottom:1px solid rgba(71,85,105,.06)}
	.set-block:last-child{border:none}
	.set-name{font-size:.68rem;font-weight:600;color:#e2e8f0;display:block;margin-bottom:.05rem}
	.set-row{display:flex;align-items:center;gap:.2rem;font-size:.6rem;color:#cbd5e1}
	.check{color:#34d399;font-weight:700}
	.info{color:#facc15;font-weight:700}
	.badge-set{font-size:.55rem;padding:0 .25rem;border-radius:3px;background:rgba(52,211,153,.1);color:#34d399;white-space:nowrap}
	.badge-combat{font-size:.55rem;padding:0 .25rem;border-radius:3px;background:rgba(250,204,21,.1);color:#facc15;white-space:nowrap}
	.footer-col{display:flex;gap:.5rem;margin-top:auto;padding-top:.4rem}
	.btn{flex:1;padding:.45rem .6rem;border-radius:10px;font-size:.72rem;font-weight:600;border:none;cursor:pointer;transition:all.1s}
	.btn-primary{background:rgba(34,211,238,.12);border:1px solid rgba(34,211,238,.22);color:#a5f3fc}
	.btn-primary:hover{background:rgba(34,211,238,.22)}
	.btn-remove{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:#fca5a5}
	.btn-remove:hover{background:rgba(239,68,68,.2)}

	/* ══ PICKER ══ */
	.picker-panel{width:100%;max-width:680px;max-height:90vh;background:rgba(15,23,42,.97);border:1px solid rgba(148,163,184,.15);border-radius:24px;box-shadow:0 24px 80px rgba(0,0,0,.6);animation:slideUp.18s;display:flex;flex-direction:column;overflow:hidden}
	.picker-head{display:flex;align-items:center;justify-content:space-between;padding:.7rem 1.1rem;border-bottom:1px solid rgba(148,163,184,.1);flex-shrink:0}
	.picker-title{font-size:.85rem;font-weight:700;color:#f1f5f9;margin:0}
	.picker-actions{display:flex;gap:.4rem;padding:.5rem 1.1rem;align-items:center;flex-shrink:0}
	.search-input{flex:1;padding:.35rem .6rem;border-radius:8px;border:1px solid rgba(71,85,105,.6);background:rgba(2,6,23,.7);color:#f8fafc;outline:none;font-size:.75rem}
	.picker-filters{display:flex;flex-wrap:wrap;gap:.35rem;padding:.25rem 1.1rem .4rem;flex-shrink:0;align-items:center}
	.chip-filter{display:inline-flex;align-items:center;gap:.2rem;padding:.2rem .5rem;border-radius:9999px;font-size:.68rem;font-weight:500;white-space:nowrap;border:1px solid rgba(100,116,139,.2);background:rgba(30,41,59,.5);color:rgb(148,163,184);transition:all.12s;cursor:pointer;line-height:1.3}
	.chip-filter:hover{border-color:rgba(56,189,248,.4);color:rgb(186,230,253);background:rgba(30,41,59,.8)}
	.chip-filter.active{border-color:rgba(56,189,248,.6);background:rgba(56,189,248,.15);color:rgb(186,230,253)}
	.back-btn{flex-shrink:0;padding:.3rem .5rem;border-radius:7px;border:1px solid rgba(71,85,105,.35);background:rgba(30,41,59,.4);color:#94a3b8;font-size:.7rem;cursor:pointer}
	.back-btn:hover{border-color:rgba(148,163,184,.4)}

	/* Inventory grid (copied from DiscsTab) */
	.picker-inv-scroll{overflow-y:auto;padding:0 1.1rem 1.1rem;scrollbar-width:thin}
	.inv-grid{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}
	.inv-card{position:relative;display:flex;flex-direction:column;gap:.15rem;padding:.5rem;border-radius:12px;border:1px solid rgba(71,85,105,.15);background:rgba(15,23,42,.45);cursor:pointer;text-align:left;transition:all.12s}
	.inv-card:hover{border-color:rgba(34,211,238,.3);background:rgba(15,23,42,.7);transform:translateY(-1px)}
	.inv-slot-badge{position:absolute;top:4px;left:4px;width:20px;height:18px;border-radius:4px;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;color:#02050f;z-index:1}
	.inv-icon-wrap{display:flex;justify-content:center;margin:.05rem 0}
	.inv-icon{width:52px;height:52px;object-fit:contain;border-radius:8px;background:rgba(30,41,59,.5)}
	.inv-icon-fallback{width:52px;height:52px;border-radius:8px;background:rgba(30,41,59,.5);display:flex;align-items:center;justify-content:center;font-size:1rem;color:#94a3b8}
	.inv-header{text-align:center}
	.inv-name{font-size:.72rem;font-weight:600;color:#e2e8f0;margin:0;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
	.inv-meta{display:flex;align-items:center;justify-content:center;gap:.3rem;font-size:.55rem;color:#64748b}
	.inv-mainstat{display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(71,85,105,.12);padding:.15rem 0 0}
	.inv-stat-label{font-size:.6rem;font-weight:500;color:#94a3b8}
	.inv-stat-value{font-size:.65rem;font-weight:700;color:#f1f5f9}
	.inv-substats{display:grid;grid-template-columns:1fr;gap:1px 4px;padding:.1rem 0 0}
	.inv-substat{display:flex;align-items:center;gap:2px;font-size:.55rem}
	.inv-sub-label{color:#64748b;font-size:.55rem;white-space:nowrap}
	.inv-sub-value{color:#cbd5e1;font-weight:500}
	.inv-sub-roll{color:#22d3ee;font-weight:600;font-size:.5rem}
	.inv-add-card{display:flex;align-items:center;justify-content:center;gap:.25rem;border-style:dashed;border-color:rgba(34,211,238,.2);min-height:120px}
	.inv-add-card:hover{border-color:rgba(34,211,238,.4)}
	.inv-add-icon{width:36px;height:36px;border-radius:50%;border:2px solid rgba(34,211,238,.3);color:#a5f3fc;font-size:22px;font-weight:300;display:flex;align-items:center;justify-content:center}
	.inv-add-text{font-size:.75rem;font-weight:600;color:#a5f3fc;margin:0}

	/* Catalog grid (copied from DiscsTab) */
	.disc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:.5rem}
	.catalog-card{position:relative;display:flex;flex-direction:column;align-items:center;gap:.25rem;padding:.5rem .4rem;border-radius:12px;border:1px solid rgba(71,85,105,.18);background:rgba(15,23,42,.45);cursor:pointer;overflow:hidden;transition:all.12s}
	.catalog-card:hover{border-color:rgba(34,211,238,.25);background:rgba(15,23,42,.7);transform:translateY(-2px)}
	.catalog-card-glow{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(34,211,238,.08) 0%,transparent 70%);opacity:0;transition:opacity.2s;pointer-events:none}
	.catalog-card:hover .catalog-card-glow{opacity:1}
	.catalog-icon{width:44px;height:44px;object-fit:contain;border-radius:8px;background:rgba(30,41,59,.5);position:relative;z-index:1}
	.catalog-icon-fallback{width:44px;height:44px;border-radius:8px;background:rgba(30,41,59,.5);display:flex;align-items:center;justify-content:center;font-size:.9rem;color:#64748b;position:relative;z-index:1}
	.catalog-info{text-align:center;position:relative;z-index:1}
	.catalog-name{font-size:.63rem;font-weight:600;color:#e2e8f0;margin:0;line-height:1.2}
	.catalog-id{font-size:.5rem;color:#64748b;margin:0}
	.catalog-add-hint{position:absolute;top:4px;right:4px;color:#22d3ee;opacity:0;transition:opacity.12s}
	.catalog-card:hover .catalog-add-hint{opacity:1}

	/* ══ MODAL (same as DiscsTab) ══ */
	.modal-overlay{position:fixed;inset:0;background:rgba(2,6,23,.75);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:1002;animation:fadeIn.1s;padding:1rem}
	.modal-panel{width:100%;max-width:440px;background:rgba(15,23,42,.97);border:1px solid rgba(148,163,184,.15);border-radius:20px;box-shadow:0 32px 64px rgba(0,0,0,.5);animation:slideUp.15s;overflow:hidden}
	.modal-close{position:absolute;top:12px;right:12px;width:32px;height:32px;border-radius:50%;border:none;background:rgba(71,85,105,.2);color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:5;transition:all.12s}
	.modal-close:hover{background:rgba(239,68,68,.2);color:#fca5a5}
	.modal-header{display:flex;align-items:center;gap:.7rem;padding:.8rem 1rem .6rem;border-bottom:1px solid rgba(148,163,184,.08)}
	.modal-icon-wrap{position:relative;flex-shrink:0}
	.modal-icon{width:52px;height:52px;object-fit:contain;border-radius:10px;background:rgba(30,41,59,.7)}
	.modal-icon-fallback{width:52px;height:52px;border-radius:10px;background:rgba(30,41,59,.7);display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:#64748b}
	.modal-slot-badge{position:absolute;bottom:-4px;right:-4px;width:22px;height:18px;border-radius:4px;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;color:#02050f;border:2px solid rgba(2,6,23,.8)}
	.modal-name{font-size:.9rem;font-weight:700;color:#f1f5f9;margin:0}
	.modal-subtitle{font-size:.65rem;color:#64748b;margin:.05rem 0 0}
	.modal-body{padding:.6rem .8rem;display:flex;flex-direction:column;gap:.45rem}
	.modal-row-2{display:flex;gap:.6rem}
	.field-group{flex:1}
	.field-label{font-size:.6rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:.15rem}
	.slot-selector{display:flex;gap:3px}
	.slot-btn{width:28px;height:28px;border-radius:6px;border:1px solid rgba(71,85,105,.25);background:rgba(30,41,59,.4);color:#94a3b8;font-size:.65rem;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all.1s}
	.slot-btn.active{background:var(--btn-accent,rgba(34,211,238,.12));border-color:var(--btn-accent,rgba(34,211,238,.3));color:#fff}
	.slot-btn:hover{border-color:rgba(148,163,184,.4)}
	.level-display{font-size:.8rem;font-weight:600;color:#e2e8f0;padding:.25rem .5rem;border-radius:8px;background:rgba(30,41,59,.4)}
	.mainstat-row{display:flex;gap:.3rem}
	.field-input{padding:.3rem .5rem;border-radius:7px;border:1px solid rgba(71,85,105,.5);background:rgba(2,6,23,.7);color:#f8fafc;outline:none;font-size:.72rem}
	.field-input:focus{border-color:#22d3ee}
	.modal-select{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2364748b'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right .4rem center;background-size:.7rem;padding-right:1.3rem}
	.substats-grid{display:flex;flex-direction:column;gap:.25rem}
	.substat-row{display:flex;gap:.25rem;align-items:center}
	.modal-footer{display:flex;gap:.5rem;padding:.5rem .8rem .7rem;border-top:1px solid rgba(148,163,184,.06)}
	.footer-btn{flex:1;padding:.4rem .6rem;border-radius:9px;font-size:.72rem;font-weight:600;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.3rem;transition:all.1s}
	.primary-btn{background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.2);color:#a5f3fc}
	.primary-btn:hover{background:rgba(34,211,238,.18)}
	.remove-btn{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.18);color:#fca5a5}
	.remove-btn:hover{background:rgba(239,68,68,.18)}
</style>
