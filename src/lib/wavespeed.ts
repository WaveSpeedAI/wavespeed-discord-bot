// WaveSpeed integration layer.
//
// Generation goes through the official `wavespeed` SDK rather than raw HTTP:
// it already carries the X-Client-* attribution headers, guarantees a
// submission POST is sent at most once (never retried), and normalises the
// platform's terminal statuses into typed exceptions. `runNoThrow` is used
// instead of `run` so a failed prediction still hands back the task id, which
// is what a Discord user needs in order to recover a job.
//
// The catalog (/api/v3/models) and balance (/api/v3/balance) endpoints are
// plain REST reads that the SDK does not wrap, so they are fetched directly —
// with the same attribution headers the SDK sends.

import { Client as WaveSpeedClient, version as sdkVersion } from 'wavespeed';
import type { RunNoThrowResult } from 'wavespeed';
import os from 'node:os';
import { CLIENT_NAME, type BotConfig } from '../config.js';

export type { RunNoThrowResult };

export interface GenerationOutcome {
  /** Prediction / task id. Always present once the platform accepted the job. */
  predictionId: string;
  status: 'completed' | 'failed' | 'processing';
  outputs: string[];
  error?: string;
  model: string;
}

export interface WaveSpeedGateway {
  generate(
    model: string,
    input: Record<string, unknown>,
    options?: { timeoutMs?: number },
  ): Promise<GenerationOutcome>;
  listModels(): Promise<CatalogModel[]>;
  getBalance(): Promise<{ balance: number; currency: string }>;
}

export interface CatalogModel {
  model_id: string;
  name?: string;
  description?: string;
  type?: string;
  base_price?: number;
}

interface Envelope<T> {
  code: number;
  message?: string;
  data: T;
}

const CATALOG_TTL_MS = 60 * 60 * 1000;

function osName(): string {
  const platform = os.platform();
  return platform === 'win32' ? 'windows' : platform;
}

/** Attribution headers matching what the SDK sends on generation calls. */
export function attributionHeaders(): Record<string, string> {
  return {
    'X-Client-Name': process.env.WAVESPEED_CLIENT_NAME || CLIENT_NAME,
    'X-Client-Version': sdkVersion,
    'X-Client-OS': osName(),
  };
}

/** Normalise SDK output entries (strings, or objects with a url) to URLs. */
export function toUrls(outputs: unknown[] | null | undefined): string[] {
  if (!outputs) return [];
  const urls: string[] = [];
  for (const entry of outputs) {
    if (typeof entry === 'string') {
      urls.push(entry);
    } else if (entry && typeof entry === 'object') {
      const candidate = (entry as Record<string, unknown>).url;
      if (typeof candidate === 'string') urls.push(candidate);
    }
  }
  return urls;
}

export function createGateway(config: BotConfig): WaveSpeedGateway {
  const sdk = new WaveSpeedClient(config.wavespeedApiKey, {
    baseUrl: config.wavespeedBaseUrl,
    clientName: CLIENT_NAME,
    // A submit POST is never replayed by the SDK; keep task-level retries off
    // too so one slash command can never bill twice.
    maxRetries: 0,
  });

  let catalog: { fetchedAt: number; models: CatalogModel[] } | undefined;

  async function apiGet<T>(path: string): Promise<T> {
    const res = await fetch(`${config.wavespeedBaseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${config.wavespeedApiKey}`,
        ...attributionHeaders(),
      },
    });
    const body = (await res.json().catch(() => undefined)) as Envelope<T> | undefined;
    if (!res.ok) {
      throw new Error(body?.message || `GET ${path} failed: ${res.status} ${res.statusText}`);
    }
    if (!body || body.code !== 200) {
      throw new Error(body?.message || `GET ${path} returned code ${body?.code}`);
    }
    return body.data;
  }

  return {
    async generate(model, input, options) {
      const result = await sdk.runNoThrow(model, input as Record<string, any>, {
        timeout: (options?.timeoutMs ?? config.jobTimeoutMs) / 1000,
        pollInterval: 1.5,
      });
      return {
        predictionId: result.detail.taskId,
        status: result.detail.status,
        outputs: toUrls(result.outputs),
        error: result.detail.error?.message,
        model: result.detail.model || model,
      };
    },

    async listModels() {
      if (catalog && Date.now() - catalog.fetchedAt < CATALOG_TTL_MS) {
        return catalog.models;
      }
      const models = await apiGet<CatalogModel[]>('/api/v3/models');
      catalog = { fetchedAt: Date.now(), models };
      return models;
    },

    async getBalance() {
      const data = await apiGet<{ balance: number; currency?: string }>('/api/v3/balance');
      return { balance: data.balance, currency: data.currency || 'USD' };
    },
  };
}

/** Rank catalog entries against a free-text query. Exported for tests. */
export function searchModels(models: CatalogModel[], query: string, type?: string): CatalogModel[] {
  const needle = query.trim().toLowerCase();
  const scored: Array<{ model: CatalogModel; score: number }> = [];
  for (const model of models) {
    if (type && model.type !== type) continue;
    const id = model.model_id?.toLowerCase() ?? '';
    const name = model.name?.toLowerCase() ?? '';
    const description = model.description?.toLowerCase() ?? '';
    let score = 0;
    if (!needle) score = 1;
    else if (id === needle) score = 100;
    else if (id.includes(needle)) score = 50;
    else if (name.includes(needle)) score = 25;
    else if (description.includes(needle)) score = 5;
    if (score > 0) scored.push({ model, score });
  }
  scored.sort((a, b) => b.score - a.score || a.model.model_id.localeCompare(b.model.model_id));
  return scored.map((entry) => entry.model);
}
