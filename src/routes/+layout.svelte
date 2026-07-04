<script lang="ts">
	import "../app.css";
	import { getState, persist } from "$lib/stores/app.svelte";
	import { t } from "$lib/i18n/index.svelte";
	import { startServerPolling, stopServerPolling } from "$lib/stores/server.svelte";
	import { onMount } from "svelte";
	import { getToasts } from "$lib/stores/toast.svelte";
	let { children }: { children: import("svelte").Snippet } = $props();

	const app = getState();
	const toasts = getToasts();

	const navItems = [
		{ tab: "agents" as const, img: "https://static.nanoka.cc/assets/zzz/zzz_character.webp", key: "nav.agents" },
		{ tab: "server" as const, img: "https://static.nanoka.cc/assets/zzz/zzz_homepage.webp", key: "nav.server" },
		{ tab: "weapons" as const, img: "https://static.nanoka.cc/assets/zzz/zzz_weapon.webp", key: "nav.weapons" },
		{ tab: "discs" as const, img: "https://static.nanoka.cc/assets/zzz/zzz_DriveDisc.webp", key: "nav.discs" },
		{ tab: "endgames" as const, img: "https://static.nanoka.cc/assets/zzz/zzz_shiyu.webp", key: "nav.endgames" },
	];

	function switchTab(tab: typeof app.activeTab) {
		if (app.activeTab === "server" && tab !== "server") {
			stopServerPolling();
		}
		app.activeTab = tab;
		if (tab === "agents") app.search = "";
		if (tab === "weapons") app.weaponSearch = "";
		if (tab === "discs") app.discSearch = "";
		if (tab === "endgames") app.endgameSearch = "";
		if (tab === "server") {
			startServerPolling();
		}
	}

	onMount(() => {
		if (app.activeTab === "server") {
			startServerPolling();
		}
	});

	// Auto-persist: deeply track all reactive state, persist on every change
	$effect(() => {
		// Read all state to establish reactive tracking on deep mutations
		const _ = JSON.stringify({
			activeTab: app.activeTab,
			language: app.language,
			search: app.search,
			weaponSearch: app.weaponSearch,
			discSearch: app.discSearch,
			endgameSearch: app.endgameSearch,
			endgameType: app.endgameType,
			remiellePath: app.remiellePath,
			zonConfig: app.zonConfig,
			selectedAgents: app.selectedAgents,
			selectedWeapons: app.selectedWeapons,
		});
		persist();
	});
</script>

<div class="app-shell min-h-screen text-slate-100">
	<div class="dashboard-wrapper mx-auto max-w-7xl px-4 py-5 lg:px-5 lg:py-6">
		<!-- Sidebar - Fixed floating nav on the left -->
		<aside class="fixed left-4 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-4 w-fit">
			<nav class="flex flex-col items-center gap-1 rounded-2xl border border-cyan-400/20 bg-slate-950/90 backdrop-blur-xl p-2.5 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
				{#each navItems as item}
					<button
						class="group relative flex items-center justify-center rounded-full p-2 transition-all duration-200 {app.activeTab === item.tab ? 'bg-cyan-400/20 text-cyan-200' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}"
						onclick={() => switchTab(item.tab)}
					>
						<img src={item.img} alt={t(item.key)} class="h-7 w-7 rounded object-cover" />
						<span class="absolute left-full ml-2 rounded-lg border border-slate-700 bg-slate-900/95 px-2.5 py-1 text-xs font-medium text-slate-200 opacity-0 shadow-lg backdrop-blur-lg transition-opacity duration-200 group-hover:opacity-100 whitespace-nowrap pointer-events-none">
							{t(item.key)}
						</span>
					</button>
				{/each}
			</nav>
		</aside>

		<!-- Main Content - padded left so fixed nav doesn't overlap -->
		<main class="min-w-0 pl-16 lg:pl-20">
			<div class="content-area space-y-6">
				{@render children()}
			</div>
		</main>
	</div>

	<!-- Toast container -->
	<div id="toast-root" class="fixed bottom-5 right-5 z-50 flex flex-col gap-3">
		{#each toasts as toast (toast.id)}
			<div class="animate-floatIn rounded-2xl border border-cyan-400/20 bg-slate-900/95 px-5 py-3 text-sm text-slate-100 shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl flex items-center gap-2">
				{#if toast.type === "success"}
					<span class="text-green-400">✓</span>
				{:else if toast.type === "error"}
					<span class="text-red-400">✕</span>
				{:else if toast.type === "warning"}
					<span class="text-yellow-400">⚠</span>
				{:else}
					<span class="text-cyan-400">ℹ</span>
				{/if}
				{toast.msg}
			</div>
		{/each}
	</div>

	<div class="fixed bottom-4 right-4 z-40 rounded-full bg-slate-900/90 px-3 py-1.5 text-[10px] uppercase tracking-[0.25em] shadow-[0_0_20px_rgba(34,211,238,0.15)] border border-cyan-400/20 backdrop-blur-xl">
		<span class="bg-gradient-to-r from-violet-300 via-cyan-300 to-emerald-300 bg-clip-text text-transparent">{t("fields.footerCredit")}</span>
	</div>
</div>

<style>
	.animate-floatIn {
		animation: floatIn 240ms ease-out;
	}
</style>
