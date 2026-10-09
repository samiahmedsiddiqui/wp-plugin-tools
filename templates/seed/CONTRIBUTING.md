# Contributing to {{name}}

Thanks for helping improve {{name}}!

* **Bugs and feature requests:** open an [issue](https://github.com/{{repo}}/issues/new/choose). For questions and help, use the [support forum](https://wordpress.org/support/plugin/{{slug}}/).
* **Security issues:** don't open an issue; see [SECURITY.md](SECURITY.md).
* **Pull requests:** keep them focused on one change, and include a test when fixing a bug.

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development

You need Node.js 20.19 or later, Composer, and Docker (for the tests).

```bash
npm install
composer install
```

| Command | What it does |
| --- | --- |
| `npm run build` | Minifies the CSS and JS sources. Commit the result; CI checks it's up to date. |
| `npm run lint` | Runs Stylelint and ESLint. |
| `composer lint` | Runs PHP_CodeSniffer with the WordPress Coding Standards and PHP compatibility checks. |
| `composer analyse` | Runs PHPStan. |
| `npm run env:start` | Starts WordPress in Docker with [`@wordpress/env`](https://www.npmjs.com/package/@wordpress/env). |
| `npm run test:php` | Runs the PHPUnit integration tests in that environment. |
| `npm run env:stop` | Stops the environment. |

Every pull request runs these checks, plus [Plugin Check](https://github.com/WordPress/plugin-check), and gets a comment with a link to try the change in [WordPress Playground](https://playground.wordpress.net/).

The tooling is shared across plugins through [wp-plugin-tools](https://github.com/samiahmedsiddiqui/wp-plugin-tools).
