# safe-npm

`safe-npm` installs npm dependencies that are at least a minimum age (90 days by default) to reduce the risk of suddenly malicious releases. It can resolve dependencies directly from CLI arguments or from the `package.json` in the current working directory.

## Usage

```bash
# Build the CLI (requires Node.js 18+)
npm install
npm run build

# Run against package.json in the current directory
node dist/cli.js install

# Or use the published binary once linked
safe-npm install react@^18 lodash --min-age-days 120
```

### Command options

- `--min-age-days <n>`: minimum number of days since a version was published (default 90)
- `--registry <url>`: alternate npm registry base URL
- `--dev`: only resolve `devDependencies` from `package.json`
- `--prod-only`: only resolve production `dependencies`
- `--ignore <pkg1,pkg2>`: list of packages that should bypass the age rule
- `--dry-run`: show planned installs without running npm
- `--strict`: exit with an error if any dependency cannot be resolved to an acceptable version
- `--strategy <direct|overrides>`: directly install resolved versions or write them to `package.json` overrides and run `npm install`

### Notes

- Ignored packages still resolve to the newest version that matches their semver range.
- When run without package arguments, `safe-npm` reads dependencies from `package.json` in the current working directory.
- The overrides strategy updates `package.json` to enforce the resolved versions across the dependency graph.
- For automated testing you can set the `SAFE_NPM_FIXTURES` environment variable to a JSON file that mirrors npm registry responses; the CLI will use those fixtures instead of hitting the network.
