// AI module: handles all AI provider interactions with secure key storage
// Refactored to use ThreadWeaver's LLMProvider interface

import { MESSAGE_TYPE } from '../../shared/messages';
import type { Profile } from '../../shared/types';
import { getLocal, setLocal, removeLocal, getSync, setSync } from '../../shared/storage';
import {
  createProvider,
  type ProviderId,
} from '../../shared/ai/providers';
import { ProviderError } from '../../shared/ai/provider-types';
import { resolveTaskModel, type AiConfig, DEFAULT_CONFIG, type TaskId } from '../../shared/ai/tasks';
import { buildPrompt } from '../../shared/ai/prompts';
import { sanitizeProfile, truncateJobDescription } from '../../shared/ai/redact';
import { buildCacheKey, getCache, setCache, buildProfileFingerprint } from '../../shared/ai/cache';

interface AiKeys {
  openai?: string;
  anthropic?: string;
  openrouter?: string;
  custom?: string;
}

type ErrorCode = 'NO_KEY' | 'AUTH' | 'QUOTA' | 'RATE_LIMIT' | 'MODEL_NOT_FOUND' | 'TIMEOUT' | 'NETWORK' | 'BAD_RESPONSE';

interface ErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
}

interface SuccessResponse {
  success: true;
  [key: string]: unknown;
}

type ApiResponse = ErrorResponse | SuccessResponse;

// In-flight request tracking
const inFlightRequests = new Map<string, Promise<ApiResponse>>();
const abortControllers = new Map<string, AbortController>();

export class AiModule {
  processMessage(
    message: { type: string; value?: unknown },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ): boolean {
    switch (message.type) {
      case MESSAGE_TYPE.AI_GET_SETTINGS:
        return this._handleGetSettings(sendResponse);

      case MESSAGE_TYPE.AI_SET_SETTINGS:
        return this._handleSetSettings(message.value, sendResponse);

      case MESSAGE_TYPE.AI_CLEAR_KEYS:
        return this._handleClearKeys(message.value, sendResponse);

      case MESSAGE_TYPE.AI_TEST_CONNECTION:
        return this._handleTestConnection(message.value, sendResponse);

      case MESSAGE_TYPE.AI_LIST_MODELS:
        return this._handleListModels(message.value, sendResponse);

      case MESSAGE_TYPE.AI_CHAT:
        return this._handleChat(message.value, sendResponse);

      case MESSAGE_TYPE.AI_CANCEL:
        return this._handleCancel(message.value, sendResponse);

      default:
        return false;
    }
  }

  private _handleGetSettings(sendResponse: (response?: unknown) => void): boolean {
    (async () => {
      const [config, keys] = await Promise.all([
        getSync<AiConfig>({ aiConfig: DEFAULT_CONFIG }),
        getLocal<AiKeys>({ aiKeys: {} }),
      ]);

      const hasKeys = {
        openai: !!keys.aiKeys?.openai,
        anthropic: !!keys.aiKeys?.anthropic,
        openrouter: !!keys.aiKeys?.openrouter,
        custom: !!keys.aiKeys?.custom,
      };

      sendResponse({
        success: true,
        config: config.aiConfig || DEFAULT_CONFIG,
        hasKeys,
      });
    })();

    return true;
  }

  private _handleSetSettings(value: unknown, sendResponse: (response?: unknown) => void): boolean {
    (async () => {
      const payload = value as { config?: Partial<AiConfig>; keys?: Partial<AiKeys> };

      if (payload.config) {
        await setSync({ aiConfig: { ...DEFAULT_CONFIG, ...payload.config } });
      }

      if (payload.keys) {
        const current = await getLocal<AiKeys>({ aiKeys: {} });
        await setLocal({ aiKeys: { ...current.aiKeys, ...payload.keys } });
      }

      sendResponse({ success: true });
    })();

    return true;
  }

  private async _getCustomBaseUrl(): Promise<string> {
    const configResult = await getSync<AiConfig>({ aiConfig: DEFAULT_CONFIG });
    const config = configResult.aiConfig || DEFAULT_CONFIG;
    return config.providers.custom.baseUrl;
  }

  private _handleClearKeys(value: unknown, sendResponse: (response?: unknown) => void): boolean {
    (async () => {
      const payload = value as { provider?: ProviderId };

      if (payload.provider) {
        const current = await getLocal<AiKeys>({ aiKeys: {} });
        const updated = { ...current.aiKeys };
        delete updated[payload.provider];
        await setLocal({ aiKeys: updated });
      } else {
        await removeLocal('aiKeys');
      }

      sendResponse({ success: true });
    })();

    return true;
  }

  private _handleTestConnection(value: unknown, sendResponse: (response?: unknown) => void): boolean {
    (async () => {
      const payload = value as { provider: ProviderId };
      const keys = await getLocal<AiKeys>({ aiKeys: {} });
      const key = keys.aiKeys?.[payload.provider];
      const customBaseUrl = await this._getCustomBaseUrl();

      try {
        const provider = createProvider(payload.provider, key, customBaseUrl);
        const models = await provider.listModels();
        const testModel = models[0] || provider.defaultModel;

        const startTime = Date.now();
        await provider.generate(
          [{ role: 'user', content: 'Hello' }],
          { model: testModel, maxTokens: 10, temperature: 0.7 },
        );
        const latencyMs = Date.now() - startTime;

        sendResponse({
          success: true,
          model: testModel,
          latencyMs,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const code = err instanceof ProviderError ? 'AUTH' : 'NETWORK';
        sendResponse({
          success: false,
          error: message,
          code,
        });
      }
    })();

    return true;
  }

  private _handleListModels(value: unknown, sendResponse: (response?: unknown) => void): boolean {
    (async () => {
      const payload = value as { provider: ProviderId };
      const keys = await getLocal<AiKeys>({ aiKeys: {} });
      const key = keys.aiKeys?.[payload.provider];
      const customBaseUrl = await this._getCustomBaseUrl();

      try {
        const provider = createProvider(payload.provider, key, customBaseUrl);
        const models = await provider.listModels();
        sendResponse({ success: true, models });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendResponse({ success: false, error: message, code: 'NETWORK' });
      }
    })();

    return true;
  }

  private _handleChat(value: unknown, sendResponse: (response?: unknown) => void): boolean {
    (async () => {
      const payload = value as {
        task: TaskId;
        profile: Profile;
        job: { title: string; company: string; description: string };
        extra?: { question?: string; maxLength?: number };
        requestId: string;
        bypassCache?: boolean;
      };

      const configResult = await getSync<AiConfig>({ aiConfig: DEFAULT_CONFIG });
      const config = configResult.aiConfig || DEFAULT_CONFIG;
      const keys = await getLocal<AiKeys>({ aiKeys: {} });

      const { provider, model } = resolveTaskModel(payload.task, config);
      const key = keys.aiKeys?.[provider];

      // Build cache key
      const sanitizedProfile = sanitizeProfile(payload.profile);
      const profileFingerprint = await buildProfileFingerprint(sanitizedProfile);
      const extraJson = JSON.stringify(payload.extra || {});
      const cacheKey = await buildCacheKey(payload.task, provider, model, profileFingerprint, extraJson);

      // Check cache
      if (!payload.bypassCache) {
        const cached = await getCache(cacheKey);
        if (cached) {
          sendResponse({
            success: true,
            text: cached.text,
            usage: cached.usage,
            provider,
            model,
            cached: true,
          });
          return;
        }
      }

      // Dedupe in-flight requests
      const existingRequest = inFlightRequests.get(cacheKey);
      if (existingRequest) {
        const result = await existingRequest;
        sendResponse(result);
        return;
      }

      // Build prompt
      const truncatedDescription = truncateJobDescription(payload.job.description);
      const messages = buildPrompt(payload.task, sanitizedProfile, { ...payload.job, description: truncatedDescription }, payload.extra);

      // Execute request
      const controller = new AbortController();
      abortControllers.set(payload.requestId, controller);

      const requestPromise = (async () => {
        try {
          const llmProvider = createProvider(provider, key, config.providers.custom.baseUrl);
          const result = await llmProvider.generate(messages, {
            model,
            maxTokens: config.maxTokens,
            temperature: config.temperature,
            abortSignal: controller.signal,
          });

          // Cache successful response
          await setCache(cacheKey, {
            text: result.text,
            timestamp: Date.now(),
            usage: result.usage,
          });

          return {
            success: true,
            text: result.text,
            usage: result.usage,
            provider,
            model,
            cached: false,
          } as ApiResponse;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const code = err instanceof ProviderError ? 'AUTH' : 'NETWORK';
          return {
            success: false,
            error: message,
            code,
          } as ApiResponse;
        }
      })();

      inFlightRequests.set(cacheKey, requestPromise);

      try {
        const result = await requestPromise;
        sendResponse(result);
      } finally {
        inFlightRequests.delete(cacheKey);
        abortControllers.delete(payload.requestId);
      }
    })();

    return true;
  }

  private _handleCancel(value: unknown, sendResponse: (response?: unknown) => void): boolean {
    const payload = value as { requestId?: string };
    if (payload?.requestId) {
      abortControllers.get(payload.requestId)?.abort();
      abortControllers.delete(payload.requestId);
    }
    sendResponse({ success: true });
    return true;
  }
}
