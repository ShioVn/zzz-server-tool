import { browser } from "$app/environment";

interface Toast {
	id: number;
	msg: string;
	type?: "info" | "success" | "error" | "warning";
}

let toasts = $state<Toast[]>([]);
let nextId = $state(0);

export function showToast(msg: string, type: Toast["type"] = "info") {
	if (!browser) return;
	const id = nextId++;
	toasts = [...toasts, { id, msg, type }];
	setTimeout(() => {
		toasts = toasts.filter((t) => t.id !== id);
	}, 3000);
}

export function getToasts() {
	return toasts;
}

export function dismissToast(id: number) {
	toasts = toasts.filter((t) => t.id !== id);
}
