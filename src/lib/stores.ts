import { writable } from 'svelte/store';
import { browser } from '$app/env';

type Theme = 'light' | 'dark' | 'theme-girl' | 'theme-boy';

const initialTheme: Theme = browser ? (localStorage.getItem('theme') as Theme) || 'light' : 'light';

export const theme = writable<Theme>(initialTheme);

theme.subscribe((value) => {
	if (browser) {
		localStorage.setItem('theme', value);
	}
});
