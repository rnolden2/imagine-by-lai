import { resolve } from '$app/paths';

const prefix = 'practice-pending-v1:';
const lifetime = 86400000;
const maximumPending = 100;
const memory = new Map<string, Pending>();
const inFlight = new Map<string, Promise<void>>();
export const practiceHistoryChanged = 'practice-history-changed';
type Pending = {
	kind: 'math' | 'spelling';
	body: Record<string, unknown> & { eventId: string; occurredAt: string };
};

function changed() {
	if (typeof window !== 'undefined') window.dispatchEvent(new Event(practiceHistoryChanged));
}
function remove(id: string) {
	memory.delete(id);
	try {
		localStorage.removeItem(prefix + id);
	} catch {
		/* Memory fallback remains usable. */
	}
}
function valid(value: unknown): value is Pending {
	if (!value || typeof value !== 'object') return false;
	const entry = value as Pending;
	const time = Date.parse(entry.body?.occurredAt);
	return (
		(entry.kind === 'math' || entry.kind === 'spelling') &&
		typeof entry.body?.eventId === 'string' &&
		/^[0-9a-f-]{36}$/i.test(entry.body.eventId) &&
		Number.isFinite(time) &&
		time > Date.now() - lifetime &&
		time <= Date.now() + 300000
	);
}
function pending(): Pending[] {
	const entries = new Map(memory);
	try {
		// Separate keys prevent two tabs from overwriting each other's pending results.
		for (const key of Object.keys(localStorage)) {
			if (!key.startsWith(prefix)) continue;
			try {
				const raw = localStorage.getItem(key) ?? '';
				const entry: unknown = raw.length <= 8192 ? JSON.parse(raw) : null;
				if (valid(entry) && key === prefix + entry.body.eventId)
					entries.set(entry.body.eventId, entry);
				else localStorage.removeItem(key);
			} catch {
				localStorage.removeItem(key);
			}
		}
	} catch {
		/* Private browsing can deny persistent storage. */
	}
	for (const [id, entry] of entries) {
		if (!valid(entry)) {
			entries.delete(id);
			remove(id);
		}
	}
	return [...entries.values()];
}
export function pendingPracticeCount() {
	return pending().length;
}

function send(entry: Pending): Promise<void> {
	const id = entry.body.eventId;
	const existing = inFlight.get(id);
	if (existing) return existing;
	const work = (async () => {
		const response = await fetch(resolve(entry.kind === 'math' ? '/api/math' : '/api/spelling'), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(entry.body),
			signal: AbortSignal.timeout(15000)
		});
		if (!response.ok) throw new Error('Practice history could not be saved.');
		const result = await response.json();
		if (result.success !== true) throw new Error('Practice history save was not confirmed.');
		remove(id);
	})().finally(() => {
		inFlight.delete(id);
		changed();
	});
	inFlight.set(id, work);
	return work;
}
export async function savePracticeAttempt(kind: Pending['kind'], payload: Record<string, unknown>) {
	if (pending().length >= maximumPending)
		throw new Error('Too many practice results are waiting to save. Reconnect before continuing.');
	const entry: Pending = {
		kind,
		body: { ...payload, eventId: crypto.randomUUID(), occurredAt: new Date().toISOString() }
	};
	try {
		localStorage.setItem(prefix + entry.body.eventId, JSON.stringify(entry));
	} catch {
		// Keep the result while this tab remains open and still attempt the network save.
		memory.set(entry.body.eventId, entry);
	}
	changed();
	await send(entry);
}
export async function retryPracticeHistory() {
	// A failed connection stops this batch; user action or an online event retries it.
	for (const entry of pending().slice(0, maximumPending)) {
		try {
			await send(entry);
		} catch {
			break;
		}
	}
	changed();
}
