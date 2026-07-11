<script lang="ts">
	import { getState } from "$lib/stores/app.svelte";
	import { t } from "$lib/i18n/index.svelte";
	import ServerTab from "$lib/components/ServerTab.svelte";
	import AgentsTab from "$lib/components/AgentsTab.svelte";
	import WeaponsTab from "$lib/components/WeaponsTab.svelte";
	import DiscsTab from "$lib/components/DiscsTab.svelte";
	import EndgamesTab from "$lib/components/EndgamesTab.svelte";

	const state = getState();
</script>

{#if state.activeTab === "agents"}
	<AgentsTab />
{:else if state.activeTab === "server"}
	<ServerTab />
{:else if state.activeTab === "weapons"}
	<WeaponsTab />
{:else if state.activeTab === "discs"}
	<DiscsTab />
{:else if state.activeTab === "endgames"}
	<EndgamesTab />
{/if}
