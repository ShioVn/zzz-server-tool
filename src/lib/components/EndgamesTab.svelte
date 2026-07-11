<script lang="ts">
	import {
		getEndgames,
		isLoading,
		getError,
	} from "$lib/data/endgames.svelte";
	import { getState } from "$lib/stores/app.svelte";
	import { DEFAULT_PLAYER_UID } from "$lib/config";
	import { runControlCommand } from "$lib/stores/server.svelte";
	import { getAssetUrl } from "$lib/api/zzz-api";
	import { t } from "$lib/i18n/index.svelte";
	import { showToast } from "$lib/stores/toast.svelte";

	const app = getState();

	const endgames = $derived(getEndgames());
	const loading = $derived(isLoading());
	const error = $derived(getError());

	let playerUid = $state(DEFAULT_PLAYER_UID);

	// 4 sub-tabs
	const tabFilters = [
		{
			label: "Shiyu Defense",
			key: "Shiyu Defense",
			match: (eg: any) => eg.type === "Shiyu Defense",
		},
		{
			label: "Deadly Assault",
			key: "Deadly Assault",
			match: (eg: any) => eg.subType === "Deadly Assault",
		},
		{
			label: "Deadly Assault (Hard)",
			key: "Deadly Assault (Hard)",
			match: (eg: any) => eg.subType === "Deadly Assault (Hard)",
		},
		{
			label: "Threshold Simulation",
			key: "Simulation",
			match: (eg: any) => eg.type === "Simulation",
		},
	];

	let activeEndgameTab = $state("Shiyu Defense");

	const filteredEndgames = $derived(
		endgames.filter((eg) => {
			const tab = tabFilters.find((t) => t.key === activeEndgameTab);
			return tab ? tab.match(eg) : true;
		}),
	);

	async function selectEndgame(zoneId: number, type: string, subType: string) {
		try {
			if (type === "Shiyu Defense") {
				await runControlCommand("mod-hadal-entrance", ["hadal_zone_scheduled", String(zoneId)]);
				selectedShiyuId = zoneId;
			} else if (subType === "Deadly Assault") {
				await runControlCommand("mod-hadal-entrance", ["boss_challenge_normal", String(zoneId)]);
				selectedDaId = zoneId;
			} else if (subType === "Deadly Assault (Hard)") {
				await runControlCommand("mod-hadal-entrance", ["boss_challenge_hard", String(zoneId)]);
				selectedDaHardId = zoneId;
			} else {
				// Simulation — no rmctl call, just UI feedback
				selectedDaHardId = zoneId;
			}
			showToast(t("toast.endgameZoneSelected"), "success");
		} catch (e) {
			showToast("Failed to set zone: " + String(e), "error");
		}
	}

	let selectedShiyuId = $state<number | null>(null);
	let selectedDaId = $state<number | null>(null);
	let selectedDaHardId = $state<number | null>(null);

	function isZoneSelected(zoneId: number, type: string, subType: string): boolean {
		if (type === "Shiyu Defense") return selectedShiyuId === zoneId;
		if (subType === "Deadly Assault") return selectedDaId === zoneId;
		if (subType === "Deadly Assault (Hard)") return selectedDaHardId === zoneId;
		return false;
	}
</script>

<div class="space-y-5">
	<!-- Sub-tab navigation -->
	<section>
		<h3 class="mb-3 text-sm font-semibold text-white">
			{t("endgame.zoneTypes")}
		</h3>
		<div class="flex flex-wrap gap-2">
			{#each tabFilters as tab}
				<button
					class="rounded-full px-5 py-2 text-sm font-medium transition-all border {activeEndgameTab ===
					tab.key
						? 'bg-cyan-400/10 text-cyan-200 border-cyan-400/20'
						: 'bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-500'}"
					onclick={() => {
						activeEndgameTab = tab.key;
					}}
				>
					{tab.label}
				</button>
			{/each}
		</div>

		{#if loading}
			<div class="mt-3 text-center text-sm text-slate-400">
				{t("endgame.loading")}
			</div>
		{:else if error}
			<div class="mt-3 text-center text-sm text-red-400">
				{t("endgame.loadError")}: {error}
			</div>
		{:else if filteredEndgames.length === 0}
			<div class="mt-3 text-center text-sm text-slate-500 italic">
				{t("endgame.noResults")}
			</div>
		{/if}
	</section>

	<!-- Results: 2 per row, bigger cards -->
	{#if filteredEndgames.length > 0}
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			{#each filteredEndgames as eg (eg.id)}
				<button
					class="glass-card rounded-[24px] p-5 text-left transition-all hover:scale-[1.02] {isZoneSelected(
						eg.id, eg.type, eg.subType,
					)
						? 'border-cyan-400/50 ring-1 ring-cyan-400/20'
						: ''}"
					onclick={() => eg.type !== "Simulation" && selectEndgame(eg.id, eg.type, eg.subType)}
				>
					<div class="flex items-start justify-between gap-4">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-3 mb-1.5">
								<span
									class="text-lg font-bold text-cyan-300/80 font-mono"
									>#{eg.id}</span
								>
							</div>
							<p class="text-base font-semibold text-white">
								{eg.subType}
							</p>
							<p class="text-sm text-slate-400 mt-1">
								{eg.layerCount} layers
							</p>
							{#if eg.description}
								<p class="mt-2 text-sm text-slate-500">
									{eg.description}
								</p>
							{/if}
							{#if eg.bossIcons && eg.bossIcons.length > 0}
								<div class="mt-3 flex items-center gap-3">
									{#each eg.bossIcons as icon}
										<div
											class="w-50 h-50 rounded-2xl bg-slate-800/90 p-2 ring-1 ring-slate-600/60 overflow-hidden shadow-lg"
										>
											<img
												src={getAssetUrl(icon)}
												alt="boss"
												class="w-full h-full object-contain"
												onerror={(e) =>
													((
														e.target as HTMLImageElement
													).style.display = "none")}
											/>
										</div>
									{/each}
								</div>
							{/if}
						</div>
						{#if eg.type !== "Simulation"}
						<div class="shrink-0">
							{#if isZoneSelected(eg.id, eg.type, eg.subType)}
								<span class="stat-chip text-xs">{t("endgame.selected")}</span>
							{:else}
								<span class="stat-chip muted text-xs">{t("endgame.select")}</span>
							{/if}
						</div>
						{/if}
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>
