# wp-plugin-tools

Shared tooling for WordPress plugins: linting, static analysis, integration tests, Plugin Check, WordPress Playground previews, and deploys to WordPress.org, plus the GitHub settings to go with them.

Plugins **call** the workflows here, so CI is updated in one place. Config files the tools also need locally are **synced** into each plugin by a script, which you can run again at any time to pick up updates.

## What a plugin gets

| | What it does |
| --- | --- |
| **CI** (`.github/workflows/ci.yml`) | PHP_CodeSniffer (WordPress Coding Standards + PHP compatibility), PHPStan, ESLint, Stylelint, a check that committed build files are up to date, PHPUnit integration tests on `@wordpress/env` across WordPress and PHP versions, and WordPress.org's Plugin Check on the files that ship. |
| **Playground preview** (`.github/workflows/pr-preview.yml`) | A comment on every pull request with a link that opens WordPress Playground with the pull request's version of the plugin. |
| **Deploy** (`.github/workflows/deploy.yml`) | Publishing a GitHub release checks every version number matches the tag and deploys to WordPress.org (SVN `trunk`, `tags/X.Y.Z`, and `.wordpress-org` banners, icons and screenshots). |
| **Build** (`build.mjs`) | Minifies CSS and JS with esbuild, optionally with the version in the file name. |
| **Dependabot** | Monthly updates for GitHub Actions, npm, and Composer. |
| **Starter files** | phpcs, PHPStan, PHPUnit and wp-env config, a first test, issue forms, a pull request template, and `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `ACCESSIBILITY.md`. |
| **Repository settings** (`bin/setup-repo.sh`) | Squash-only merges, rulesets protecting the default branch and release tags, secret scanning and push protection, private vulnerability reporting, CodeQL, and Dependabot security updates. |

## Requirements

* Node.js 20.19 or later, Composer, and PHP 7.4 or later for the tooling.
* Docker, to run the integration tests locally.
* The [GitHub CLI](https://cli.github.com/) (`gh`), signed in, for `bin/setup-repo.sh`.

## Adding it to a plugin

This works the same for a new or an existing plugin. Existing code, and any config the plugin already has, is kept.

1. Clone this repository next to your plugins, and sync it into a plugin:

   ```bash
   git clone https://github.com/samiahmedsiddiqui/wp-plugin-tools.git
   node wp-plugin-tools/bin/sync.mjs path/to/my-plugin
   ```

   Add `--dry-run` to see what would change without writing anything.

2. Review `.wp-plugin-tools.json`, which the first sync creates from the plugin header (see [Configuration](#configuration)).

3. Install, build, and commit:

   ```bash
   cd path/to/my-plugin
   npm install
   composer update
   npm run build
   ```

   The sync lists files it replaces, like `gulpfile.js` or old workflows; delete the ones you no longer need.

4. Open a pull request. Once its checks pass and it's merged, apply the repository settings:

   ```bash
   wp-plugin-tools/bin/setup-repo.sh OWNER/my-plugin
   ```

   Run it after the first green CI run on the default branch, so the ruleset can require those checks.

5. For deploys, add the `SVN_USERNAME` and `SVN_PASSWORD` repository secrets. `SVN_PASSWORD` is the SVN password from your WordPress.org profile (**Edit Profile → Account & Security**), not your login password.

### Starting a new plugin

Create the plugin's repository with at least its main PHP file (with the `Plugin Name:` header) and `readme.txt`, then follow the same steps. The sync adds a first PHPUnit test, so CI has something to run from the start.

## Updating

Workflows are referenced as `@v1`, so plugins get fixes to the shared workflows automatically. To pick up config, template, or dependency updates, pull this repository and run the sync again; files a plugin has customized are kept.

## Configuration

`.wp-plugin-tools.json` in the plugin's root:

```json
{
	"slug": "my-plugin",
	"name": "My Plugin",
	"mainFile": "my-plugin.php",
	"textDomain": "my-plugin",
	"requires": { "wp": "6.0", "php": "7.4" },
	"build": [
		{ "src": "assets/css/src", "out": "assets/css", "ext": "css", "versioned": true },
		{ "src": "assets/js/src", "out": "assets/js", "ext": "js", "versioned": true }
	],
	"tests": {
		"matrix": [
			{ "wp": "6.0", "php": "7.4" },
			{ "wp": "latest", "php": "8.4" }
		]
	},
	"eslint": { "globals": [ "myPluginSettings" ] },
	"versionFiles": [
		{ "file": "includes/class-my-plugin.php", "pattern": "public \\$version = '([^']+)';" }
	],
	"preview": {
		"landingPage": "/wp-admin/options-general.php?page=my-plugin",
		"setupPhp": "update_option( 'my_plugin_demo', true );",
		"description": "Opens the settings screen with demo data."
	},
	"contactUrl": "https://example.com/contact/"
}
```

| Key | Used for |
| --- | --- |
| `slug`, `name`, `mainFile`, `textDomain` | Filling in templates; the WordPress.org slug for deploys and Plugin Check. |
| `requires` | PHP_CodeSniffer's PHP and WordPress compatibility checks, and PHPStan's PHP versions. |
| `build` | What `npm run build` minifies. `versioned` adds the version from `package.json` to file names and removes older ones. |
| `tests.matrix` | WordPress and PHP versions for PHPUnit. The WordPress test suite needs WordPress 5.9+ and PHP 7.4+. |
| `eslint` | Extra `globals` and `ignores`. |
| `versionFiles` | More places the version must match the release tag; the pattern's first group is the version. |
| `preview` | The Playground preview's landing page, setup PHP for sample content, and description. |
| `contactUrl` | The contact link in the code of conduct and accessibility statement; defaults to the GitHub repository. |

### Managed and seed files

* **Managed** files (`templates/managed`) are replaced on every sync: the workflow callers, `dependabot.yml`, `build.mjs`, and `eslint.config.mjs`. Configure them through `.wp-plugin-tools.json` rather than editing them.
* **Seed** files (`templates/seed`) are created only if the plugin doesn't have one: phpcs, PHPStan, PHPUnit and wp-env config, tests, issue forms, and community docs. Edit them freely.
* `package.json` and `composer.json` are **merged**: tool dependencies, scripts, and settings are added or updated, and everything else is kept. Tool versions come from this repository's `package.json` and `composer.json`.

## Required checks

These are the check names `bin/setup-repo.sh` finds on a plugin's default branch and requires:

* `Coding standards / PHP coding standards`
* `Coding standards / PHP static analysis`
* `Coding standards / JavaScript and CSS coding standards`
* `PHPUnit / WordPress {version} on PHP {version}`, one per `tests.matrix` row
* `Plugin Check / Run Plugin Check`

If you change `tests.matrix`, run `bin/setup-repo.sh` again after CI has run with the new matrix, so the ruleset requires the new check names.

## Releasing wp-plugin-tools

Plugins use `@v1`. After merging changes here, tag the release and move `v1` to it:

```bash
git tag v1.1.0 && git tag -f v1 && git push origin v1.1.0 && git push -f origin v1
```

Breaking changes (for example renamed inputs or check names) go in a new major version, `v2`.

## License

GPL-3.0-or-later.
