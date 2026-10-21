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
 */
import { type Provider } from "@earendil-works/pi-ai/models";
import type { Model } from "@earendil-works/pi-ai";
/** The provider id models are registered (and stamped) under. */
export declare const PARETO_PROVIDER_ID = "pareto";
/**
 * Pareto's OpenAI-compatible endpoint. Live-verified 2026-10-18; the
 * operator can override per deployment via the plugin's scoped settings
 * (`baseUrl`) — see {@link resolveParetoBaseUrl}.
 */
export declare const PARETO_BASE_URL = "https://api.paretoinference.com/v1";
/** Ambient fallback when auth.json holds no credential. */
export declare const PARETO_API_KEY_ENV = "PARETO_API_KEY";
/**
 * Structural slice of sigrun's seam host (src/harness/seam-host.ts) a
 * provider plugin may consume. Declared here — structurally, like the
 * bridge's pi-ai re-declarations — because the plugin cannot import
 * sigrun core. The scoped settings store is async-only, which is why the
 * loader awaits factory results (and why this plugin's factory is async).
 */
export interface SigrunPluginHost {
    readonly stores: {
        /** This plugin's own `settings/<slug>.json`; absent file → `{}`. */
        readonly settings: {
            get(): Promise<Record<string, unknown>>;
            set(value: Record<string, unknown>): Promise<void>;
        };
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
    readonly providers: readonly {
        readonly provider: Provider;
        readonly readiness?: () => ProviderReadiness;
    }[];
    readonly health?: () => HealthStatus;
}
/**
 * Resolve the plugin's base URL from its scoped settings: `baseUrl`
 * (string) overrides the {@link PARETO_BASE_URL} constant. Absent → the
 * constant; present-but-not-a-non-empty-string → throw (a malformed
 * override must quarantine loudly, not silently fall back to a possibly
 * wrong constant).
 */
export declare function resolveParetoBaseUrl(settings: Record<string, unknown>): string;
/**
 * Parse an OpenAI-compatible `[OI]` `/models` body into pi-ai chat
 * models. Every entry is stamped `provider: "pareto"` — pi-ai's restore
 * path drops stored models whose `provider` field differs from the
 * registered id, so an unstamped catalog silently vanishes on cold boot.
 * Malformed bodies throw (a refresh failure retains the previous
 * catalog; garbage must never publish). Extra entry fields (the live
 * endpoint also serves `owned_by` and a `pricing` object) are ignored.
 */
export declare function parseParetoCatalog(body: unknown, baseUrl: string): Model<"openai-completions">[];
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
export declare function createParetoPlugin(baseUrl?: string): ParetoPlugin;
/**
 * The sigrun extension-package factory (provider-only contributor).
 * Arity 1 declares the host-taking signature — sigrun's loader passes the
 * seam host only to factories that declare one (`factory.length > 0`) —
 * and the factory is ASYNC because the scoped settings store is
 * async-only; sigrun's loader awaits factory results.
 */
export default function sigrunPareto(host: SigrunPluginHost): Promise<ProviderPluginResult>;
