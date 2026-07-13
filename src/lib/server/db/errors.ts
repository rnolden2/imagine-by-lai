export class SupabaseConnectionError extends Error {
	status = 503;
	publicMessage: string;

	constructor(message: string, cause?: unknown) {
		super(message);
		this.name = 'SupabaseConnectionError';
		this.cause = cause;
		this.publicMessage = message;
	}
}
