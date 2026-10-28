import { expect, it } from 'vitest';
import { renderStoryMarkdown } from './story-markdown';

it('preserves readable story formatting', () => {
	const html = renderStoryMarkdown(
		'# Title\n\n**Bold** and *gentle*.\n\n- One\n- Two\n\n> A lesson.'
	);
	expect(html).toContain('<h1>Title</h1>');
	expect(html).toContain('<strong>Bold</strong>');
	expect(html).toContain('<em>gentle</em>');
	expect(html).toContain('<li>One</li>');
	expect(html).toContain('<blockquote>');
});
it.each([
	'<script>alert(document.cookie)</script><p>Story</p>',
	'<img src=x onerror="alert(1)"><p onclick="alert(1)">Story</p>',
	'[Story](javascript:alert%281%29)',
	'<a href="data:text/html,evil">Story</a>',
	'<iframe srcdoc="<script>alert(1)</script>"></iframe>Story',
	'<svg><a xlink:href="javascript:alert(1)">Story</a></svg>',
	'<math><mtext><img src=x onerror=alert(1)></mtext></math>Story',
	'<form><input autofocus onfocus="alert(1)"></form>Story',
	'<style>body{display:none}</style><p style="background:url(https://tracker.example)">Story</p>',
	'![tracking pixel](https://tracker.example/image) Story'
])('removes executable markup and external resources: %s', (content) => {
	const html = renderStoryMarkdown(content);
	expect(html).not.toMatch(/<(?:script|img|svg|math|iframe|form|input|style|a)(?:\s|>)/i);
	expect(html).not.toMatch(/(?:src|href|onerror|onclick|style)=/i);
	expect(html).not.toContain('tracker.example');
});
