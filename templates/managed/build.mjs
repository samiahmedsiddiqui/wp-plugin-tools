// Managed by wp-plugin-tools; changes are overwritten by bin/sync. https://github.com/samiahmedsiddiqui/wp-plugin-tools
//
// Minifies CSS and JS with esbuild. Configure in .wp-plugin-tools.json:
//
//   "build": [
//     { "src": "assets/css/src", "out": "assets/css", "ext": "css", "versioned": true },
//     { "src": "assets/js/src", "out": "assets/js", "ext": "js", "versioned": true }
//   ]
//
// `versioned` names the output `{name}-{version}.min.{ext}` (version from
// package.json) and deletes older `.min.{ext}` files in `out` first;
// otherwise `{name}.min.{ext}`.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const config = fs.existsSync('.wp-plugin-tools.json')
	? JSON.parse(fs.readFileSync('.wp-plugin-tools.json', 'utf8'))
	: {};
const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));

for (const entry of config.build || []) {
	if (!fs.existsSync(entry.src)) {
		continue;
	}

	const sources = fs
		.readdirSync(entry.src)
		.filter(
			(file) =>
				file.endsWith(`.${entry.ext}`) &&
				!file.endsWith(`.min.${entry.ext}`)
		)
		.map((file) => path.join(entry.src, file));
	if (!sources.length) {
		continue;
	}

	if (entry.versioned) {
		// Remove min files from previous versions.
		fs.readdirSync(entry.out)
			.filter((file) => file.endsWith(`.min.${entry.ext}`))
			.forEach((file) => fs.rmSync(path.join(entry.out, file)));
	}

	await build({
		entryPoints: sources,
		outdir: entry.out,
		entryNames: entry.versioned ? `[name]-${version}.min` : '[name].min',
		minify: true,
		logLevel: 'info',
	});
}
