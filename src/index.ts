/**
 * @sigrun/provider-pareto — a sigrun provider plugin (provider plugins Task 9):
 * [Pareto](https://paretoinference.com) paygo (OpenAI-compatible
 * inference) as one dynamic provider.
 *
 * Structurally identical to sigrun-ollama (the Task 7 reference plugin):
 * the default export is the sigrun extension-package factory returning a
 * PROVIDER-ONLY contributor — `{ name, providers, health }` with no
 * `extension` field — consumed structurally by sigrun's loader. The
 * deltas from the reference are the provider id, the base URL, the
 * ambient env key, and ONE addition: the base URL is
 * deployment-configurable through the plugin's scoped settings
 * (`baseUrl` in `settings/provider-pareto.json`, constant fallback),
 * because Pareto's documented endpoint is a deployment-specific value.
 * Credentials resolve through sigrun's auth.json bridge (the stored
 * credential arrives as `credential` on the auth resolver, ambient env
 * as `ctx.env`) with `PARETO_API_KEY` as the fallback; the plugin never
 * reads auth.json or `process.env` itself.
 *
 * Runtime imports from pi-ai are deliberate (`createProvider` + the
 * OpenAI-completions api); the package still declares pi-ai/pi-durable as
 * devDependencies only, because sigrun (the host) ships them and
 * `syncPackages` installs with `--omit=dev` — the provider-plugins spec's
 * dependency posture.
 *
 * Settings are declared as JSON Schema (`src/settings-schema.ts`) and read
 * through the declared handle, so core owns the settings page's form, the
 * defaults and the malformed-value repair for the one key this plugin has
 * (`baseUrl`). The declared name and the package name are the same string,
 * so the loader's provisional slug equals the final slug (`provider-pareto`)
 * and a factory-time read through the handle resolves the file the settings
 * page writes. It reads once, because the URL is baked into every model the
 * provider publishes (`restart`).
 */

import { createProvider, type Provider } from "@earendil-works/pi-ai/models";
import type { Model } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type {
	DeclaredSettings,
	SettingsDeclaration,
} from "@sigrun/sigrun/extension";
import {
	PARETO_BASE_URL,
	PARETO_SETTINGS_SCHEMA,
	type ParetoProviderSettings,
} from "./settings-schema.js";

/** The provider id models are registered (and stamped) under. */
export const PARETO_PROVIDER_ID = "pareto";
/** Ambient fallback when auth.json holds no credential. */
export const PARETO_API_KEY_ENV = "PARETO_API_KEY";

// The endpoint constant lives beside the schema that declares its override
// (it is what an unset or repaired `baseUrl` falls back to); re-exported so
// consumers keep one import site.
export { PARETO_BASE_URL, PARETO_SETTINGS_SCHEMA } from "./settings-schema.js";
export type { ParetoProviderSettings } from "./settings-schema.js";

/**
 * Structural slice of sigrun's seam host (src/harness/seam-host.ts) a
 * provider plugin may consume: the declared-settings handle (settings
 * rework), whose `get()` returns this plugin's own
 * `settings/<slug>.json` with defaults applied and malformed values
 * repaired. Declared here — structurally, like the bridge's pi-ai
 * re-declarations — because the plugin cannot import sigrun core; the two
 * FUNCTION SHAPES it references are the host's own published declaration
 * types (`@sigrun/sigrun/extension` is type-only, so nothing of core is
 * bundled or loaded at runtime). The read is async-only, which is why the
 * loader awaits factory results.
 */
export interface SigrunPluginHost {
	readonly settings: {
		declare<S = Record<string, unknown>, U = Record<string, unknown>>(
			declaration: SettingsDeclaration,
		): DeclaredSettings<S, U>;
	};
}

/** Sigrun's three-state per-provider readiness vocabulary (Task 6). */
export type ProviderReadinessStatus = "not_configured" | "degraded" | "ready";

/** One tracker report: the status plus optional operator-facing detail. */
export interface ProviderReadiness {
	readonly status: ProviderReadinessStatus;
	readonly detail?: string;
}

/** Sigrun's §3 health vocabulary. */
export type HealthStatus = "ok" | "degraded";

/**
 * The provider-plugin factory result (the loader's Task 1 contract):
 * a provider-only contributor — `{ name, providers, health? }`, no
 * `extension`. Structural, like the host slice above.
 */
export interface ProviderPluginResult {
	readonly name: string;
	/** Display title (core 0.15.0's `SigrunExtensionResult.title`): trimmed
	 * to 1..60 characters by the loader; never changes the slug. */
	readonly title: "Pareto";
	readonly providers: readonly {
		readonly provider: Provider;
		readonly readiness?: () => ProviderReadiness;
	}[];
	readonly health?: () => HealthStatus;
}

/**
 * Conservative placeholders for catalog entries Pareto's `/models` shape
 * gives no usable metadata for (entries carry a per-token `pricing`
 * object in dollar STRINGS, which this plugin does not map — cost stays
 * zeroed and structural until sigrun defines a rate source of truth).
 * Same values as the reference plugin and sigrun's degenerate env
 * provider, keeping context management deterministic against unknown
 * windows.
 */
const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 16_384;

/**
 * Parse an OpenAI-compatible `[OI]` `/models` body into pi-ai chat
 * models. Every entry is stamped `provider: "pareto"` — pi-ai's restore
 * path drops stored models whose `provider` field differs from the
 * registered id, so an unstamped catalog silently vanishes on cold boot.
 * Malformed bodies throw (a refresh failure retains the previous
 * catalog; garbage must never publish). Extra entry fields (the live
 * endpoint also serves `owned_by` and a `pricing` object) are ignored.
 */
export function parseParetoCatalog(
	body: unknown,
	baseUrl: string,
): Model<"openai-completions">[] {
	if (typeof body !== "object" || body === null) {
		throw new Error("pareto /models body is not a JSON object");
	}
	const data = (body as { data?: unknown }).data;
	if (!Array.isArray(data)) {
		throw new Error("pareto /models body has no data array");
	}
	return data.map((entry) => {
		const id = (entry as { id?: unknown } | null)?.id;
		if (typeof id !== "string" || id.length === 0) {
			throw new Error("pareto /models entry without a string id");
		}
		const model: Model<"openai-completions"> = {
			id,
			name: id,
			api: "openai-completions",
			// THE stamp — see the doc comment above.
			provider: PARETO_PROVIDER_ID,
			baseUrl,
			// Pareto's /models carries no modality metadata; text is the
			// safe floor (claiming image without evidence would ship image
			// parts to models that cannot read them).
			input: ["text"],
			// Rates exist on the wire but are not mapped (see the
			// placeholders comment); zeroed, usage tracking stays
			// structural.
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			reasoning: false,
			contextWindow: DEFAULT_CONTEXT_WINDOW,
			maxTokens: DEFAULT_MAX_TOKENS,
		};
		return model;
	});
}

/** One built plugin: the contribution's parts, sharing the tracker closure. */
export interface ParetoPlugin {
	readonly provider: Provider;
	/** Synchronous read over plugin-owned state (never network/storage). */
	readonly readiness: () => ProviderReadiness;
	readonly health: () => HealthStatus;
}

/**
 * Build the Pareto provider plus its readiness/health trackers.
 * `baseUrl` is overridable (scoped settings in the default factory,
 * fixture server in tests); the default is the live-verified endpoint.
 */
export function createParetoPlugin(
	baseUrl: string = PARETO_BASE_URL,
): ParetoPlugin {
	// Tracker state: seeded from credential resolution (pi-ai never
	// refreshes an unconfigured provider, so refresh outcomes alone cannot
	// express not_configured), updated per refresh outcome. Readiness and
	// health are synchronous derivations over this state.
	let credentialResolved = false;
	let lastRefreshFailed = false;
	let lastRefreshDetail: string | undefined;
	let lastAnnounced: ProviderReadinessStatus | undefined;

	function status(): ProviderReadinessStatus {
		if (!credentialResolved) return "not_configured";
		return lastRefreshFailed ? "degraded" : "ready";
	}

	/** Apply a state change; `console.warn` on transitions only. */
	function announce(): void {
		const next = status();
		if (next === lastAnnounced) return;
		console.warn(
			`provider-pareto: pareto ${lastAnnounced ?? "startup"} → ${next}` +
				(lastRefreshDetail !== undefined && next === "degraded"
					? ` (${lastRefreshDetail})`
					: ""),
		);
		lastAnnounced = next;
	}

	function noteCredential(resolved: boolean): void {
		credentialResolved = resolved;
		announce();
	}

	function noteRefresh(ok: true): void;
	function noteRefresh(ok: false, detail: string): void;
	function noteRefresh(ok: boolean, detail?: string): void {
		lastRefreshFailed = !ok;
		lastRefreshDetail = ok ? undefined : detail;
		announce();
	}

	const provider = createProvider({
		id: PARETO_PROVIDER_ID,
		name: "Pareto",
		baseUrl,
		// REQUIRED baseline: createProvider iterates it (omitting throws
		// "baselineModels is not iterable"); empty = purely dynamic.
		models: [],
		auth: {
			apiKey: {
				name: "Pareto API key (auth.json or PARETO_API_KEY)",
				resolve: async ({ credential, ctx }) => {
					// Bridged auth.json credential (sigrun's bridge: the
					// "default" entry first, then the provider's own) wins;
					// the env var is the ambient fallback.
					const stored = credential?.key?.trim() || undefined;
					if (stored !== undefined) {
						noteCredential(true);
						return { auth: { apiKey: stored }, source: "auth.json" };
					}
					const envKey =
						(await ctx.env(PARETO_API_KEY_ENV))?.trim() || undefined;
					if (envKey !== undefined) {
						noteCredential(true);
						return { auth: { apiKey: envKey }, source: PARETO_API_KEY_ENV };
					}
					// Unconfigured: undefined makes pi-ai skip the refresh
					// phase entirely and requests fail loud.
					noteCredential(false);
					return undefined;
				},
			},
		},
		fetchModels: async (context) => {
			// The context credential is whatever auth resolution produced —
			// for this plugin always the merged api key; narrow rather than
			// trust the union.
			const key =
				context.credential?.type === "api_key"
					? context.credential.key?.trim() || undefined
					: undefined;
			if (key === undefined) {
				noteCredential(false);
				// NEVER return [] — the createProvider wrapper publishes +
				// persists whatever fetchModels returns; an empty array
				// would wipe the catalog.
				throw new Error(
					`provider-pareto: Pareto is not configured ` +
						`(no auth.json credential and no ${PARETO_API_KEY_ENV}); ` +
						"refusing to publish an empty catalog",
				);
			}
			const effectiveBase = context.baseUrl ?? baseUrl;
			// URL-join needs the trailing slash ("models" against a
			// slash-less base would resolve to the host root).
			const root = effectiveBase.endsWith("/") ? effectiveBase : `${effectiveBase}/`;
			try {
				const response = await fetch(new URL("models", root), {
					headers: { Authorization: `Bearer ${key}` },
					signal: context.signal,
				});
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}
				const models = parseParetoCatalog(
					await response.json(),
					effectiveBase,
				);
				noteRefresh(true);
				return models;
			} catch (cause) {
				// An aborted refresh is not a failed one: pi-ai discards
				// the outcome anyway, so the tracker must not move.
				if (context.signal.aborted) throw cause;
				const message = cause instanceof Error ? cause.message : String(cause);
				noteRefresh(false, message);
				throw new Error(
					`provider-pareto: Pareto catalog refresh failed: ${message}`,
				);
			}
		},
		api: openAICompletionsApi(),
	});

	return {
		provider,
		readiness: () => ({
			status: status(),
			...(lastRefreshDetail !== undefined && status() === "degraded"
				? { detail: lastRefreshDetail }
				: {}),
		}),
		// not_configured → ok (an unconfigured optional plugin is not a
		// degraded process); configured-and-failing → degraded; else ok.
		health: () => (status() === "degraded" ? "degraded" : "ok"),
	};
}

/**
 * The sigrun extension-package factory (provider-only contributor).
 * Arity 1 declares the host-taking signature — sigrun's loader passes the
 * seam host only to factories that declare one (`factory.length > 0`) —
 * and the factory is ASYNC because the declared-settings read is
 * async-only; sigrun's loader awaits factory results.
 *
 * Settings are DECLARED first (`src/settings-schema.ts` — core owns the
 * page, the defaults and the malformed-value repair) and read ONCE, then
 * baked into the provider: the base URL is factory-time, so the property is
 * `restart`. An absent `baseUrl` — and one core REPAIRED to the key's
 * default, the posture change from the deleted resolver's throw — reads back
 * as the documented endpoint the schema declares. The declared name and this
 * package's name are the same string (`provider-pareto`), so the loader's
 * provisional slug IS the final slug and the factory-time read resolves
 * `settings/provider-pareto.json`, the file a deployment points at its own
 * endpoint with.
 */
export default async function sigrunPareto(
	host: SigrunPluginHost,
): Promise<ProviderPluginResult> {
	const declared = host.settings.declare<ParetoProviderSettings>({
		schema: PARETO_SETTINGS_SCHEMA,
	});
	const settings = await declared.get();
	// `baseUrl` carries the endpoint as its schema default, so the checked read
	// always hands over a usable URL — absent, unset and repaired values alike.
	const plugin = createParetoPlugin(settings.baseUrl);
	return {
		name: "provider-pareto",
		title: "Pareto",
		providers: [{ provider: plugin.provider, readiness: plugin.readiness }],
		health: plugin.health,
	};
}
