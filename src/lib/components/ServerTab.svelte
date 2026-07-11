<script lang="ts">
	import { getState } from "$lib/stores/app.svelte";
	import { getServer, startServerPolling, stopServerPolling } from "$lib/stores/server.svelte";
	import { DEFAULT_PLAYER_UID } from "$lib/config";
	import { t } from "$lib/i18n/index.svelte";
	import { showToast } from "$lib/stores/toast.svelte";
	import { onMount, onDestroy } from "svelte";

	const app = getState();
	const server = getServer();

	let serverActionPending = $state(false);
	let pathInput = $state("");
	let playerUid = $state(DEFAULT_PLAYER_UID);

	let applyPending = $state(false);

	$effect(() => {
		if (app.remiellePath && !pathInput) {
			pathInput = app.remiellePath;
		}
		if (app.remielleUid && !playerUid) {
			playerUid = app.remielleUid;
		}

	});

	async function applyConfig(uid: string | null = null) {
		try {
			const resolvedUid = (uid ?? playerUid ?? DEFAULT_PLAYER_UID).toString().trim() || DEFAULT_PLAYER_UID;
			const resolvedPath = pathInput.trim() || app.remiellePath;
			if (resolvedPath) {
				app.remiellePath = resolvedPath;
			}
			showToast(`Applying saved config for UID ${resolvedUid}...`, "info");
			applyPending = true;
			const applyRes = await fetch("/api/server/apply-all", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ config: app.zonConfig, uid: resolvedUid, path: resolvedPath }),
			});
			try {
				const applyData = await applyRes.json();
				if (applyData.success) {
					const ok = applyData.messages.filter((m: string) => m.endsWith("OK")).length;
					showToast(`Config applied (${ok}/${applyData.messages.length} items)`, "success");
				} else {
					showToast("Apply config failed: " + (applyData.message || "unknown"), "error");
				}
			} finally {
				applyPending = false;
			}
		} catch (e) {
			// console.error(`[ServerTab] applyConfig error:`, e);
			showToast("Apply config error: " + String(e), "error");
		}
	}

	async function serverAction(action: string) {
		savePathImmediate();
		serverActionPending = true;
		try {
			// include server override settings from UI
			const res = await fetch(`/api/server/${action}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path: app.remiellePath }),
			});
			await server.fetchStatus();
			if (action === "start" || action === "restart") {
				showToast(t("toast.serverStarted"));
			} else if (action === "stop") {
				showToast(t("toast.serverStopped"));
			}
		} catch (e) {
			showToast(t("toast.serverActionFailed") + ": " + String(e), "error");
		}
		serverActionPending = false;
	}

	function savePathImmediate() {
		const trimmed = pathInput.trim();
		if (trimmed) {
			app.remiellePath = trimmed;
		}
	}

	async function savePath() {
		const trimmed = pathInput.trim();
		if (!trimmed) {
			showToast(t("toast.enterServerPath"));
			return;
		}
		app.remiellePath = trimmed;
		// persist other server settings
		app.remielleUid = playerUid ?? app.remielleUid;

		showToast(t("toast.serverPathUpdated"));
	}

	onMount(() => {
		startServerPolling();
	});

	onDestroy(() => {
		stopServerPolling();
	});
</script>

<div class="space-y-5">
	<section>
		<div class="flex flex-wrap items-center justify-between gap-4">
			<div>
				<h3 class="text-lg font-semibold text-white">{t("server.controlPanel")}</h3>
				<p class="mt-1 text-sm text-slate-400">
					{server.running ? t("server.running") : t("server.stopped")}
					{#if server.pid}
						&middot; {t("server.pid")}: {server.pid}
					{/if}
				</p>
			</div>
			<div class="flex flex-wrap gap-2">
				<button class="primary-btn" onclick={() => serverAction("start")} disabled={serverActionPending}>
					{t("server.start")}
				</button>
				<button class="secondary-btn" onclick={() => serverAction("stop")} disabled={serverActionPending}>
					{t("server.stop")}
				</button>
				<button class="secondary-btn" onclick={() => serverAction("restart")} disabled={serverActionPending}>
					{t("server.restart")}
				</button>
			</div>
		</div>
		<div class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
			<div class="flex flex-col gap-1">
				<label class="text-sm font-medium text-slate-200" for="player-uid-input">Player UID</label>
				<input
					id="player-uid-input"
					type="text"
					class="field-input w-40"
					bind:value={playerUid}
				/>
			</div>
			<div class="flex items-center gap-2">
				<button class="primary-btn" onclick={() => applyConfig()} disabled={applyPending}>
					{#if applyPending}
						<svg class="h-4 w-4 mr-2 inline-block animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" stroke-width="3" stroke-opacity="0.25"></circle><path d="M22 12a10 10 0 0 1-10 10" stroke-width="3"></path></svg>
					{/if}
					Import Config
				</button>
				<span class="text-xs text-slate-400">&mdash; Import Config &mdash; apply config to the game manually</span>
			</div>
		</div>
	</section>

	<section>
		<label class="text-sm font-medium text-slate-200" for="server-path-input">{t("server.pathLabel")}</label>
		<div class="mt-2 flex flex-col gap-3 sm:flex-row">
			<input
				id="server-path-input"
				type="text"
				class="field-input"
				placeholder={t("server.pathPlaceholder")}
				bind:value={pathInput}
				onkeydown={(e) => { if (e.key === "Enter") savePath(); }}
			/>
			<button class="primary-btn shrink-0" onclick={savePath}>{t("server.savePath")}</button>
		</div>

	</section>
</div>

