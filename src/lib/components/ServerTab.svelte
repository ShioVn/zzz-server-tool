<script lang="ts">
	import { getState } from "$lib/stores/app.svelte";
	import { getServer, startServerPolling, stopServerPolling } from "$lib/stores/server.svelte";
	import { t } from "$lib/i18n/index.svelte";
	import { downloadTextFile, buildZonConfigText } from "$lib/utils/disc";
	import { onMount, onDestroy } from "svelte";

	const app = getState();
	const server = getServer();

	let serverActionPending = $state(false);
	let savePending = $state(false);
	let saveRestartPending = $state(false);
	let pathInput = $state("");

	// Initialize pathInput from saved path
	$effect(() => {
		if (app.remiellePath && !pathInput) {
			pathInput = app.remiellePath;
		}
	});

	function showToast(msg: string) {
		const fn = (globalThis as unknown as Record<string, unknown>).__showToast as (m: string) => void;
		fn?.(msg);
	}

	async function serverAction(action: string) {
		// Save the path input first so it's always current
		savePathImmediate();
		serverActionPending = true;
		try {
			const res = await fetch(`/api/server/${action}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path: app.remiellePath }),
			});
			await server.fetchStatus();
			if (action === "start") showToast(t("toast.serverStarted"));
			else if (action === "stop") showToast(t("toast.serverStopped"));
			else if (action === "restart") showToast(t("toast.serverRestarted"));
		} catch {
			// ignore
		}
		serverActionPending = false;
	}

	// Synchronous version — saves path without showing duplicate toast
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
		showToast(t("toast.serverPathUpdated"));
	}

	async function saveConfig() {
		// Save path first
		savePathImmediate();
		savePending = true;
		try {
			const { getAwakeneableAgentCodes, isLoading } = await import("$lib/data/agents.svelte");
			
			// Wait for agents to finish loading if still loading
			if (isLoading()) {
				showToast(t("toast.waitForAgents"));
				// Wait a bit for loading to complete
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
			
			await fetch("/api/server/save-config", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path: app.remiellePath, text: buildZonConfigText(app.zonConfig, getAwakeneableAgentCodes()) }),
			});

			// Encode bin directly without restarting
			await fetch("/api/server/encode-bin", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path: app.remiellePath }),
			});

			showToast(t("toast.configSaved"));
		} catch {
			// ignore
		}
		savePending = false;
	}

	async function saveAndRestart() {
		// Save path first so restart uses the correct directory
		savePathImmediate();
		saveRestartPending = true;
		try {
			const { getAwakeneableAgentCodes, isLoading } = await import("$lib/data/agents.svelte");

			if (isLoading()) {
				showToast(t("toast.waitForAgents"));
				await new Promise(resolve => setTimeout(resolve, 1000));
			}

			// 1. Save config.zon
			const configText = buildZonConfigText(app.zonConfig, getAwakeneableAgentCodes());
			await fetch("/api/server/save-config", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path: app.remiellePath, text: configText }),
			});

			// 2. Restart server — zig build will compile config.zon → USD_666.bin
			await fetch("/api/server/restart", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path: app.remiellePath }),
			});

			// 3. Wait for server to be fully up
			await server.fetchStatus();
			// Small extra wait for zig compile to finish
			await new Promise(resolve => setTimeout(resolve, 3000));

			// 4. Overwrite USD_666.bin with our encoded version (after zig is done)
			await fetch("/api/server/encode-bin", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path: app.remiellePath }),
			});

			await server.fetchStatus();
			showToast(t("toast.configSavedAndRestarted"));
		} catch {
			// ignore
		}
		saveRestartPending = false;
	}



	// Import/Export
	async function importJsonFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			const text = await file.text();
			const parsed = JSON.parse(text);
			if (parsed.zonConfig) app.zonConfig = parsed.zonConfig;
			if (parsed.agents) app.selectedAgents = parsed.agents;
			if (parsed.weapons) app.selectedWeapons = parsed.weapons;
			showToast(t("toast.dataImported"));
		} catch {
			showToast(t("toast.invalidJson"));
		}
		(e.target as HTMLInputElement).value = "";
	}

	function exportJson() {
		const payload = {
			zonConfig: app.zonConfig,
			agents: app.selectedAgents,
			weapons: app.selectedWeapons,
		};
		downloadTextFile(JSON.stringify(payload, null, 2), "ps-setup-vn.json", "application/json");
		showToast(t("toast.dataExported"));
	}

	async function importZonFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			const text = await file.text();
			const { parseZonConfigText } = await import("$lib/utils/disc");
			app.zonConfig = parseZonConfigText(text);
			showToast(t("toast.zonImported"));
		} catch {
			showToast(t("toast.zonImportInvalid"));
		}
		(e.target as HTMLInputElement).value = "";
	}

	async function exportZon() {
		const { getAwakeneableAgentCodes, isLoading } = await import("$lib/data/agents.svelte");
		
		// Wait for agents to finish loading if still loading
		if (isLoading()) {
			showToast(t("toast.waitForAgents"));
			await new Promise(resolve => setTimeout(resolve, 1000));
		}
		
		downloadTextFile(buildZonConfigText(app.zonConfig, getAwakeneableAgentCodes()), "config.zon", "text/plain");
		showToast(t("toast.zonExported"));
	}

	onMount(() => {
		startServerPolling();
	});

	onDestroy(() => {
		stopServerPolling();
	});
</script>

<div class="space-y-5">
	<!-- Server Control -->
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
	</section>

	<!-- Server Path -->
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
		{#if app.remiellePath}
			<p class="mt-2 text-xs text-slate-500">Current: {app.remiellePath}</p>
		{/if}
	</section>

	<!-- Save Config -->
	<section>
		<div class="flex items-center justify-between">
			<div>
				<h3 class="text-sm font-semibold text-white">{t("server.saveConfig")}</h3>
				<p class="text-xs text-slate-400">config.zon</p>
			</div>
			<div class="flex gap-2">
				<button class="primary-btn" onclick={saveConfig} disabled={savePending}>
					{t("server.saveConfig")}
				</button>
				<button class="secondary-btn" onclick={saveAndRestart} disabled={saveRestartPending}>
					{t("server.saveAndRestart")}
				</button>
			</div>
		</div>
	</section>

	<!-- Import / Export -->
	<section>
		<h3 class="text-sm font-semibold text-white">{t("sidebar.importExportTitle")}</h3>
		<div class="mt-2 flex flex-wrap gap-2">
			<button class="secondary-btn" onclick={() => document.getElementById("server-json-import")?.click()}>
				{t("buttons.importJson")}
			</button>
			<button class="secondary-btn" onclick={exportJson}>
				{t("buttons.exportJson")}
			</button>
			<button class="secondary-btn" onclick={() => document.getElementById("server-zon-import")?.click()}>
				{t("buttons.importZon")}
			</button>
			<button class="secondary-btn" onclick={exportZon}>
				{t("buttons.exportZon")}
			</button>
			<input id="server-json-import" type="file" accept="application/json" class="hidden" onchange={importJsonFile} />
			<input id="server-zon-import" type="file" accept=".zon" class="hidden" onchange={importZonFile} />
		</div>
	</section>


</div>
