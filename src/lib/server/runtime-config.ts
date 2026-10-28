import * as privateVariables from '$app/env/private';
import * as publicVariables from '$app/env/public';

/** Typed runtime configuration; tests replace this module with synthetic values. */
export const env = { ...privateVariables, ...publicVariables };
