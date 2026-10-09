#!/usr/bin/env node
/**
 * Applies wp-plugin-tools to a WordPress plugin repository, new or existing.
 *
 *   node bin/sync.mjs <plugin-dir> [--dry-run]
 *
 * - Creates `.wp-plugin-tools.json` from the plugin header if it's missing.
 * - Replaces managed files (templates/managed), filling in placeholders.
 * - Creates seed files (templates/seed) only where the plugin has none.
 * - Merges tool dependencies and scripts into package.json and composer.json.
 * - Adds required .gitattributes export-ignore and .gitignore entries.
 * - Lists files the tooling replaces, for you to delete.
 *
 * Run it again at any time to pick up tooling updates.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const toolsDir = path.dirname( path.dirname( fileURLToPath( import.meta.url ) ) );
const args = process.argv.slice( 2 );
const dryRun = args.includes( '--dry-run' );
const target = args.find( ( arg ) => ! arg.startsWith( '--' ) );

if ( ! target || ! fs.existsSync( target ) ) {
	console.error( 'Usage: node bin/sync.mjs <plugin-dir> [--dry-run]' );
	process.exit( 1 );
}

const root = path.resolve( target );
const changes = { created: [], updated: [], kept: [], unchanged: [] };
const readJson = ( file ) => JSON.parse( fs.readFileSync( file, 'utf8' ) );
const exists = ( file ) => fs.existsSync( path.join( root, file ) );

function write( file, content, kind ) {
	const full = path.join( root, file );
	const current = fs.existsSync( full ) ? fs.readFileSync( full, 'utf8' ) : null;
	if ( current === content ) {
		changes.unchanged.push( file );
		return;
	}
	changes[ null === current ? 'created' : 'updated' ].push( `${ file }${ kind ? ` (${ kind })` : '' }` );
	if ( ! dryRun ) {
		fs.mkdirSync( path.dirname( full ), { recursive: true } );
		fs.writeFileSync( full, content );
	}
}

// 1. Plugin config.
function header( content, field ) {
	const match = content.match( new RegExp( `^[ \\t/*#@]*${ field }:\\s*(.+)$`, 'mi' ) );
	return match ? match[ 1 ].trim() : '';
}

function detectConfig() {
	const mainFile = fs
		.readdirSync( root )
		.filter( ( file ) => file.endsWith( '.php' ) )
		.find( ( file ) => /^[ \t/*#@]*Plugin Name:/mi.test( fs.readFileSync( path.join( root, file ), 'utf8' ) ) );
	if ( ! mainFile ) {
		console.error( `No plugin main file (with a "Plugin Name:" header) found in ${ root }.` );
		process.exit( 1 );
	}
	const content = fs.readFileSync( path.join( root, mainFile ), 'utf8' );
	const slug = path.basename( mainFile, '.php' );
	const build = [];
	for ( const ext of [ 'css', 'js' ] ) {
		if ( fs.existsSync( path.join( root, `assets/${ ext }/src` ) ) ) {
			build.push( { src: `assets/${ ext }/src`, out: `assets/${ ext }`, ext, versioned: true } );
		}
	}
	return {
		slug,
		name: header( content, 'Plugin Name' ),
		mainFile,
		textDomain: header( content, 'Text Domain' ) || slug,
		requires: {
			wp: header( content, 'Requires at least' ) || '5.9',
			php: header( content, 'Requires PHP' ) || '7.4',
		},
		build,
		tests: { matrix: defaultMatrix( header( content, 'Requires at least' ), header( content, 'Requires PHP' ) ) },
	};
}

// Oldest supported versions the test tooling can run (WordPress 5.9 and PHP 7.4), plus the latest.
function defaultMatrix( minWp, minPhp ) {
	const atLeast = ( version, floor ) => ( version && version.localeCompare( floor, undefined, { numeric: true } ) > 0 ? version : floor );
	const oldPhp = atLeast( minPhp, '7.4' );
	const rows = [ { wp: atLeast( minWp, '5.9' ), php: oldPhp }, { wp: 'latest', php: oldPhp }, { wp: 'latest', php: '8.4' } ];
	return rows.filter( ( row, index ) => rows.findIndex( ( other ) => other.wp === row.wp && other.php === row.php ) === index );
}

const configFile = path.join( root, '.wp-plugin-tools.json' );
let config;
if ( fs.existsSync( configFile ) ) {
	config = readJson( configFile );
} else {
	config = detectConfig();
	write( '.wp-plugin-tools.json', JSON.stringify( config, null, '\t' ) + '\n', 'detected; please review' );
}

function repoFromGit() {
	try {
		const url = execSync( 'git remote get-url origin', { cwd: root, stdio: [ 'ignore', 'pipe', 'ignore' ] } ).toString().trim();
		const match = url.match( /github\.com[:/](.+?)(?:\.git)?$/ );
		return match ? match[ 1 ] : null;
	} catch {
		return null;
	}
}

const repo = config.repo || repoFromGit() || `OWNER/${ config.slug }`;
const minPhp = String( config.requires?.php || '7.4' );
const [ phpMajor, phpMinor = '0' ] = minPhp.split( '.' );
const vars = {
	slug: config.slug,
	name: config.name || config.slug,
	mainFile: config.mainFile,
	textDomain: config.textDomain || config.slug,
	minWp: String( config.requires?.wp || '5.9' ),
	minPhp,
	// PHPStan supports 7.1 and newer.
	phpstanMinPhp: String( Math.max( 70100, Number( phpMajor ) * 10000 + Number( phpMinor ) * 100 ) ),
	repo,
	owner: repo.split( '/' )[ 0 ],
	contact: config.contactUrl ? `the [contact form](${ config.contactUrl })` : `[GitHub](https://github.com/${ repo })`,
};
const fill = ( content ) => content.replace( /\{\{(\w+)\}\}/g, ( match, key ) => ( key in vars ? vars[ key ] : match ) );

function listFiles( dir, base = dir ) {
	return fs.readdirSync( dir, { withFileTypes: true } ).flatMap( ( entry ) => {
		const full = path.join( dir, entry.name );
		return entry.isDirectory() ? listFiles( full, base ) : [ path.relative( base, full ) ];
	} );
}

// 2. Managed files: always replaced.
for ( const file of listFiles( path.join( toolsDir, 'templates/managed' ) ) ) {
	write( file, fill( fs.readFileSync( path.join( toolsDir, 'templates/managed', file ), 'utf8' ) ), 'managed' );
}

// 3. Seed files: only where the plugin doesn't have its own.
const alternatives = {
	'.phpcs.xml.dist': [ '.phpcs.xml', 'phpcs.xml', 'phpcs.xml.dist' ],
	'phpstan.neon.dist': [ 'phpstan.neon' ],
	'.phpstan/bootstrap.php': [ 'phpstan.neon' ],
	'phpunit.xml.dist': [ 'phpunit.xml' ],
	'.stylelintrc.json': [ '.stylelintrc', '.stylelintrc.js', 'stylelint.config.js', 'stylelint.config.mjs' ],
};
const hasPhpunit = exists( 'phpunit.xml.dist' ) || exists( 'phpunit.xml' );
for ( const file of listFiles( path.join( toolsDir, 'templates/seed' ) ) ) {
	const taken = exists( file ) || ( alternatives[ file ] || [] ).some( exists );
	// Starter tests only for plugins without a PHPUnit setup.
	const testFile = file.startsWith( 'tests/' ) && hasPhpunit;
	if ( taken || testFile ) {
		changes.kept.push( file );
		continue;
	}
	write( file, fill( fs.readFileSync( path.join( toolsDir, 'templates/seed', file ), 'utf8' ) ), 'seed' );
}

// 4. package.json and composer.json: tool dependencies and scripts.
const scripts = JSON.parse( fill( fs.readFileSync( path.join( toolsDir, 'templates/scripts.json' ), 'utf8' ) ) );
const toolsPackage = readJson( path.join( toolsDir, 'package.json' ) );
const toolsComposer = readJson( path.join( toolsDir, 'composer.json' ) );
const mainHeader = fs.readFileSync( path.join( root, config.mainFile ), 'utf8' );

const pkg = exists( 'package.json' ) ? readJson( path.join( root, 'package.json' ) ) : {};
pkg.name ??= config.slug;
pkg.version ??= header( mainHeader, 'Version' ) || '1.0.0';
pkg.private ??= true;
pkg.engines = { ...pkg.engines, ...toolsPackage.engines };
pkg.scripts = { ...pkg.scripts, ...scripts.npm };
pkg.devDependencies = { ...pkg.devDependencies, ...toolsPackage.devDependencies };
// gulp and its plugins are replaced by build.mjs.
for ( const dep of Object.keys( pkg.devDependencies ) ) {
	if ( dep === 'gulp' || dep.startsWith( 'gulp-' ) ) {
		delete pkg.devDependencies[ dep ];
	}
}
write( 'package.json', JSON.stringify( pkg, null, '\t' ) + '\n', 'merged' );

const composer = exists( 'composer.json' ) ? readJson( path.join( root, 'composer.json' ) ) : { name: `${ vars.owner.toLowerCase() }/${ config.slug }`, type: 'wordpress-plugin', license: 'GPL-2.0-or-later' };
composer[ 'require-dev' ] = { ...composer[ 'require-dev' ], ...toolsComposer[ 'require-dev' ] };
composer.config = {
	...composer.config,
	'allow-plugins': { ...composer.config?.[ 'allow-plugins' ], ...toolsComposer.config[ 'allow-plugins' ] },
	platform: { ...composer.config?.platform, ...toolsComposer.config.platform },
};
composer.scripts = { ...composer.scripts, ...scripts.composer };
write( 'composer.json', JSON.stringify( composer, null, '\t' ).replace( /\\\//g, '/' ) + '\n', 'merged' );

// 5. .gitattributes and .gitignore entries.
// Whether git already applies `attribute` to `entry`, e.g. through a broader pattern.
function hasAttribute( entry, attribute ) {
	try {
		const out = execSync( `git check-attr ${ attribute } -- ${ JSON.stringify( entry.replace( /^\//, '' ) ) }`, { cwd: root, stdio: [ 'ignore', 'pipe', 'ignore' ] } ).toString();
		return / set$/.test( out.trim() );
	} catch {
		return false;
	}
}

function ensureLines( file, lines, header, isPresent ) {
	const current = exists( file ) ? fs.readFileSync( path.join( root, file ), 'utf8' ) : '';
	const present = new Set( current.split( '\n' ).map( ( line ) => line.trim().split( /\s+/ )[ 0 ] ) );
	const missing = lines.filter( ( line ) => {
		const entry = line.split( /\s+/ )[ 0 ];
		return ! present.has( entry ) && ! ( isPresent && isPresent( entry ) );
	} );
	if ( missing.length ) {
		const content = ( current && ! current.endsWith( '\n' ) ? current + '\n' : current ) + ( current ? '\n' : '' ) + `# ${ header }\n` + missing.join( '\n' ) + '\n';
		write( file, content, 'entries added' );
	}
}

// Dot files (/.*) cover .github, .wordpress-org, config files and .wp-plugin-tools.json.
ensureLines(
	'.gitattributes',
	[ '/.*', 'build.mjs', 'eslint.config.mjs', 'composer.json', 'composer.lock', 'package.json', 'package-lock.json', 'phpstan.neon.dist', 'phpunit.xml.dist', 'tests', 'README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'ACCESSIBILITY.md', 'assets/css/src', 'assets/js/src' ]
		.map( ( entry ) => `${ entry.padEnd( 20 ) } export-ignore` ),
	'Development files; not part of the plugin zip (wp-plugin-tools).',
	// `/.*` itself can't be checked by path, so check a dot file it covers.
	( entry ) => hasAttribute( '/.*' === entry ? '.wp-plugin-tools.json' : entry, 'export-ignore' )
);
ensureLines( '.gitignore', [ '/node_modules/', '/vendor/' ], 'Dependencies (wp-plugin-tools).' );

// 6. Files the tooling replaces.
const managedWorkflows = fs.readdirSync( path.join( toolsDir, 'templates/managed/.github/workflows' ) );
const otherWorkflows = exists( '.github/workflows' )
	? fs.readdirSync( path.join( root, '.github/workflows' ) )
		.filter( ( file ) => ! managedWorkflows.includes( file ) )
		.map( ( file ) => `.github/workflows/${ file } (not managed; delete if it duplicates CI)` )
	: [];
const obsolete = [ 'gulpfile.js', '.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintignore' ].filter( exists ).concat( otherWorkflows );

// Report.
console.log( `${ dryRun ? 'Dry run for' : 'Synced' } ${ vars.name } (${ root })\n` );
for ( const [ label, list ] of [ [ 'Created', changes.created ], [ 'Updated', changes.updated ] ] ) {
	if ( list.length ) {
		console.log( `${ label }:\n${ list.map( ( file ) => `  ${ file }` ).join( '\n' ) }\n` );
	}
}
if ( changes.kept.length ) {
	console.log( `Kept the plugin's own:\n${ changes.kept.map( ( file ) => `  ${ file }` ).join( '\n' ) }\n` );
}
if ( obsolete.length ) {
	console.log( `Replaced by wp-plugin-tools; review and delete:\n${ obsolete.map( ( file ) => `  ${ file }` ).join( '\n' ) }\n` );
}
console.log( 'Next: npm install && composer update && npm run build, then commit.' );
