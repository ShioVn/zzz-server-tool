<script lang="ts">
	import {
		getAgents,
		isLoading,
		getError,
		getElementNames,
		getWeaponTypeNames,
		getHitTypeNames,
		getCampNames,
	} from "$lib/data/agents.svelte";
	import { getState } from "$lib/stores/app.svelte";
	import { t } from "$lib/i18n/index.svelte";
	import { showToast } from "$lib/stores/toast.svelte";
	import { clampNumber } from "$lib/utils/disc";
	import type { AvatarOverride } from "$lib/types";
	import { getAssetUrl } from "$lib/api/zzz-api";
	import {
		getRankLabel, getRankClass, getElementColor, getRankIconSvg,
		ELEMENT_ICONS, WEAPON_TYPE_ICONS, HIT_TYPE_ICONS,
	} from "$lib/constants";

	const app = getState();

	let searchInput = $state("");
	let activeElement = $state<number | null>(null);
	let activeWeaponType = $state<number | null>(null);
	let activeHitType = $state<number | null>(null);
	let activeCamp = $state<number | null>(null);
	let activeRank = $state<number | null>(null);

	// Modal state
	let selectedAgentId = $state<number | null>(null);
	let editingLevel = $state(60);
	let editingTalents = $state(0);
	let editingAwakening = $state<number | undefined>(undefined);

	const agents = $derived(getAgents());
	const loading = $derived(isLoading());
	const error = $derived(getError());

	const elementNames = $derived(getElementNames());
	const weaponTypeNames = $derived(getWeaponTypeNames());
	const hitTypeNames = $derived(getHitTypeNames());
	const campNames = $derived(getCampNames());

	$effect(() => {
		app.search = searchInput;
	});

	// Build unique sorted filter options from data
	const filterOptions = $derived({
		elements: [...new Set(agents.map((a) => a.element).filter((v): v is number => v != null))].sort((a, b) => a - b),
		weaponTypes: [...new Set(agents.map((a) => a.weaponType).filter((v): v is number => v != null))].sort((a, b) => a - b),
		hitTypes: [...new Set(agents.map((a) => a.hitType).filter((v): v is number => v != null))].sort((a, b) => a - b),
		camps: [...new Set(agents.map((a) => a.camp).filter((v): v is number => v != null))].sort((a, b) => a - b),
		ranks: [...new Set(agents.map((a) => a.rank).filter((v): v is number => v != null))].sort((a, b) => b - a),
	});

	const filterGroups = $derived([
		{ label: t("agent.filter.element"), items: filterOptions.elements, active: activeElement, names: elementNames, icon: (v: number) => getAssetUrl(ELEMENT_ICONS[v]), set: (v: number | null) => activeElement = v },
		{ label: t("agent.filter.weaponType"), items: filterOptions.weaponTypes, active: activeWeaponType, names: weaponTypeNames, icon: (v: number) => getAssetUrl(WEAPON_TYPE_ICONS[v]), set: (v: number | null) => activeWeaponType = v },
		{ label: t("agent.filter.hitType"), items: filterOptions.hitTypes, active: activeHitType, names: hitTypeNames, icon: (v: number) => getAssetUrl(HIT_TYPE_ICONS[v]), set: (v: number | null) => activeHitType = v },
		{ label: t("agent.filter.camp"), items: filterOptions.camps, active: activeCamp, names: campNames, icon: getCampIcon, set: (v: number | null) => activeCamp = v },
		{ label: t("agent.filter.rank"), items: filterOptions.ranks, active: activeRank, names: {}, icon: (v: number) => getRankIconSvg(v >= 4), set: (v: number | null) => activeRank = v },
	]);

	function toggleFilter(current: number | null, value: number, set: (v: number | null) => void) {
		set(current === value ? null : value);
	}

	// Icon URL mapping for filter chips
	function getCampIcon(val: number): string {
		const agent = agents.find((a) => a.camp === val && a.icon);
		return agent?.icon ?? "";
	}

	function hasActiveFilters(): boolean {
		return activeElement != null || activeWeaponType != null || activeHitType != null || activeCamp != null || activeRank != null;
	}

	function clearFilters() {
		activeElement = null;
		activeWeaponType = null;
		activeHitType = null;
		activeCamp = null;
		activeRank = null;
	}

	const filteredAgents = $derived(
		agents.filter((a) => {
			if (searchInput && !a.name?.toLowerCase().includes(searchInput.toLowerCase())) return false;
			if (activeElement != null && a.element !== activeElement) return false;
			if (activeWeaponType != null && a.weaponType !== activeWeaponType) return false;
			if (activeHitType != null && a.hitType !== activeHitType) return false;
			if (activeCamp != null && a.camp !== activeCamp) return false;
			if (activeRank != null && a.rank !== activeRank) return false;
			return true;
		})
	);

	const configIdSet = $derived<string[]>(
		app.zonConfig.avatarOverrides.map((o) => o.id)
	);

	function getOverride(agentId: number): AvatarOverride | undefined {
		const agent = agents.find((a) => a.id === agentId);
		const enumName = agent?.zonEnum || String(agentId);
		return app.zonConfig.avatarOverrides.find(
			(a) => a.id === enumName || a.id === String(agentId)
		);
	}

	function isAgentInConfig(agentId: number): boolean {
		const agent = agents.find((a) => a.id === agentId);
		const enumName = agent?.zonEnum || String(agentId);
		return configIdSet.includes(enumName) || configIdSet.includes(String(agentId));
	}

	type AgentDisplayInfo = {
		inConfig: boolean;
		elColor: string;
		elementIcon: string;
		weaponIcon: string;
		rankLabel: string;
		rankClass: string;
	};
	const agentDisplayMap = $derived<Map<number, AgentDisplayInfo>>(
		new Map(filteredAgents.map((a) => [
			a.id,
			{
				inConfig: isAgentInConfig(a.id),
				elColor: getElementColor(a.element),
				elementIcon: getAssetUrl(ELEMENT_ICONS[a.element ?? -1] ?? ""),
				weaponIcon: getAssetUrl(WEAPON_TYPE_ICONS[a.weaponType ?? -1] ?? ""),
				rankLabel: getRankLabel(a.rank ?? 5),
				rankClass: getRankClass(a.rank ?? 5),
			}
		]))
	);

	// --- Modal handlers ---
	function openModal(agentId: number) {
		const agent = agents.find((a) => a.id === agentId);
		if (!agent) return;
		const existing = getOverride(agentId);
		editingLevel = existing?.level ?? 60;
		editingTalents = existing?.talents ?? 0;
		editingAwakening = existing?.awakening ?? agent.awakeningId;
		selectedAgentId = agentId;
	}

	function closeModal() {
		selectedAgentId = null;
	}

	function saveModal() {
		const id = selectedAgentId;
		if (id == null) return;
		const agent = agents.find((a) => a.id === id);
		const enumName = agent?.zonEnum || String(id);
		const existing = getOverride(id);
		if (existing) {
			existing.id = enumName;
			existing.level = editingLevel;
			existing.rank = 6;
			existing.talents = editingTalents;
			if (editingAwakening !== undefined) existing.awakening = editingAwakening;
		} else {
			const override: AvatarOverride = {
				id: enumName,
				level: editingLevel,
				rank: 6,
				talents: editingTalents,
			};
			if (editingAwakening !== undefined) override.awakening = editingAwakening;
			app.zonConfig.avatarOverrides.push(override);
		}
		app.zonConfig.importHighlights.avatars = true;
		showToast(t("toast.avatarUpdated"), "success");
		closeModal();
	}

	function removeAgent(id: number) {
		const agent = agents.find((a) => a.id === id);
		const enumName = agent?.zonEnum || String(id);
		const idx = app.zonConfig.avatarOverrides.findIndex(
			(a) => a.id === enumName || a.id === String(id)
		);
		if (idx >= 0) {
			app.zonConfig.avatarOverrides.splice(idx, 1);
			showToast(t("toast.avatarRemoved") ?? "Agent removed", "success");
		}
		closeModal();
	}

	function agentInitial(name: string | undefined): string {
		if (!name) return "?";
		return name.charAt(0).toUpperCase();
	}
</script>

<div class="space-y-4">
	<!-- Search + Filters -->
	<div class="flex items-center gap-2">
		<div class="relative flex-1">
			<svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
			</svg>
			<input
				id="agent-search"
				type="search"
				class="field-input !pl-9"
				placeholder={t("agent.search")}
				bind:value={searchInput}
			/>
		</div>
		{#if hasActiveFilters()}
			<button
				class="shrink-0 rounded-full border border-slate-700/50 px-3 py-1.5 text-xs text-slate-400 transition hover:border-rose-500/30 hover:text-rose-300"
				onclick={clearFilters}
			>
				{t("agent.filter.all")}
			</button>
		{/if}
	</div>

	<!-- Filter Chips -->
	<div class="flex flex-wrap gap-4">
		{#each filterGroups as group}
			<div class="flex flex-wrap items-center gap-1.5">
				<span class="min-w-[80px] text-[11px] font-semibold uppercase tracking-wider text-slate-500">{group.label}</span>
				<div class="flex flex-wrap items-center gap-1">
					{#each group.items as val}
						{@const isActive = group.active === val}
						<button
							class="chip-filter"
							class:active={isActive}
							onclick={() => toggleFilter(group.active, val, group.set)}
						>
							<img
								src={group.icon?.(val) ?? ""}
								alt=""
								class="h-4 w-4 shrink-0 rounded-sm"
							/>
							{#if group.label === t("agent.filter.rank")}
								<span class="font-bold">{val >= 4 ? "S" : "A"}</span>
							{:else}
								{group.names[val] ?? val}
							{/if}
						</button>
					{/each}
				</div>
			</div>
		{/each}
	</div>

	<!-- Loading / Error / Empty -->
	{#if loading}
		<div class="mt-3 text-center text-sm text-slate-400">{t("agent.loading")}</div>
	{:else if error}
		<div class="mt-3 text-center text-sm text-red-400">{t("agent.loadError")}: {error}</div>
	{:else if filteredAgents.length === 0}
		<div class="mt-3 text-center text-sm text-slate-400">{t("agent.noResults")}</div>
	{/if}

	<!-- Agent Grid: compact image cards -->
	<div class="agent-grid">
		{#each filteredAgents as agent (agent.id)}
			{@const info = agentDisplayMap.get(agent.id)!}
			<button
				class="agent-card"
				class:in-config={info.inConfig}
				style="--accent: {info.elColor}"
				onclick={() => openModal(agent.id)}
				title={agent.name ?? String(agent.id)}
			>
				{#if agent.icon}
					<img
						src={agent.icon}
						alt={agent.name ?? String(agent.id)}
						class="agent-avatar"
						loading="lazy"
						onerror={(e) => { (e.target as HTMLImageElement).remove(); }}
					/>
				{/if}

				<!-- Element badge -->
				<div class="agent-badge element-badge" style="--badge-bg: {info.elColor}">
					<img src={info.elementIcon} alt="" class="badge-icon" />
				</div>

				<!-- Weapon type badge -->
				<div class="agent-badge weapon-badge">
					<img src={info.weaponIcon} alt="" class="badge-icon" />
				</div>

				<!-- Rank badge -->
				<div class="agent-rank-badge {info.rankClass}">{info.rankLabel}</div>

				<!-- Config checkmark -->
				{#if info.inConfig}
					<div class="agent-check">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="check-icon">
							<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
						</svg>
					</div>
				{/if}

				<!-- Name strip overlay at bottom -->
				<div class="agent-strip">
					<span class="agent-name">{agent.name ?? `ID ${agent.id}`}</span>
				</div>
			</button>
		{/each}
	</div>
</div>

<!-- Agent Config Modal -->
{#if selectedAgentId != null}
	{@const agent = agents.find((a) => a.id === selectedAgentId)!}
	{@const inConfig = isAgentInConfig(selectedAgentId)}
	{@const elColor = getElementColor(agent.element)}
	<div class="modal-overlay" onclick={closeModal} onkeydown={(e) => e.key === 'Escape' && closeModal()} role="presentation">
		<div class="modal-panel" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && closeModal()} role="dialog" aria-modal="true" aria-label="Configure agent" tabindex="0">
			<button class="modal-close" aria-label="Close" onclick={closeModal}>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5">
					<path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
				</svg>
			</button>

			<div class="modal-header" style="--el-color: {elColor}">
				<div class="modal-avatar-wrap">
					{#if agent.icon}
						<img src={agent.icon} alt={agent.name ?? ""} class="modal-avatar" />
					{:else}
						<div class="modal-avatar-fallback">{agentInitial(agent.name)}</div>
					{/if}
					<div class="modal-rank-badge {getRankClass(agent.rank ?? 5)}">
						{getRankLabel(agent.rank ?? 5)}
					</div>
				</div>
				<div class="modal-title-group">
					<h2 class="modal-agent-name">{agent.name ?? `Agent #${agent.id}`}</h2>
					<div class="modal-tags">
						<span class="modal-tag" style="--tag-color: {elColor}">
							{elementNames[agent.element ?? -1] ?? "Unknown"}
						</span>
						<span class="modal-tag">{weaponTypeNames[agent.weaponType ?? -1] ?? "Unknown"}</span>
					</div>
				</div>
			</div>

			<div class="modal-body">
				<div class="field-row">
					<label for="modal-level" class="field-label">Level</label>
					<select id="modal-level" class="field-input modal-select" bind:value={editingLevel}>
						{#each [...Array(60).keys()] as i}
							<option value={i + 1}>{i + 1}</option>
						{/each}
					</select>
				</div>

				<div class="field-row">
					<label for="talent-0" class="field-label">Talents</label>
					<div class="talents-selector">
						{#each [0, 1, 2, 3, 4, 5, 6] as tal}
							<button
								id="talent-{tal}"
								class="talent-btn"
								class:active={editingTalents === tal}
								onclick={() => editingTalents = tal}
							>
								{tal}
							</button>
						{/each}
					</div>
				</div>

				{#if agent.awakeningId}
					<div class="field-row">
						<label for="awakening-toggle" class="field-label">Awakening</label>
						<div class="awakening-selector">
							<label class="toggle-label">
								<input
									id="awakening-toggle"
									type="checkbox"
									class="toggle-input"
									checked={editingAwakening != null}
									onchange={(e) => {
										if ((e.target as HTMLInputElement).checked) {
											editingAwakening = agent.awakeningId;
										} else {
											editingAwakening = undefined;
										}
									}}
								/>
								<span class="toggle-track">
									<span class="toggle-thumb"></span>
								</span>
								<span class="toggle-text">
									{editingAwakening != null ? `Enabled (ID: ${editingAwakening})` : "Disabled"}
								</span>
							</label>
						</div>
					</div>
				{/if}
			</div>

			<div class="modal-footer">
				{#if inConfig}
					<button class="footer-btn remove-btn" onclick={() => removeAgent(selectedAgentId!)}>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
							<path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c-.84 0-1.673.025-2.5.075V3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25v.325C11.673 4.025 10.84 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" />
						</svg>
						Remove
					</button>
				{/if}
				<button class="footer-btn primary-btn" onclick={saveModal}>
					{inConfig ? "Update" : "Add to Config"}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* === Agent Grid: max 5 per row === */
	.agent-grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0.5rem;
		contain: layout style;
	}

	@media (max-width: 640px) {
		.agent-grid { grid-template-columns: repeat(3, 1fr); }
	}

	/* Compact card: image fills button, badges overlaid, name strip at bottom */
	.agent-card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-end;
		aspect-ratio: 3 / 4;
		padding: 0;
		border-radius: 14px;
		border: 2px solid rgba(71, 85, 105, 0.25);
		background: rgba(15, 23, 42, 0.5);
		cursor: pointer;
		overflow: hidden;
		transition: all 0.18s ease;
		outline: none;
		text-align: center;
		contain: layout style;
	}

	.agent-card:hover {
		border-color: rgba(148, 163, 184, 0.4);
		transform: translateY(-3px);
		box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
	}

	.agent-card.in-config {
		border-color: var(--accent, #22d3ee);
		box-shadow: 0 0 18px color-mix(in srgb, var(--accent, #22d3ee) 30%, transparent);
		background: rgba(15, 23, 42, 0.85);
	}

	.agent-avatar {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		object-position: center;
		pointer-events: none;
		z-index: 0;
		transform: scale(1.15);
	}

	.agent-card::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(180deg, rgba(2,6,23,0.05) 40%, rgba(2,6,23,0.4) 100%);
		pointer-events: none;
		z-index: 1;
	}

	.agent-badge {
		position: absolute;
		width: 22px;
		height: 22px;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 3;
		background: rgba(2, 6, 23, 0.8);
		backdrop-filter: blur(4px);
		border: 1px solid rgba(148, 163, 184, 0.2);
		overflow: hidden;
	}

	.element-badge { top: 6px; left: 6px; }
	.weapon-badge { top: 6px; right: 6px; }
	.badge-icon { width: 14px; height: 14px; object-fit: contain; pointer-events: none; }

	.agent-rank-badge {
		position: absolute;
		bottom: 32px;
		right: 6px;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		font-size: 11px;
		font-weight: 800;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px solid rgba(2, 6, 23, 0.9);
		z-index: 3;
	}

	.rank-s { background: linear-gradient(135deg, #fbbf24, #f59e0b); color: #1e1b0a; }
	.rank-a { background: linear-gradient(135deg, #a78bfa, #8b5cf6); color: #1e1b4b; }

	.agent-check {
		position: absolute;
		bottom: 32px;
		left: 6px;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--accent, #22d3ee);
		color: #02050f;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 3;
		box-shadow: 0 0 8px color-mix(in srgb, var(--accent, #22d3ee) 50%, transparent);
	}
	.check-icon { width: 12px; height: 12px; }

	.agent-strip {
		position: relative;
		z-index: 2;
		width: 100%;
		padding: 0.25rem 0.3rem;
		background: linear-gradient(transparent, rgba(2, 6, 23, 0.9) 40%);
		pointer-events: none;
	}

	.agent-name {
		display: block;
		font-size: 10px;
		font-weight: 600;
		color: #e2e8f0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		line-height: 1.3;
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
		max-width: 420px;
		background: rgba(15, 23, 42, 0.96);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 28px;
		padding: 1.5rem 1.5rem 1rem;
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
		animation: slideUp 0.2s ease-out;
	}

	.modal-close {
		position: absolute; top: 12px; right: 12px;
		width: 32px; height: 32px; border-radius: 50%; border: none;
		background: rgba(71, 85, 105, 0.25); color: #94a3b8;
		cursor: pointer; display: flex; align-items: center; justify-content: center;
		transition: all 0.15s ease; z-index: 5;
	}
	.modal-close:hover { background: rgba(239, 68, 68, 0.25); color: #fca5a5; }

	.modal-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.25rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(148, 163, 184, 0.1); }

	.modal-avatar-wrap { position: relative; flex-shrink: 0; width: 72px; height: 72px; border-radius: 18px; overflow: hidden; box-shadow: 0 0 0 2px var(--el-color, #22d3ee); background: rgba(30, 41, 59, 0.7); }
	.modal-avatar { width: 100%; height: 100%; object-fit: cover; }
	.modal-avatar-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700; color: #94a3b8; }

	.modal-rank-badge { position: absolute; bottom: -3px; right: -3px; width: 24px; height: 24px; border-radius: 50%; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; border: 2px solid rgba(2, 6, 23, 0.8); }

	.modal-title-group { flex: 1; min-width: 0; }
	.modal-agent-name { font-size: 1.15rem; font-weight: 700; color: #f1f5f9; margin: 0; line-height: 1.3; }
	.modal-tags { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.4rem; }
	.modal-tag { display: inline-block; font-size: 10px; font-weight: 600; padding: 0.15rem 0.55rem; border-radius: 999px; background: rgba(71, 85, 105, 0.25); color: var(--tag-color, #94a3b8); border: 1px solid color-mix(in srgb, var(--tag-color, transparent) 30%, transparent); text-transform: uppercase; letter-spacing: 0.03em; }

	.modal-body { display: flex; flex-direction: column; gap: 0.9rem; margin-bottom: 1rem; }
	.field-row { display: flex; flex-direction: column; gap: 0.3rem; }
	.field-label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }

	.modal-select { padding: 0.55rem 0.75rem; font-size: 0.9rem; cursor: pointer; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2364748b'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 0.6rem center; background-size: 1rem; padding-right: 2rem; }

	.talents-selector { display: flex; flex-wrap: wrap; gap: 0.35rem; }
	.talent-btn { flex: 1; min-width: 36px; padding: 0.5rem 0.2rem; border-radius: 12px; border: 1px solid rgba(71, 85, 105, 0.4); background: rgba(30, 41, 59, 0.6); color: #94a3b8; font-size: 11px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; text-align: center; }
	.talent-btn:hover { border-color: rgba(148, 163, 184, 0.5); background: rgba(30, 41, 59, 0.85); }
	.talent-btn.active { border-color: #22d3ee; background: rgba(34, 211, 238, 0.12); color: #a5f3fc; box-shadow: 0 0 12px rgba(34, 211, 238, 0.12); }

	.awakening-selector { display: flex; }
	.toggle-label { display: flex; align-items: center; gap: 0.6rem; cursor: pointer; }
	.toggle-input { display: none; }
	.toggle-track { position: relative; width: 38px; height: 22px; border-radius: 999px; background: rgba(71, 85, 105, 0.4); transition: background 0.2s ease; }
	.toggle-input:checked + .toggle-track { background: rgba(34, 211, 238, 0.5); }
	.toggle-thumb { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #94a3b8; transition: all 0.2s ease; }
	.toggle-input:checked + .toggle-track .toggle-thumb { left: 18px; background: #22d3ee; }
	.toggle-text { font-size: 12px; color: #94a3b8; }

	.modal-footer { display: flex; gap: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(148, 163, 184, 0.08); }
	.footer-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.4rem; padding: 0.65rem 1rem; border-radius: 16px; font-size: 0.85rem; font-weight: 600; border: none; cursor: pointer; transition: all 0.15s ease; }
	.footer-btn.primary-btn { background: rgba(34, 211, 238, 0.15); border: 1px solid rgba(34, 211, 238, 0.3); color: #a5f3fc; }
	.footer-btn.primary-btn:hover { background: rgba(34, 211, 238, 0.25); }
	.remove-btn { background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.25); color: #fca5a5; }
	.remove-btn:hover { background: rgba(239, 68, 68, 0.22); }

	@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
	@keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }

	.chip-filter {
		display: inline-flex; align-items: center; gap: 0.25rem;
		padding: 0.2rem 0.65rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 500;
		white-space: nowrap; border: 1px solid rgba(100, 116, 139, 0.2);
		background: rgba(30, 41, 59, 0.5); color: rgb(148, 163, 184);
		transition: all 0.15s ease; cursor: pointer;
	}
	.chip-filter:hover { border-color: rgba(56, 189, 248, 0.4); color: rgb(186, 230, 253); background: rgba(30, 41, 59, 0.8); }
	.chip-filter.active { border-color: rgba(56, 189, 248, 0.6); background: rgba(56, 189, 248, 0.15); color: rgb(186, 230, 253); }
</style>
