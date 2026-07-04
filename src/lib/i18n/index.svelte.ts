import { t as translate } from "$lib/i18n/translations";

export function t(key: string, vars?: Record<string, string | number>): string {
	return translate(key, vars);
}
