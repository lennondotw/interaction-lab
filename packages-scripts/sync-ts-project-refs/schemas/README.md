# stspr Configuration Schemas

JSON Schema definitions for stspr configuration files, providing IDE autocomplete and validation support.

## Schema URLs

Use these URLs in your YAML configuration files for IDE support:

### Package-level Configuration

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/lennondotw/interaction-lab/main/packages-scripts/sync-ts-project-refs/schemas/stspr.package.schema.json

exclude: false
canonicalTsconfig:
  # Defaults to ./tsconfig.json
  path: ./tsconfig.json
  includeSiblings: true
  includeWorkspaceDeps: true
references:
  add: []
  skip: []
```

**File**: `stspr.package.yaml` (place in package root)

### TypeScript Config-level Configuration

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/lennondotw/interaction-lab/main/packages-scripts/sync-ts-project-refs/schemas/tsconfig.stspr.schema.json

exclude: false
includeWorkspaceDeps: false
references:
  add:
    - { path: '../../test-utils/tsconfig.json' }
  skip: []
```

**Files**: `tsconfig.stspr.yaml`, `tsconfig.{name}.stspr.yaml` (e.g. `tsconfig.custom.stspr.yaml`)

### Root-level Configuration

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/lennondotw/interaction-lab/main/packages-scripts/sync-ts-project-refs/schemas/stspr.root.schema.json

graph:
  includeIndirectDeps: false
filters:
  excludePackages: []
  excludeTsconfigs: []
rootSolution:
  tsconfigPath: ./tsconfig.json
  includeSiblings: true
  references:
    add: []
    skip: []
```

**File**: `stspr.root.yaml` (place alongside `pnpm-workspace.yaml`)

## Editor Setup

Install the [YAML extension](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml) in VS Code/Cursor for:

- ✅ Autocomplete for configuration keys
- ✅ Real-time validation
- ✅ Hover documentation
- ✅ Type checking

## Schema Files

- `stspr.package.schema.json` - Package-level configuration schema
- `tsconfig.stspr.schema.json` - TypeScript config-level configuration schema
- `stspr.root.schema.json` - Root-level configuration schema

Both schemas follow [JSON Schema Draft 07](https://json-schema.org/specification-links.html#draft-7) specification.
