<script lang="ts">
	import { getDiscs, isLoading, getError } from "$lib/data/discs.svelte";
	import { getState } from "$lib/stores/app.svelte";
	import { t } from "$lib/i18n/index.svelte";
	import { showToast } from "$lib/stores/toast.svelte";
	import {
		discStatOptions,
		getDiscSlotFromEquipId,
		getDiscSuitIdFromEquipId,
		getDefaultDiscMainStat,
		getDiscEntrySubStats,
		getDiscMainStatOptions,
		getDiscStatDefaultValue,
		clampNumber,
		buildDiscEquipId,
		canUseAsSubStat,
		getStatName,
		getSubStatDisplayValue,
		getMainStatDisplayValue,
	} from "$lib/utils/disc";
	import type { DiscEntry, StatEntry } from "$lib/types";
	import type { StatOption } from "$lib/utils/disc";
	import { SLOT_COLORS } from "$lib/constants";

	const app = getState();

	let searchInput = $state("");
	let addIdInput = $state("");
	let catalogOpen = $state(false);

	const discs = $derived(getDiscs());
	const loading = $derived(isLoading());
	const error = $derived(getError());

	$effect(() => {
		app.discSearch = searchInput;
	});

	const filteredDiscs = $derived(
		searchInput
			? discs.filter((d) => d.name?.toLowerCase().includes(searchInput.toLowerCase()))
			: discs
	);

	// === Modal state ===
	let modalDisc = $state<{ suitId: number; name?: string; icon?: string } | null>(null);
	let modalSlot = $state(1);
	let modalLevel = $state(15);
	let modalStar = $state(5);
	let modalMainStat = $state<StatEntry>({ statId: 11102, value: 750, add: 1 });
	let modalSubStats = $state<StatEntry[]>([]);
	let editIndex = $state<number | null>(null);

	function getAvailSubStatOptions(rowIndex: number, mainStatId: number, subStats: StatEntry[]): StatOption[] {
		const usedIds = new Set([mainStatId]);
		for (let i = 0; i < subStats.length; i++) {
			if (i !== rowIndex && subStats[i]) usedIds.add(subStats[i].statId);
		}
		return discStatOptions.filter((s) => s.subValues?.length && !usedIds.has(s.id));
	}

	function openAddModal(disc: { id: number; name?: string; icon?: string }) {
		modalDisc = { suitId: disc.id, name: disc.name, icon: disc.icon };
		modalSlot = 1;
		modalLevel = 15;
		modalStar = 5;
		const tempId = buildDiscEquipId(disc.id, 1);
		const tempEntry: DiscEntry = { id: tempId, level: 15, star: 5, mainStat: { statId: 11102, value: 750, add: 1 }, subStats: [] };
		modalMainStat = getDefaultDiscMainStat(tempEntry);
		modalSubStats = getDiscEntrySubStats({ ...tempEntry, mainStat: modalMainStat });
		editIndex = null;
	}

	function openEditModal(index: number) {
		const entry = app.zonConfig.equipment[index];
		if (!entry) return;
		const suitId = getDiscSuitIdFromEquipId(entry.id);
		const disc = discs.find((d) => d.id === suitId);
		modalDisc = { suitId, name: disc?.name, icon: disc?.icon };
		modalSlot = getDiscSlotFromEquipId(entry.id);
		modalLevel = entry.level ?? 15;
		modalStar = entry.star ?? 5;
		modalMainStat = { ...entry.mainStat };
		modalSubStats = entry.subStats.map((s) => ({ ...s }));
		editIndex = index;
	}

	function closeModal() {
		modalDisc = null;
		editIndex = null;
	}

	function handleSlotChange(newSlot: number) {
		modalSlot = newSlot;
		if (!modalDisc) return;
		const tempId = buildDiscEquipId(modalDisc.suitId, newSlot);
		const tempEntry: DiscEntry = { id: tempId, level: modalLevel, star: modalStar, mainStat: { statId: 11102, value: 750, add: 1 }, subStats: [] };
		modalMainStat = getDefaultDiscMainStat(tempEntry);
		modalSubStats = getDiscEntrySubStats({ ...tempEntry, mainStat: modalMainStat });
	}

	function handleMainStatChange(statId: number) {
		if (!modalDisc) return;
		modalMainStat = { statId, value: getDiscStatDefaultValue(statId), add: 1 };
		const tempId = buildDiscEquipId(modalDisc.suitId, modalSlot);
		const tempEntry: DiscEntry = { id: tempId, level: modalLevel, star: modalStar, mainStat: modalMainStat, subStats: [] };
		modalSubStats = getDiscEntrySubStats({ ...tempEntry, mainStat: modalMainStat });
	}

	function handleSubStatChange(subIndex: number, field: string, value: string) {
		if (!modalDisc) return;
		if (field === "statId") {
			const newId = Number(value);
			const mainStatId = modalMainStat.statId;

			if (newId === mainStatId) {
				// Swap with main stat
				const oldMain = { ...modalMainStat };
				const oldSub = { ...modalSubStats[subIndex] };
				modalMainStat = { statId: oldSub.statId, value: oldSub.value, add: oldSub.add ?? 1 };
				modalSubStats[subIndex] = { statId: oldMain.statId, value: oldMain.value, add: 1 };
			} else {
				const dupIdx = modalSubStats.findIndex((s, i) => i !== subIndex && s.statId === newId);
				if (dupIdx >= 0) {
					// Swap the two sub stats
					const temp = { ...modalSubStats[dupIdx] };
					modalSubStats[dupIdx] = { ...modalSubStats[subIndex] };
					modalSubStats[subIndex] = temp;
				} else {
					modalSubStats[subIndex] = { statId: newId, value: getDiscStatDefaultValue(newId, "sub"), add: 0 };
				}
			}
		} else if (field === "value") {
			modalSubStats[subIndex].value = clampNumber(value, 0, 999999, modalSubStats[subIndex].value);
		} else if (field === "add") {
			modalSubStats[subIndex].add = clampNumber(value, 0, 5, modalSubStats[subIndex].add ?? 0);
		}
	}

	function saveDisc() {
		if (!modalDisc) return;
		const equipId = buildDiscEquipId(modalDisc.suitId, modalSlot);
		const entry: DiscEntry = {
			id: equipId,
			level: modalLevel,
			star: modalStar,
			mainStat: { ...modalMainStat },
			subStats: modalSubStats.map((s) => ({ ...s })),
		};

		if (editIndex != null) {
			app.zonConfig.equipment[editIndex] = entry;
		} else {
			app.zonConfig.equipment.push(entry);
		}
		app.zonConfig.importHighlights.equipment = true;
		showToast(editIndex != null ? "Disc updated" : t("disc.added"), "success");
		closeModal();
	}

	function removeDisc(index: number) {
		app.zonConfig.equipment.splice(index, 1);
		closeModal();
	}

	function addDiscById() {
		const id = parseInt(addIdInput, 10);
		if (!Number.isFinite(id) || id < 1) {
			showToast(t("disc.invalidId"), "error");
			return;
		}
		const suitId = getDiscSuitIdFromEquipId(id);
		if (!suitId) {
			showToast(t("disc.invalidId"), "error");
			return;
		}
		const disc = discs.find((d) => d.id === suitId);
		const slot = getDiscSlotFromEquipId(id);
		if (!disc || !slot) {
			showToast(t("disc.invalidId"), "error");
			return;
		}
		openAddModal(disc);
		modalSlot = slot;
	}

	function getSuitName(suitId: number): string {
		return discs.find((d) => d.id === suitId)?.name ?? String(suitId);
	}

	function getDiscIconUrl(suitId: number): string | undefined {
		return discs.find((d) => d.id === suitId)?.icon;
	}

	function formatStatValue(stat: StatEntry): string {
		return String(stat.value);
	}

	/** Generate slot accent gradient */
	function slotAccent(slot: number): string {
		return SLOT_COLORS[Math.min(slot - 1, 5)];
	}
</script>

<div class="discs-page">
	<!-- Header: Search + Add by ID + Toggle Catalog -->
	<div class="flex items-center gap-3 mb-5">
		<div class="relative flex-1">
			<svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
			</svg>
			<input
				id="disc-search"
				type="search"
				class="field-input !pl-9"
				placeholder={t("disc.search")}
				bind:value={searchInput}
			/>
		</div>
		<div class="flex items-center gap-2 shrink-0">
			<input
				id="disc-add-id"
				type="text"
				class="field-input !w-28 !py-2.5 text-sm"
				placeholder="Equip ID"
				bind:value={addIdInput}
				onkeydown={(e) => { if (e.key === "Enter") addDiscById(); }}
			/>
			<button class="primary-btn !py-2.5 !px-4 text-sm" onclick={addDiscById} title={t("disc.add")}>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
					<path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
				</svg>
			</button>
		</div>
	</div>

	<!-- Add Disc button — opens catalog popup -->
	<button
		class="catalog-open-btn"
		onclick={() => catalogOpen = true}
	>
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="catalog-open-icon">
			<path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
		</svg>
		<span>Add Disc</span>
	</button>

	<!-- Inventory -->
	{#if app.zonConfig.equipment.length > 0}
		{@const sortedEquipment = app.zonConfig.equipment
			.map((e, i) => ({ entry: e, originalIndex: i }))
			.sort((a, b) => {
				const nameA = (getSuitName(getDiscSuitIdFromEquipId(a.entry.id)) || "").toLowerCase();
				const nameB = (getSuitName(getDiscSuitIdFromEquipId(b.entry.id)) || "").toLowerCase();
				if (nameA < nameB) return -1;
				if (nameA > nameB) return 1;
				const slotA = getDiscSlotFromEquipId(a.entry.id);
				const slotB = getDiscSlotFromEquipId(b.entry.id);
				return slotA - slotB;
			})
		}
		<section>
			<h3 class="text-sm font-semibold text-white mb-3">
				{t("disc.inventory")}
				<span class="text-xs font-normal text-slate-500 ml-2">({app.zonConfig.equipment.length})</span>
			</h3>
			<div class="disc-inv-grid">
				{#each sortedEquipment as { entry, originalIndex }}
					{@const suitId = getDiscSuitIdFromEquipId(entry.id)}
					{@const slot = getDiscSlotFromEquipId(entry.id)}
					{@const accent = slotAccent(slot)}
					{@const icon = getDiscIconUrl(suitId)}
					<button
						class="inv-card"
						style="--card-accent: {accent}"
						onclick={() => openEditModal(originalIndex)}
					>
						<!-- Slot badge -->
						<div class="inv-slot-badge" style="background: {accent}">S{slot}</div>

						<!-- Icon -->
						<div class="inv-icon-wrap">
							{#if icon}
								<img src={icon} alt={getSuitName(suitId)} class="inv-icon" loading="lazy" />
							{:else}
								<div class="inv-icon-fallback">{getSuitName(suitId).charAt(0)}</div>
							{/if}
						</div>

						<!-- Name + Level -->
						<div class="inv-header">
							<p class="inv-name">{getSuitName(suitId)}</p>
							<div class="inv-meta">
								<span class="inv-level">Lv.{entry.level ?? 15}</span>
								<span class="inv-star">{'★'.repeat(entry.star ?? 5)}</span>
							</div>
						</div>

						<!-- Main Stat -->
						<div class="inv-mainstat">
							<span class="inv-stat-label">{getStatName(entry.mainStat.statId)}</span>
							<span class="inv-stat-value">{getMainStatDisplayValue(entry.mainStat)}</span>
						</div>

						<!-- Sub Stats -->
						{#if entry.subStats && entry.subStats.length > 0}
							<div class="inv-substats">
								{#each entry.subStats.slice(0, 4) as sub}
									<div class="inv-substat">
										<span class="inv-sub-label">{getStatName(sub.statId)}</span>
										<span class="inv-sub-value">{getSubStatDisplayValue(sub)}</span>
										{#if (sub.add ?? 0) > 0}
											<span class="inv-sub-roll">+{sub.add}</span>
										{/if}
									</div>
								{/each}
							</div>
						{/if}

						<!-- Remove button overlay -->
						<div class="inv-remove-hint">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5">
								<path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c-.84 0-1.673.025-2.5.075V3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25v.325C11.673 4.025 10.84 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" />
							</svg>
						</div>
					</button>
				{/each}
			</div>
		</section>
	{/if}
</div>

<!-- Catalog Popup Overlay -->
{#if catalogOpen}
	<div class="catalog-overlay" onclick={() => catalogOpen = false} onkeydown={(e) => e.key === 'Escape' && (catalogOpen = false)} role="presentation">
		<div class="catalog-popup" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && (catalogOpen = false)} role="dialog" aria-modal="true" aria-label="Disc catalog" tabindex="-1">
			<div class="catalog-popup-header">
				<h2 class="catalog-popup-title">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="catalog-popup-title-icon">
						<path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
					</svg>
					Select Disc Set
				</h2>
				<button class="catalog-popup-close" onclick={() => catalogOpen = false} aria-label="Close">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5">
						<path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
					</svg>
				</button>
			</div>

			<div class="catalog-popup-search">
				<svg class="catalog-popup-search-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
				</svg>
				<input
					id="catalog-popup-search"
					type="search"
					class="catalog-popup-search-input"
					placeholder={t("disc.search")}
					bind:value={searchInput}
				/>
			</div>

			<div class="catalog-popup-body">
				{#if loading}
					<div class="text-center text-sm text-slate-400 py-8">{t("disc.loading")}</div>
				{:else if error}
					<div class="text-center text-sm text-red-400 py-8">{t("disc.loadError")}: {error}</div>
				{:else if filteredDiscs.length === 0}
					<div class="text-center text-sm text-slate-400 py-8">{t("disc.noResults")}</div>
				{:else}
					<div class="disc-grid">
						{#each filteredDiscs as disc (disc.id)}
							<button
								class="catalog-card"
								onclick={() => { catalogOpen = false; openAddModal(disc); }}
							>
								<div class="catalog-card-glow"></div>
								{#if disc.icon}
									<img
										src={disc.icon}
										alt={disc.name ?? String(disc.id)}
										class="catalog-icon"
										loading="lazy"
									/>
								{:else}
									<div class="catalog-icon-fallback">?</div>
								{/if}
								<div class="catalog-info">
									<p class="catalog-name">{disc.name ?? `Set #${disc.id}`}</p>
									<p class="catalog-id">ID {disc.id}</p>
								</div>
								<div class="catalog-add-hint">
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
										<path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
									</svg>
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Config Modal -->
{#if modalDisc}
	{@const accent = slotAccent(modalSlot)}
	<div class="modal-overlay" onclick={closeModal} onkeydown={(e) => e.key === 'Escape' && closeModal()} role="presentation">
		<div class="modal-panel" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && closeModal()} role="dialog" aria-modal="true" aria-label="Configure disc" tabindex="0">
			<button class="modal-close" aria-label="Close" onclick={closeModal}>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5">
					<path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
				</svg>
			</button>

			<div class="modal-header" style="--accent: {accent}">
				<div class="modal-icon-wrap">
					{#if modalDisc.icon}
						<img src={modalDisc.icon} alt={modalDisc.name ?? ""} class="modal-icon" />
					{:else}
						<div class="modal-icon-fallback">{(modalDisc.name ?? "?").charAt(0)}</div>
					{/if}
					<div class="modal-slot-badge" style="background: {accent}">S{modalSlot}</div>
				</div>
				<div class="modal-title-group">
					<h2 class="modal-name">{modalDisc.name ?? `Disc Set #${modalDisc.suitId}`}</h2>
					<p class="modal-subtitle">Set ID: {modalDisc.suitId} &middot; {editIndex != null ? "Editing" : "Adding"}</p>
				</div>
			</div>

			<div class="modal-body">
				<!-- Row 1: Slot + Level -->
				<div class="modal-row-2">
					<div class="field-group">
						<span id="modal-slot-label" class="field-label">{t("disc.slot")}</span>
						<div class="slot-selector" aria-labelledby="modal-slot-label" role="radiogroup">
							{#each [1, 2, 3, 4, 5, 6] as s}
								<button
									class="slot-btn"
									class:active={modalSlot === s}
									style={modalSlot === s ? `--btn-accent: ${slotAccent(s)}` : ""}
									onclick={() => handleSlotChange(s)}
								>
									{s}
								</button>
							{/each}
						</div>
					</div>
					<div class="field-group">
						<span class="field-label">{t("disc.level")}</span>
						<div class="level-display">Lv.15</div>
					</div>
				</div>

				<!-- Main Stat -->
				<div class="field-group">
					<label for="modal-mainstat" class="field-label">{t("disc.mainStat")}</label>
					<div class="mainstat-row">
						<select id="modal-mainstat" class="field-input modal-select flex-1" value={modalMainStat.statId}
							onchange={(e) => handleMainStatChange(Number((e.target as HTMLSelectElement).value))}>
							{#each getDiscMainStatOptions({ id: buildDiscEquipId(modalDisc.suitId, modalSlot), level: modalLevel, star: modalStar, mainStat: modalMainStat, subStats: [] }) as opt}
								<option value={opt.id}>{opt.name}</option>
							{/each}
						</select>
						<input id="modal-mainstat-value" type="number" class="field-input !w-28" value={modalMainStat.value}
							onchange={(e) => modalMainStat.value = clampNumber((e.target as HTMLInputElement).value, 0, 999999, modalMainStat.value)} />
					</div>
				</div>

				<!-- Sub Stats -->
				<div class="field-group">
					<span id="modal-substats-label" class="field-label">{t("disc.subStats")}</span>
					<div class="substats-grid" aria-labelledby="modal-substats-label">
						{#each modalSubStats as sub, si}
							<div class="substat-row">
								<select id={"modal-substat-" + si + "-stat"} class="field-input modal-select flex-1" value={sub.statId}
									onchange={(e) => handleSubStatChange(si, "statId", (e.target as HTMLSelectElement).value)}>
									{#each getAvailSubStatOptions(si, modalMainStat.statId, modalSubStats) as opt}
										<option value={opt.id}>{opt.name}</option>
									{/each}
								</select>
								<input type="number" class="field-input !w-20" value={sub.value}
									onchange={(e) => handleSubStatChange(si, "value", (e.target as HTMLInputElement).value)} />
								<select class="field-input !w-16" value={sub.add ?? 0}
									onchange={(e) => handleSubStatChange(si, "add", (e.target as HTMLSelectElement).value)}>
									{#each [0, 1, 2, 3, 4, 5] as a}
										<option value={a}>+{a}</option>
									{/each}
								</select>
							</div>
						{/each}
					</div>
				</div>
			</div>

			<div class="modal-footer">
				{#if editIndex != null}
					<button class="footer-btn remove-btn" onclick={() => removeDisc(editIndex!)}>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
							<path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c-.84 0-1.673.025-2.5.075V3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25v.325C11.673 4.025 10.84 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" />
						</svg>
						Remove
					</button>
				{/if}
				<button class="footer-btn primary-btn" onclick={saveDisc}>
					{editIndex != null ? "Update" : "Add to Config"}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* === Layout === */
	.discs-page {
		animation: floatIn 240ms ease-out;
	}

	/* === Catalog Open Button === */
	.catalog-open-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.85rem 1.2rem;
		border-radius: 16px;
		border: 1px dashed rgba(34, 211, 238, 0.35);
		background: rgba(34, 211, 238, 0.04);
		color: #a5f3fc;
		cursor: pointer;
		transition: all 0.2s ease;
		outline: none;
		margin-bottom: 0.75rem;
		font-size: 0.9rem;
		font-weight: 600;
	}
	.catalog-open-btn:hover {
		border-color: rgba(34, 211, 238, 0.6);
		background: rgba(34, 211, 238, 0.1);
		box-shadow: 0 4px 20px rgba(34, 211, 238, 0.08);
	}
	.catalog-open-icon {
		width: 18px;
		height: 18px;
		color: #22d3ee;
	}

	/* === Catalog Popup Overlay === */
	.catalog-overlay {
		position: fixed;
		inset: 0;
		background: rgba(2, 6, 23, 0.75);
		backdrop-filter: blur(10px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		animation: fadeIn 0.15s ease-out;
		padding: 1rem;
	}
	.catalog-popup {
		position: relative;
		width: 100%;
		max-width: 680px;
		max-height: 85vh;
		background: rgba(15, 23, 42, 0.97);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 24px;
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
		animation: slideUp 0.2s ease-out;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.catalog-popup-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.1);
		flex-shrink: 0;
	}
	.catalog-popup-title {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 1rem;
		font-weight: 700;
		color: #f1f5f9;
		margin: 0;
	}
	.catalog-popup-title-icon {
		width: 20px;
		height: 20px;
		color: #22d3ee;
	}
	.catalog-popup-close {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: none;
		background: rgba(71, 85, 105, 0.25);
		color: #94a3b8;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}
	.catalog-popup-close:hover {
		background: rgba(239, 68, 68, 0.25);
		color: #fca5a5;
	}
	.catalog-popup-search {
		position: relative;
		padding: 0.75rem 1.25rem;
		flex-shrink: 0;
	}
	.catalog-popup-search-icon {
		position: absolute;
		left: 1.75rem;
		top: 50%;
		transform: translateY(-50%);
		width: 16px;
		height: 16px;
		color: #64748b;
		pointer-events: none;
	}
	.catalog-popup-search-input {
		width: 100%;
		padding: 0.65rem 1rem 0.65rem 2.25rem;
		border-radius: 14px;
		border: 1px solid rgba(71, 85, 105, 0.6);
		background: rgba(2, 6, 23, 0.7);
		color: #f8fafc;
		outline: none;
		font-size: 0.85rem;
		transition: border-color 180ms ease, box-shadow 180ms ease;
	}
	.catalog-popup-search-input:focus {
		border-color: rgba(34, 211, 238, 0.6);
		box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.12);
	}
	.catalog-popup-body {
		padding: 0 1.25rem 1.25rem;
		overflow-y: auto;
		flex: 1;
		scrollbar-width: none;
	}

	.catalog-popup-body::-webkit-scrollbar {
		display: none;
	}
	.catalog-popup-body .disc-grid {
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
	}

	/* === Catalog Grid === */
	.disc-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 0.75rem;
	}

	.catalog-card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		padding: 1rem 0.75rem 0.85rem;
		border-radius: 18px;
		border: 1px solid rgba(71, 85, 105, 0.25);
		background: rgba(15, 23, 42, 0.55);
		cursor: pointer;
		transition: all 0.2s ease;
		overflow: hidden;
		outline: none;
		text-align: center;
	}

	.catalog-card:hover {
		border-color: rgba(34, 211, 238, 0.35);
		background: rgba(15, 23, 42, 0.8);
		transform: translateY(-2px);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
	}

	.catalog-card-glow {
		position: absolute;
		inset: 0;
		opacity: 0;
		background: radial-gradient(ellipse at 50% 0%, rgba(34, 211, 238, 0.1), transparent 70%);
		transition: opacity 0.25s ease;
		pointer-events: none;
	}

	.catalog-card:hover .catalog-card-glow {
		opacity: 1;
	}

	.catalog-icon {
		width: 76px;
		height: 76px;
		object-fit: contain;
		border-radius: 12px;
		background: rgba(30, 41, 59, 0.6);
		padding: 4px;
		position: relative;
		z-index: 1;
	}

	.catalog-icon-fallback {
		width: 76px;
		height: 76px;
		border-radius: 12px;
		background: rgba(30, 41, 59, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.2rem;
		font-weight: 700;
		color: #64748b;
	}

	.catalog-info {
		position: relative;
		z-index: 1;
		min-width: 0;
		width: 100%;
	}

	.catalog-name {
		font-size: 0.8rem;
		font-weight: 600;
		color: #e2e8f0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin: 0;
		line-height: 1.3;
	}

	.catalog-id {
		font-size: 0.65rem;
		color: #64748b;
		margin: 0.1rem 0 0;
	}

	.catalog-add-hint {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: rgba(34, 211, 238, 0.12);
		border: 1px solid rgba(34, 211, 238, 0.2);
		color: #a5f3fc;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transform: scale(0.85);
		transition: all 0.2s ease;
		z-index: 2;
	}

	.catalog-card:hover .catalog-add-hint {
		opacity: 1;
		transform: scale(1);
	}

	/* === Inventory Grid === */
	.disc-inv-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 0.75rem;
	}

	.inv-card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.75rem;
		border-radius: 18px;
		border: 1px solid rgba(71, 85, 105, 0.2);
		background: rgba(15, 23, 42, 0.6);
		cursor: pointer;
		transition: all 0.2s ease;
		overflow: hidden;
		outline: none;
		text-align: left;
	}

	.inv-card:hover {
		border-color: var(--card-accent, rgba(34, 211, 238, 0.35));
		box-shadow: 0 0 24px color-mix(in srgb, var(--card-accent, #22d3ee) 15%, transparent);
		transform: translateY(-2px);
		background: rgba(15, 23, 42, 0.85);
	}

	.inv-slot-badge {
		position: absolute;
		top: 8px;
		right: 8px;
		padding: 0.15rem 0.55rem;
		border-radius: 999px;
		font-size: 0.6rem;
		font-weight: 700;
		color: #02050f;
		z-index: 2;
		letter-spacing: 0.03em;
	}

	.inv-icon-wrap {
		width: 64px;
		height: 64px;
		border-radius: 12px;
		background: rgba(30, 41, 59, 0.7);
		overflow: hidden;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.inv-icon {
		width: 100%;
		height: 100%;
		object-fit: contain;
		padding: 3px;
	}

	.inv-icon-fallback {
		font-size: 1rem;
		font-weight: 700;
		color: #64748b;
	}

	.inv-header {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.inv-name {
		font-size: 0.8rem;
		font-weight: 600;
		color: #f1f5f9;
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.inv-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.inv-level {
		font-size: 0.65rem;
		font-weight: 500;
		color: #94a3b8;
	}

	.inv-star {
		font-size: 0.6rem;
		color: #fbbf24;
		letter-spacing: 0.05em;
	}

	.inv-mainstat {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.3rem 0.5rem;
		border-radius: 10px;
		background: rgba(var(--card-accent-rgb, 34, 211, 238), 0.08);
		border: 1px solid color-mix(in srgb, var(--card-accent, #22d3ee) 20%, transparent);
	}

	.inv-stat-label {
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--card-accent, #a5f3fc);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.inv-stat-value {
		font-size: 0.75rem;
		font-weight: 700;
		color: #f1f5f9;
	}

	.inv-substats {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.2rem;
	}

	.inv-substat {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.15rem 0.4rem;
		border-radius: 6px;
		background: rgba(30, 41, 59, 0.4);
	}

	.inv-sub-label {
		font-size: 0.6rem;
		font-weight: 500;
		color: #94a3b8;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
		min-width: 0;
	}

	.inv-sub-value {
		font-size: 0.65rem;
		font-weight: 600;
		color: #e2e8f0;
		flex-shrink: 0;
	}

	.inv-sub-roll {
		font-size: 0.55rem;
		font-weight: 700;
		color: #fbbf24;
		background: rgba(251, 191, 36, 0.12);
		padding: 0 0.25rem;
		border-radius: 4px;
		flex-shrink: 0;
	}

	.inv-remove-hint {
		position: absolute;
		bottom: 6px;
		right: 6px;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.15);
		color: #fca5a5;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.2s ease;
		z-index: 2;
	}

	.inv-card:hover .inv-remove-hint {
		opacity: 1;
	}

	/* ========== Modal ========== */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(2, 6, 23, 0.7);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		animation: fadeIn 0.15s ease-out;
		padding: 1rem;
	}

	.modal-panel {
		position: relative;
		width: 100%;
		max-width: 520px;
		background: rgba(15, 23, 42, 0.96);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 28px;
		padding: 1.5rem;
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
		animation: slideUp 0.2s ease-out;
		max-height: 90vh;
		overflow-y: auto;
	}

	.modal-close {
		position: absolute; top: 12px; right: 12px;
		width: 32px; height: 32px; border-radius: 50%; border: none;
		background: rgba(71, 85, 105, 0.25); color: #94a3b8;
		cursor: pointer; display: flex; align-items: center; justify-content: center;
		transition: all 0.15s ease; z-index: 5;
	}
	.modal-close:hover { background: rgba(239, 68, 68, 0.25); color: #fca5a5; }

	.modal-header {
		display: flex; align-items: center; gap: 1rem;
		margin-bottom: 1.25rem; padding-bottom: 1rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.1);
	}

	.modal-icon-wrap {
		position: relative; flex-shrink: 0;
		width: 84px; height: 84px; border-radius: 16px; overflow: hidden;
		box-shadow: 0 0 0 2px var(--accent, #22d3ee);
		background: rgba(30, 41, 59, 0.7);
		display: flex; align-items: center; justify-content: center;
	}

	.modal-icon { width: 100%; height: 100%; object-fit: contain; padding: 6px; }
	.modal-icon-fallback {
		font-size: 1.5rem; font-weight: 700; color: #94a3b8;
	}

	.modal-slot-badge {
		position: absolute; bottom: -4px; right: -4px;
		width: 24px; height: 24px; border-radius: 50%;
		font-size: 10px; font-weight: 800;
		display: flex; align-items: center; justify-content: center;
		border: 2px solid rgba(2, 6, 23, 0.8);
		color: #02050f;
	}

	.modal-title-group { flex: 1; min-width: 0; }
	.modal-name { font-size: 1.05rem; font-weight: 700; color: #f1f5f9; margin: 0; line-height: 1.3; }
	.modal-subtitle { font-size: 0.75rem; color: #64748b; margin-top: 0.2rem; }

	.modal-body { display: flex; flex-direction: column; gap: 0.9rem; margin-bottom: 1rem; }
	.field-group { display: flex; flex-direction: column; gap: 0.35rem; }
	.field-label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }

	.modal-select {
		padding: 0.55rem 0.75rem; font-size: 0.85rem; cursor: pointer; appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2364748b'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E");
		background-repeat: no-repeat; background-position: right 0.6rem center; background-size: 1rem;
		padding-right: 2rem;
	}

	.level-display {
		padding: 0.55rem 0.75rem; font-size: 0.85rem; font-weight: 600; color: #a5f3fc;
		background: rgba(34, 211, 238, 0.08); border-radius: 6px;
		text-align: center; letter-spacing: 0.02em;
	}

	.modal-row-2 {
		display: grid;
		grid-template-columns: 1fr 0.7fr;
		gap: 0.75rem;
	}

	.slot-selector {
		display: flex;
		gap: 0.3rem;
	}

	.slot-btn {
		flex: 1;
		padding: 0.45rem 0;
		border-radius: 10px;
		border: 1px solid rgba(71, 85, 105, 0.3);
		background: rgba(30, 41, 59, 0.5);
		color: #94a3b8;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: center;
	}

	.slot-btn:hover {
		border-color: rgba(148, 163, 184, 0.5);
		background: rgba(30, 41, 59, 0.8);
	}

	.slot-btn.active {
		border-color: var(--btn-accent, #22d3ee);
		background: color-mix(in srgb, var(--btn-accent, #22d3ee) 15%, transparent);
		color: var(--btn-accent, #a5f3fc);
		box-shadow: 0 0 12px color-mix(in srgb, var(--btn-accent, #22d3ee) 15%, transparent);
	}

	.mainstat-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.substats-grid {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.substat-row {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		padding: 0.35rem 0.5rem;
		border-radius: 12px;
		background: rgba(30, 41, 59, 0.35);
		border: 1px solid rgba(71, 85, 105, 0.15);
	}

	.modal-footer {
		display: flex; gap: 0.75rem; padding-top: 0.75rem;
		border-top: 1px solid rgba(148, 163, 184, 0.08);
	}

	.footer-btn {
		flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.4rem;
		padding: 0.65rem 1rem; border-radius: 16px; font-size: 0.85rem; font-weight: 600;
		border: none; cursor: pointer; transition: all 0.15s ease;
	}

	.footer-btn.primary-btn { background: rgba(34, 211, 238, 0.15); border: 1px solid rgba(34, 211, 238, 0.3); color: #a5f3fc; }
	.footer-btn.primary-btn:hover { background: rgba(34, 211, 238, 0.25); }
	.remove-btn { background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.25); color: #fca5a5; }
	.remove-btn:hover { background: rgba(239, 68, 68, 0.22); }

	@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
	@keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
</style>
