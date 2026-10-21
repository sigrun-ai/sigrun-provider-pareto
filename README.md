# @sigrun/provider-pareto

A [sigrun](https://github.com/sigrun-ai) provider plugin:
[Pareto](https://paretoinference.com) paygo (OpenAI-compatible
inference) as one dynamic chat provider.

## What it contributes

A **provider-only contributor** — the default export is a factory
returning `{ name: "provider-pareto", providers: [{ provider, readiness }],
health }` with no pi-durable extension surface. Sigrun's loader merges
the provider into its `Models` store at boot.

- **Provider** `pareto` — dynamic catalog fetched from `<base>/models`
  (OpenAI `[OI]` list shape; entries also carry a per-token dollar-string
  `pricing` object this plugin does not map — cost stays zeroed and
  structural) over `openai-completions`; boots with an empty baseline
  and publishes the fetched catalog.
- **Readiness** (`not_configured` / `degraded` / `ready`, surfaced on
  sigrun's `/v1/auth/check`) — seeded from credential resolution and
  updated per refresh outcome; state transitions log via `console.warn`
  (transitions only, never per failure). On the first configured boot
  the provider announces `startup → ready` at credential *resolution* —
  before any refresh has run (`ready` there means "credential resolved,
  refresh not yet attempted", not "catalog verified").
- **Health** — `degraded` only when the provider is configured and its
  last refresh failed; an unconfigured optional plugin reports `ok`.

## Base URL

The default endpoint constant is `https://api.paretoinference.com/v1`
(live-verified 2026-10-18). Pareto's documented base URL is a
deployment-specific value, so the factory reads the plugin's scoped
settings first — `baseUrl` (string) in `settings/provider-pareto.json`
overrides the constant:

```jsonc
// settings/provider-pareto.json (in the sigrun config dir)
{ "baseUrl": "https://your-pareto-endpoint.example/v1" }
```

An absent `baseUrl` uses the constant; a present-but-malformed one
(empty or not a string) fails the factory loudly (the extension
quarantines with the reason) rather than silently falling back.

## Credentials

Resolved per request through sigrun's auth.json bridge, falling back to
the ambient environment:

1. the bridged auth.json credential (`"default"` entry, then the
   `"pareto"` entry), then
2. `PARETO_API_KEY`.

The plugin never reads auth.json or `process.env` itself. Rotating the
key applies on the next resolution — no restart needed.

## Failure semantics

`fetchModels` **throws** when unconfigured or when the catalog fetch
fails — it never returns an empty array, which pi-ai would publish and
persist, wiping the catalog. A failed refresh retains the previous
catalog and records a per-provider error.

## Install

```jsonc
// settings.json (sigrun config dir) — the UNIFIED extensions list:
// install + load in one place; npm and git specifiers are the same list
// npm ("@sigrun/provider-pareto@^0.1.0"), git
// ("git:github.com/sigrun-ai/sigrun-provider-pareto", or any
// https git URL with an optional @ref), or the file: form below.
{
	"extensions": ["file:/path/to/sigrun-pareto"]
}
```

The committed `dist/` is the load target for git installs; pi-ai and
pi-durable are peerDependencies (sigrun supplies them at runtime);
they are mirrored in devDependencies for this repo's own build and tests.

## Development

```sh
npm install        # also builds dist/ via prepare
npm test           # vitest — hermetic fixture HTTP server, no network
npm run typecheck
npm run build
```

## License

MIT
