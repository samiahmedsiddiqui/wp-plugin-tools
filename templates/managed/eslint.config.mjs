// Managed by wp-plugin-tools; changes are overwritten by bin/sync. https://github.com/samiahmedsiddiqui/wp-plugin-tools
// Plugin-specific globals can be listed in .wp-plugin-tools.json under `eslint.globals`.
import fs from 'node:fs';
import wordpress from '@wordpress/eslint-plugin';
import globals from 'globals';

const config = fs.existsSync('.wp-plugin-tools.json')
	? JSON.parse(fs.readFileSync('.wp-plugin-tools.json', 'utf8'))
	: {};
const extraGlobals = Object.fromEntries(
	(config.eslint?.globals || []).map((name) => [name, 'readonly'])
);

export default [
	{
		ignores: [
			'vendor/**',
			'node_modules/**',
			'**/*.min.js',
			...(config.eslint?.ignores || []),
		],
	},
	...wordpress.configs.recommended,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				jQuery: 'readonly',
				wp: 'readonly',
				...extraGlobals,
			},
		},
	},
];
