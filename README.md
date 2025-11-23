# safe-npm

A security-focused npm installer that protects your projects from newly compromised packages.

## Why does this exist?

Supply chain attacks on npm packages are a growing threat. Attackers sometimes compromise legitimate packages by:
- Stealing maintainer credentials
- Publishing malicious updates to popular packages
- Taking over abandoned packages

These attacks often happen suddenly—a package that was safe yesterday might be compromised today. **safe-npm** protects you by only installing package versions that have been publicly available for a minimum amount of time (90 days by default). This gives the security community time to discover and report malicious releases before they reach your project.

## How it works

When you run `safe-npm install`, it:

1. Reads your dependencies from `package.json` or command-line arguments
2. Queries the npm registry to find all available versions
3. Filters out versions published more recently than your minimum age threshold
4. Selects the newest version that meets both your semver requirements AND age requirements
5. Installs the safe versions using npm

For example, if you specify `react@^18` and a malicious `react@18.5.0` was published yesterday, safe-npm will install the latest version that's at least 90 days old instead.

## Installation

```bash
# Clone and build
git clone <repository-url>
cd safe-npm
npm install
npm run build

# Link the binary globally (optional)
npm link

# Now you can use it anywhere
safe-npm install
```

## Basic usage

### Install dependencies from package.json

```bash
# Use the minimum age of 90 days (default)
safe-npm install

# Or specify your own minimum age
safe-npm install --min-age-days 120
```

### Install specific packages

```bash
# Install packages directly with version constraints
safe-npm install react@^18 lodash@^4.17.0

# These will be filtered to only use versions at least 90 days old
safe-npm install express --min-age-days 60
```

### Dry run to see what would be installed

```bash
# Preview which versions would be installed without actually installing
safe-npm install --dry-run
```

## Configuration options

### `--min-age-days <n>`
**Default:** `90`

The minimum number of days a package version must have been published before it can be installed.

**Example:** `--min-age-days 120` requires packages to be at least 4 months old.

**When to adjust:**
- Increase for maximum security (e.g., 180 days for critical production systems)
- Decrease if you need newer features and accept slightly more risk (e.g., 30 days)

### `--ignore <pkg1,pkg2>`

A comma-separated list of packages that bypass the age requirement. These packages will still respect semver ranges but ignore the minimum age.

**Example:** `--ignore typescript,@types/node`

**When to use:**
- Fast-moving packages you trust (like TypeScript or build tools)
- Internal packages from your organization
- Packages where you need the latest features urgently

### `--strict`

Exit with an error if ANY dependency cannot be resolved to a version meeting the age requirement.

**Example:** `safe-npm install --strict`

**When to use:**
- CI/CD pipelines where you want builds to fail rather than skip problematic packages
- Production deployments where you need certainty

### `--dev` / `--prod-only`

Control which dependencies from `package.json` are processed.

**Examples:**
- `safe-npm install --dev` - Only install devDependencies
- `safe-npm install --prod-only` - Only install production dependencies

**When to use:**
- Installing development tools with stricter requirements
- Production builds where you want different age policies for dev vs prod dependencies

### `--strategy <direct|overrides>`
**Default:** `direct`

How safe-npm installs the resolved versions:

**`direct`** - Directly installs the resolved versions using `npm install package@version`
- Simple and straightforward
- Good for one-time installs or scripts

**`overrides`** - Writes resolved versions to `package.json` overrides field, then runs `npm install`
- Enforces versions across your entire dependency tree (including transitive dependencies)
- **Note:** This feature is currently disabled as it doesn't work correctly yet

### `--registry <url>`
**Default:** `https://registry.npmjs.org`

Specify an alternate npm registry.

**Example:** `--registry https://registry.company.com`

**When to use:**
- Private npm registries
- Mirrors or caches

### `--dry-run`

Show what would be installed without making any changes.

**Example:** `safe-npm install --dry-run`

**When to use:**
- Testing your configuration
- Understanding what versions are available
- Before making changes to production systems

## Common workflows

### Secure a new project

```bash
# Create a new project
mkdir my-project && cd my-project
npm init -y

# Install dependencies safely
safe-npm install express@^4 lodash

# This creates package-lock.json with versions at least 90 days old
```

### Audit an existing project

```bash
# Check what versions would be installed with age requirements
safe-npm install --dry-run

# If you're happy, install them
safe-npm install
```

### CI/CD integration

```bash
# In your CI pipeline, fail the build if any package can't meet age requirements
safe-npm install --strict --min-age-days 120

# Or allow newer packages for dev dependencies only
safe-npm install --prod-only --strict
```

### Emergency updates

```bash
# Need to urgently update a specific package? Add it to ignore list
safe-npm install --ignore package-with-critical-fix
```

## Testing

The project includes a test suite that you can run:

```bash
npm test
```

For automated testing, you can mock registry responses using fixtures:

```bash
export SAFE_NPM_FIXTURES=/path/to/fixtures.json
safe-npm install
```

The fixtures file should contain JSON that mirrors npm registry responses for each package.

## How this protects you

**Real-world scenario:**

1. A popular package `popular-lib` is maintained by a trusted developer
2. Attacker compromises the maintainer's npm credentials
3. Attacker publishes `popular-lib@5.0.0` with malware
4. Projects using `^5.0.0` would immediately install the malicious version
5. With safe-npm, you'd keep using `4.9.0` (the latest version from 90+ days ago)
6. Security researchers discover the compromise and report it
7. The malicious version is unpublished
8. You never installed the compromised version

## Limitations

- Won't protect against packages that were malicious from the start
- Delays access to legitimate new features and bug fixes
- Requires trust that older versions don't have undiscovered vulnerabilities
- Age-based filtering is a heuristic, not a guarantee

## Philosophy

Security is about trade-offs. safe-npm trades bleeding-edge updates for protection against sudden supply chain compromises. It's one layer in a defense-in-depth strategy that should also include:

- Regular security audits (`npm audit`)
- Dependency review before adding new packages
- Monitoring for security advisories
- Using lock files to ensure reproducible builds
- Running in sandboxed or containerized environments

## Requirements

- Node.js 18 or higher
- npm (for the underlying installation)

## License

ISC
