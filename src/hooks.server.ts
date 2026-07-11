import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	// Silently ignore Chrome DevTools / other well-known probes
	if (event.url.pathname.startsWith('/.well-known/')) {
		return new Response(null, { status: 204 });
	}
	return resolve(event);
};
