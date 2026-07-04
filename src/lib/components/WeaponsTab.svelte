<script lang="ts">
	import { getWeapons, isLoading, getError } from "$lib/data/weapons.svelte";
	import { getState } from "$lib/stores/app.svelte";
	import { t } from "$lib/i18n/index.svelte";
	import { cleanWeaponId, clampNumber } from "$lib/utils/disc";
	import { showToast } from "$lib/stores/toast.svelte";
	import { getAssetUrl } from "$lib/api/zzz-api";
	import { getRankLabel, getRankIconSvg, WEAPON_TYPE_NAMES, WEAPON_TYPE_ICONS } from "$lib/constants";

	const app = getState();

	let searchInput = $state("");
	let weaponIdInput = $state("");
	let catalogOpen = $state(false);

	// Filter state
	let activeType = $state<number | null>(null);
	let activeRank = $state<number | null>(null);
	let activeSub = $state<string | null>(null);

	const weapons = $derived(getWeapons());
	const loading = $derived(isLoading());
	const error = $derived(getError());

	$effect(() => {
		app.weaponSearch = searchInput;
	});

	// Build unique filter options from weapon data
	const filterOptions = $derived({
		types: [...new Set(weapons.map((w) => w.type).filter((v): v is number => v != null))].sort((a, b) => a - b),
		ranks: [...new Set(weapons.map((w) => w.rank).filter((v): v is number => v != null))].sort((a, b) => b - a),
		subs: [...new Set(weapons.map((w) => w.sub).filter((v): v is string => v != null))].sort(),
	});

	function toggleFilter<T>(current: T | null, value: T, set: (v: T | null) => void) {
		set(current === value ? null : value);
	}

	function hasActiveFilters(): boolean {
		return activeType != null || activeRank != null || activeSub != null;
	}

	function clearFilters() {
		activeType = null;
		activeRank = null;
		activeSub = null;
	}

	function getTypeIcon(val: number): string {
		return WEAPON_TYPE_ICONS[val] ? getAssetUrl(WEAPON_TYPE_ICONS[val]) : "";
	}

	function getTypeName(val: number): string {
		return WEAPON_TYPE_NAMES[val] ?? `Type ${val}`;
	}

	const filteredWeapons = $derived(
		weapons
			.filter((w) => {
				if (searchInput && !w.name?.toLowerCase().includes(searchInput.toLowerCase())) return false;
				if (activeType != null && w.type !== activeType) return false;
				if (activeRank != null && w.rank !== activeRank) return false;
				if (activeSub != null && w.sub !== activeSub) return false;
				return true;
			})
			.sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
	);

	// === Modal state ===
	let modalWeapon = $state<{ id: number; name?: string; icon?: string } | null>(null);
	let modalLevel = $state(60);
	let modalRefine = $state(1);
	let editIndex = $state<number | null>(null);

	function openAddModal(weapon: { id: number; name?: string; icon?: string }) {
		modalWeapon = { id: weapon.id, name: weapon.name, icon: weapon.icon };
		modalLevel = 60;
		modalRefine = 1;
		editIndex = null;
	}

	function openEditModal(index: number) {
		const entry = app.zonConfig.configWeapons[index];
		if (!entry) return;
		const w = weapons.find((w2) => w2.id === Number(entry.id));
		modalWeapon = { id: Number(entry.id), name: w?.name, icon: w?.icon };
		modalLevel = entry.level ?? 60;
		modalRefine = entry.refine ?? 1;
		editIndex = index;
	}

	function closeModal() {
		modalWeapon = null;
		editIndex = null;
	}

	function saveWeapon() {
		if (!modalWeapon) return;
		const w = weapons.find((w2) => w2.id === modalWeapon!.id);
		const entry = {
			id: String(modalWeapon.id),
			level: modalLevel,
			star: 5,
			refine: modalRefine,
			enumName: w?.enumName,
		};
		if (editIndex != null) {
			app.zonConfig.configWeapons[editIndex] = entry;
		} else {
			app.zonConfig.configWeapons.push(entry);
		}
		app.zonConfig.importHighlights.weapons = true;
		showToast("Weapon " + (editIndex != null ? "updated" : "added"), "success");
		closeModal();
	}

	function removeWeapon(index: number) {
		app.zonConfig.configWeapons.splice(index, 1);
		closeModal();
	}

	function addWeaponById() {
		const id = cleanWeaponId(weaponIdInput);
		if (!id) {
			showToast("Invalid weapon ID", "error");
			return;
		}
		const w = weapons.find((w2) => w2.id === Number(id));
		openAddModal({ id: Number(id), name: w?.name, icon: w?.icon });
		weaponIdInput = "";
	}

	function getWeaponName(id: string): string {
		const w = weapons.find((w2) => w2.id === Number(id));
		return w?.name ?? id;
	}

	function getWeaponIcon(id: string): string | undefined {
		const w = weapons.find((w2) => w2.id === Number(id));
		return w?.icon;
	}

	function rankLabel(id: number): string {
		return getRankLabel(id);
	}
</script>

<div class="weapons-page">
	<!-- Header: Search + Add by ID -->
	<div class="flex items-center gap-3 mb-3">
		<div class="relative flex-1">
			<svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
			</svg>
			<input
				id="weapon-search-main"
				type="search"
				class="field-input !pl-9"
				placeholder={t("weapon.search")}
				bind:value={searchInput}
			/>
		</div>
		<div class="flex items-center gap-2 shrink-0">
			<input
				id="weapon-add-id"
				type="text"
				class="field-input !w-28 !py-2.5 text-sm"
				placeholder="Weapon ID"
				bind:value={weaponIdInput}
				onkeydown={(e) => { if (e.key === "Enter") addWeaponById(); }}
			/>
			<button class="primary-btn !py-2.5 !px-4 text-sm" onclick={addWeaponById} title="Add by ID">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
					<path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
				</svg>
			</button>
		</div>
	</div>

	<!-- Add Weapon button — opens catalog popup -->
	<button class="catalog-open-btn" onclick={() => catalogOpen = true}>
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="catalog-open-icon">
			<path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
		</svg>
		<span>Add Weapon</span>
	</button>

	<!-- Inventory -->
	{#if app.zonConfig.configWeapons.length > 0}
		{@const sortedWeapons = app.zonConfig.configWeapons
			.map((e, i) => ({ entry: e, originalIndex: i }))
			.sort((a, b) => {
				const rankA = Number(a.entry.id) >= 14000 ? 3 : Number(a.entry.id) >= 13000 ? 2 : 1;
				const rankB = Number(b.entry.id) >= 14000 ? 3 : Number(b.entry.id) >= 13000 ? 2 : 1;
				if (rankB !== rankA) return rankB - rankA;
				const nameA = (getWeaponName(a.entry.id) || "").toLowerCase();
				const nameB = (getWeaponName(b.entry.id) || "").toLowerCase();
				if (nameA < nameB) return -1;
				if (nameA > nameB) return 1;
				return (a.entry.refine ?? 1) - (b.entry.refine ?? 1);
			})
		}
		<section>
			<h3 class="text-sm font-semibold text-white mb-3">
				{t("weapon.inventoryAdded")}
				<span class="text-xs font-normal text-slate-500 ml-2">({app.zonConfig.configWeapons.length})</span>
			</h3>
			<div class="weapon-inv-grid">
				{#each sortedWeapons as { entry, originalIndex }}
					{@const icon = getWeaponIcon(entry.id)}
					{@const numId = Number(entry.id)}
					<button
						class="weapon-inv-card"
						class:rank-s={numId >= 14000}
						class:rank-a={numId >= 13000 && numId < 14000}
						onclick={() => openEditModal(originalIndex)}
					>
						<div class="weapon-inv-rank" class:rank-s={numId >= 14000} class:rank-a={numId >= 13000 && numId < 14000}>
							{rankLabel(numId)}
						</div>
						<div class="weapon-inv-icon-wrap">
							{#if icon}
								<img src={icon} alt={getWeaponName(entry.id)} class="weapon-inv-icon" loading="lazy" />
							{:else}
								<div class="weapon-inv-icon-fallback">{getWeaponName(entry.id).charAt(0)}</div>
							{/if}
						</div>
						<div class="weapon-inv-info">
							<p class="weapon-inv-name">{getWeaponName(entry.id)}</p>
							<div class="weapon-inv-meta">
								<span class="weapon-inv-level">Lv.{entry.level ?? 60}</span>
								<span class="weapon-inv-refine">R{entry.refine ?? 1}</span>
							</div>
						</div>
						<div class="weapon-inv-remove">
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
		<div class="catalog-popup" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && (catalogOpen = false)} role="dialog" aria-modal="true" aria-label="Weapon catalog" tabindex="-1">
			<div class="catalog-popup-header">
				<h2 class="catalog-popup-title">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="catalog-popup-title-icon">
						<path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
					</svg>
					Select Weapon
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
					id="catalog-weapon-search"
					type="search"
					class="catalog-popup-search-input"
					placeholder={t("weapon.search")}
					bind:value={searchInput}
				/>
			</div>
			<!-- Filter Chips inside catalog popup -->
			<div class="catalog-filters">
				<div class="catalog-filter-row">
					<span class="catalog-filter-label">{t("weapon.filter.type")}</span>
					<div class="catalog-filter-chips">
						{#each filterOptions.types as val}
							{@const isActive = activeType === val}
							<button class="chip-filter" class:active={isActive}
								onclick={() => toggleFilter(activeType, val, (v) => activeType = v)}>
								<img src={getTypeIcon(val)} alt="" class="h-4 w-4 shrink-0 rounded-sm" />
								{getTypeName(val)}
							</button>
						{/each}
					</div>
				</div>
				<div class="catalog-filter-row">
					<span class="catalog-filter-label">{t("weapon.filter.rank")}</span>
					<div class="catalog-filter-chips">
						{#each filterOptions.ranks as val}
							{@const isActive = activeRank === val}
							<button class="chip-filter" class:active={isActive}
								onclick={() => toggleFilter(activeRank, val, (v) => activeRank = v)}>
								<img src={getRankIconSvg(val >= 4)} alt="" class="h-4 w-4 shrink-0 rounded-sm" />
								<span class="font-bold">{getRankLabel(val)}</span>
							</button>
						{/each}
					</div>
				</div>
				<div class="catalog-filter-row">
					<span class="catalog-filter-label">{t("weapon.filter.sub")}</span>
					<div class="catalog-filter-chips">
						{#each filterOptions.subs as val}
							{@const isActive = activeSub === val}
							<button class="chip-filter" class:active={isActive}
								onclick={() => toggleFilter(activeSub, val, (v) => activeSub = v)}>
								{val}
							</button>
						{/each}
						{#if hasActiveFilters()}
							<button class="chip-filter !border-rose-500/30 !text-rose-300 hover:!border-rose-500/50"
								onclick={clearFilters}>
								{t("weapon.filter.all")}
							</button>
						{/if}
					</div>
				</div>
			</div>
			<div class="catalog-popup-body">
				{#if loading}
					<div class="text-center text-sm text-slate-400 py-8">{t("weapon.loading")}</div>
				{:else if error}
					<div class="text-center text-sm text-red-400 py-8">{t("weapon.loadError")}: {error}</div>
				{:else if filteredWeapons.length === 0}
					<div class="text-center text-sm text-slate-400 py-8">{t("weapon.noResults")}</div>
				{:else}
					<div class="weapon-catalog-grid">
						{#each filteredWeapons as weapon (weapon.id)}
							{@const numId = weapon.id}
							<button
								class="weapon-catalog-card"
								class:rank-s={numId >= 14000}
								class:rank-a={numId >= 13000 && numId < 14000}
								onclick={() => { catalogOpen = false; openAddModal(weapon); }}
							>
								<div class="weapon-catalog-rank" class:rank-s={numId >= 14000} class:rank-a={numId >= 13000 && numId < 14000}>
									{rankLabel(numId)}
								</div>
								{#if weapon.icon}
									<img src={weapon.icon} alt={weapon.name ?? String(weapon.id)} class="weapon-catalog-icon" loading="lazy" />
								{:else}
									<div class="weapon-catalog-icon-fallback">?</div>
								{/if}
								<div class="weapon-catalog-info">
									<p class="weapon-catalog-name">{weapon.name ?? `ID ${weapon.id}`}</p>
									<p class="weapon-catalog-id">ID: {weapon.id}</p>
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
{#if modalWeapon}
	<div class="modal-overlay" onclick={closeModal} onkeydown={(e) => e.key === 'Escape' && closeModal()} role="presentation">
		<div class="modal-panel" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && closeModal()} role="dialog" aria-modal="true" aria-label="Configure weapon" tabindex="0">
			<button class="modal-close" aria-label="Close" onclick={closeModal}>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5">
					<path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
				</svg>
			</button>
			<div class="modal-header" style="--accent: {Number(modalWeapon.id) >= 14000 ? '#fbbf24' : '#a78bfa'}">
				<div class="modal-icon-wrap">
					{#if modalWeapon.icon}
						<img src={modalWeapon.icon} alt={modalWeapon.name ?? ""} class="modal-icon weapon-modal-icon" />
					{:else}
						<div class="modal-icon-fallback">{(modalWeapon.name ?? "?").charAt(0)}</div>
					{/if}
					<div class="weapon-modal-rank" class:rank-s={Number(modalWeapon.id) >= 14000} class:rank-a={Number(modalWeapon.id) >= 13000 && Number(modalWeapon.id) < 14000}>
						{rankLabel(Number(modalWeapon.id))}
					</div>
				</div>
				<div class="modal-title-group">
					<h2 class="modal-name">{modalWeapon.name ?? `Weapon #${modalWeapon.id}`}</h2>
					<p class="modal-subtitle">ID: {modalWeapon.id} &middot; {editIndex != null ? "Editing" : "Adding"}</p>
				</div>
			</div>
			<div class="modal-body">
				<div class="modal-row-2">
					<div class="field-group">
						<label for="weapon-modal-level" class="field-label">{t("weapon.level")}</label>
						<select id="weapon-modal-level" class="field-input modal-select" value={modalLevel}
							onchange={(e) => modalLevel = Number((e.target as HTMLSelectElement).value)}>
							{#each [...Array(60).keys()] as i}
								<option value={i + 1}>{i + 1}</option>
							{/each}
						</select>
					</div>
					<div class="field-group">
						<label for="weapon-modal-refine" class="field-label">{t("weapon.refine")}</label>
						<select id="weapon-modal-refine" class="field-input modal-select" value={modalRefine}
							onchange={(e) => modalRefine = Number((e.target as HTMLSelectElement).value)}>
							{#each [1, 2, 3, 4, 5] as r}
								<option value={r}>R{r}</option>
							{/each}
						</select>
					</div>
				</div>
			</div>
			<div class="modal-footer">
				{#if editIndex != null}
					<button class="footer-btn remove-btn" onclick={() => removeWeapon(editIndex!)}>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
							<path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c-.84 0-1.673.025-2.5.075V3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25v.325C11.673 4.025 10.84 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" />
						</svg>
						Remove
					</button>
				{/if}
				<button class="footer-btn primary-btn" onclick={saveWeapon}>
					{editIndex != null ? "Update" : "Add to Config"}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* === Layout === */
	.weapons-page { animation: floatIn 240ms ease-out; }

	/* === Chip filter (reused from agent style) === */
	.chip-filter {
		display: inline-flex; align-items: center; gap: 0.3rem;
		padding: 0.25rem 0.65rem; border-radius: 9999px;
		border: 1px solid rgba(71, 85, 105, 0.4);
		background: rgba(15, 23, 42, 0.5); color: #94a3b8;
		font-size: 0.7rem; font-weight: 600; cursor: pointer;
		transition: all 0.15s ease; outline: none; white-space: nowrap;
	}
	.chip-filter:hover { border-color: rgba(56, 189, 248, 0.4); color: rgb(186, 230, 253); background: rgba(30, 41, 59, 0.8); }
	.chip-filter.active { border-color: rgba(56, 189, 248, 0.6); background: rgba(56, 189, 248, 0.15); color: rgb(186, 230, 253); }

	/* === Catalog Filter Chips Layout === */
	.catalog-filters { padding: 0.5rem 1.25rem; flex-shrink: 0; display: flex; flex-direction: column; gap: 0.45rem; border-bottom: 1px solid rgba(148, 163, 184, 0.08); }
	.catalog-filter-row { display: flex; align-items: flex-start; gap: 0.6rem; }
	.catalog-filter-label { min-width: 60px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; line-height: 28px; flex-shrink: 0; }
	.catalog-filter-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; }

	/* === Catalog Open Button === */
	.catalog-open-btn {
		display: flex; align-items: center; justify-content: center; gap: 0.6rem;
		width: 100%; padding: 0.85rem 1.2rem; border-radius: 16px;
		border: 1px dashed rgba(34, 211, 238, 0.35);
		background: rgba(34, 211, 238, 0.04); color: #a5f3fc;
		cursor: pointer; transition: all 0.2s ease; outline: none;
		margin-bottom: 0.75rem; font-size: 0.9rem; font-weight: 600;
	}
	.catalog-open-btn:hover { border-color: rgba(34, 211, 238, 0.6); background: rgba(34, 211, 238, 0.1); box-shadow: 0 4px 20px rgba(34, 211, 238, 0.08); }
	.catalog-open-icon { width: 18px; height: 18px; color: #22d3ee; }

	/* === Weapon Catalog Grid (popup) === */
	.weapon-catalog-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 0.6rem; }
	.weapon-catalog-card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 0.85rem 0.6rem 0.75rem; border-radius: 16px; border: 1px solid rgba(71, 85, 105, 0.25); background: rgba(15, 23, 42, 0.55); cursor: pointer; transition: all 0.2s ease; overflow: hidden; outline: none; text-align: center; }
	.weapon-catalog-card:hover { border-color: rgba(34, 211, 238, 0.35); background: rgba(15, 23, 42, 0.8); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3); }
	.weapon-catalog-rank { position: absolute; top: 6px; right: 6px; width: 22px; height: 22px; border-radius: 50%; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center; border: 2px solid rgba(2, 6, 23, 0.8); z-index: 2; }
	.weapon-catalog-rank.rank-s { background: linear-gradient(135deg, #fbbf24, #f59e0b); color: #1e1b0a; }
	.weapon-catalog-rank.rank-a { background: linear-gradient(135deg, #a78bfa, #8b5cf6); color: #1e1b4b; }
	.weapon-catalog-icon { width: 52px; height: 52px; object-fit: contain; border-radius: 10px; background: rgba(30, 41, 59, 0.6); padding: 4px; }
	.weapon-catalog-icon-fallback { width: 52px; height: 52px; border-radius: 10px; background: rgba(30, 41, 59, 0.6); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: 700; color: #64748b; }
	.weapon-catalog-info { min-width: 0; width: 100%; }
	.weapon-catalog-name { font-size: 0.75rem; font-weight: 600; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 0; line-height: 1.3; }
	.weapon-catalog-id { font-size: 0.6rem; color: #64748b; margin: 0.1rem 0 0; }

	/* === Inventory Grid === */
	.weapon-inv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem; }
	.weapon-inv-card { position: relative; display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; border-radius: 18px; border: 1px solid rgba(71, 85, 105, 0.2); background: rgba(15, 23, 42, 0.6); cursor: pointer; transition: all 0.2s ease; overflow: hidden; outline: none; text-align: left; }
	.weapon-inv-card:hover { border-color: rgba(34, 211, 238, 0.35); box-shadow: 0 0 24px rgba(34, 211, 238, 0.1); transform: translateY(-2px); background: rgba(15, 23, 42, 0.85); }
	.weapon-inv-rank { position: absolute; top: 6px; right: 6px; width: 22px; height: 22px; border-radius: 50%; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center; border: 2px solid rgba(2, 6, 23, 0.8); z-index: 2; }
	.weapon-inv-rank.rank-s { background: linear-gradient(135deg, #fbbf24, #f59e0b); color: #1e1b0a; }
	.weapon-inv-rank.rank-a { background: linear-gradient(135deg, #a78bfa, #8b5cf6); color: #1e1b4b; }
	.weapon-inv-icon-wrap { width: 48px; height: 48px; border-radius: 12px; background: rgba(30, 41, 59, 0.7); overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
	.weapon-inv-icon { width: 100%; height: 100%; object-fit: contain; padding: 3px; }
	.weapon-inv-icon-fallback { font-size: 1rem; font-weight: 700; color: #64748b; }
	.weapon-inv-info { flex: 1; min-width: 0; }
	.weapon-inv-name { font-size: 0.8rem; font-weight: 600; color: #f1f5f9; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.weapon-inv-meta { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.2rem; }
	.weapon-inv-level { font-size: 0.65rem; font-weight: 500; color: #94a3b8; }
	.weapon-inv-refine { font-size: 0.65rem; font-weight: 600; color: #fbbf24; background: rgba(251, 191, 36, 0.1); padding: 0.05rem 0.4rem; border-radius: 6px; }
	.weapon-inv-remove { position: absolute; bottom: 6px; right: 6px; width: 24px; height: 24px; border-radius: 50%; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.15); color: #fca5a5; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s ease; z-index: 2; }
	.weapon-inv-card:hover .weapon-inv-remove { opacity: 1; }

	/* === Weapon Modal Rank Badge === */
	.weapon-modal-rank { position: absolute; bottom: -4px; right: -4px; width: 24px; height: 24px; border-radius: 50%; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center; border: 2px solid rgba(2, 6, 23, 0.8); }
	.weapon-modal-rank.rank-s { background: linear-gradient(135deg, #fbbf24, #f59e0b); color: #1e1b0a; }
	.weapon-modal-rank.rank-a { background: linear-gradient(135deg, #a78bfa, #8b5cf6); color: #1e1b4b; }
	.weapon-modal-icon { padding: 6px; }

	/* === Shared modal/popup global styles === */
	:global(.catalog-overlay) { position: fixed; inset: 0; background: rgba(2, 6, 23, 0.75); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; z-index: 1000; animation: fadeIn 0.15s ease-out; padding: 1rem; }
	:global(.catalog-popup) { position: relative; width: 100%; max-width: 960px; max-height: 88vh; background: rgba(15, 23, 42, 0.97); border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 24px; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6); animation: slideUp 0.2s ease-out; display: flex; flex-direction: column; overflow: hidden; }
	:global(.catalog-popup-header) { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; border-bottom: 1px solid rgba(148, 163, 184, 0.1); flex-shrink: 0; }
	:global(.catalog-popup-title) { display: flex; align-items: center; gap: 0.6rem; font-size: 1rem; font-weight: 700; color: #f1f5f9; margin: 0; }
	:global(.catalog-popup-title-icon) { width: 20px; height: 20px; color: #22d3ee; }
	:global(.catalog-popup-close) { width: 32px; height: 32px; border-radius: 50%; border: none; background: rgba(71, 85, 105, 0.25); color: #94a3b8; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s ease; flex-shrink: 0; }
	:global(.catalog-popup-close:hover) { background: rgba(239, 68, 68, 0.25); color: #fca5a5; }
	:global(.catalog-popup-search) { position: relative; padding: 0.75rem 1.25rem; flex-shrink: 0; }
	:global(.catalog-popup-search-icon) { position: absolute; left: 1.75rem; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; color: #64748b; pointer-events: none; }
	:global(.catalog-popup-search-input) { width: 100%; padding: 0.65rem 1rem 0.65rem 2.25rem; border-radius: 14px; border: 1px solid rgba(71, 85, 105, 0.6); background: rgba(2, 6, 23, 0.7); color: #f8fafc; outline: none; font-size: 0.85rem; transition: border-color 180ms ease, box-shadow 180ms ease; }
	:global(.catalog-popup-search-input:focus) { border-color: rgba(34, 211, 238, 0.6); box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.12); }
	:global(.catalog-popup-body) { padding: 0 1.25rem 1.25rem; overflow-y: auto; flex: 1; }

	:global(.modal-overlay) { position: fixed; inset: 0; background: rgba(2, 6, 23, 0.7); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 1000; animation: fadeIn 0.15s ease-out; padding: 1rem; }
	:global(.modal-panel) { position: relative; width: 100%; max-width: 420px; background: rgba(15, 23, 42, 0.96); border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 28px; padding: 1.5rem; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6); animation: slideUp 0.2s ease-out; }
	:global(.modal-close) { position: absolute; top: 12px; right: 12px; width: 32px; height: 32px; border-radius: 50%; border: none; background: rgba(71, 85, 105, 0.25); color: #94a3b8; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s ease; z-index: 5; }
	:global(.modal-close:hover) { background: rgba(239, 68, 68, 0.25); color: #fca5a5; }
	:global(.modal-header) { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.25rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(148, 163, 184, 0.1); }
	:global(.modal-icon-wrap) { position: relative; flex-shrink: 0; width: 64px; height: 64px; border-radius: 16px; overflow: hidden; box-shadow: 0 0 0 2px var(--accent, #22d3ee); background: rgba(30, 41, 59, 0.7); display: flex; align-items: center; justify-content: center; }
	:global(.modal-icon) { width: 100%; height: 100%; object-fit: contain; }
	:global(.modal-icon-fallback) { font-size: 1.5rem; font-weight: 700; color: #94a3b8; }
	:global(.modal-title-group) { flex: 1; min-width: 0; }
	:global(.modal-name) { font-size: 1.05rem; font-weight: 700; color: #f1f5f9; margin: 0; line-height: 1.3; }
	:global(.modal-subtitle) { font-size: 0.75rem; color: #64748b; margin-top: 0.2rem; }
	:global(.modal-body) { display: flex; flex-direction: column; gap: 0.9rem; margin-bottom: 1rem; }
	:global(.field-group) { display: flex; flex-direction: column; gap: 0.35rem; }
	:global(.field-label) { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
	:global(.modal-row-2) { display: grid; grid-template-columns: 1fr 0.7fr; gap: 0.75rem; }
	:global(.modal-select) { padding: 0.55rem 0.75rem; font-size: 0.85rem; cursor: pointer; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2364748b'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 0.6rem center; background-size: 1rem; padding-right: 2rem; }
	:global(.modal-footer) { display: flex; gap: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(148, 163, 184, 0.08); }
	:global(.footer-btn) { flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.4rem; padding: 0.65rem 1rem; border-radius: 16px; font-size: 0.85rem; font-weight: 600; border: none; cursor: pointer; transition: all 0.15s ease; }
	:global(.footer-btn.primary-btn) { background: rgba(34, 211, 238, 0.15); border: 1px solid rgba(34, 211, 238, 0.3); color: #a5f3fc; }
	:global(.footer-btn.primary-btn:hover) { background: rgba(34, 211, 238, 0.25); }
	:global(.remove-btn) { background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.25); color: #fca5a5; }
	:global(.remove-btn:hover) { background: rgba(239, 68, 68, 0.22); }

	@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
	@keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
</style>