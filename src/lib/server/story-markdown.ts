import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

/** Generated and stored story content is untrusted, including legacy stories. */
export function renderStoryMarkdown(content: string): string {
	return sanitizeHtml(marked.parse(content, { async: false }), {
		allowedTags: [
			'p',
			'br',
			'hr',
			'h1',
			'h2',
			'h3',
			'h4',
			'h5',
			'h6',
			'strong',
			'em',
			'del',
			'blockquote',
			'ul',
			'ol',
			'li',
			'pre',
			'code'
		],
		allowedAttributes: {},
		// Keep the text of links, but no navigable URLs, images, embedded media,
		// styles, or event handlers. Reading a story must not contact third parties.
		disallowedTagsMode: 'discard'
	});
}
