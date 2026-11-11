// AI provider adapters for OpenAI, Anthropic, OpenRouter, and custom OpenAI-compatible
// Refactored to use ThreadWeaver's LLMProvider interface

import type {
  ChatMessage,
  GenerateOptions,
  GenerateResult,
  LLMProvider,
  ProviderId,
} from './provider-types';
import { ProviderError } from './provider-types';

export type { ChatMessage, GenerateOptions, GenerateResult, LLMProvider, ProviderId } from './provider-types';
export { ProviderError } from './provider-types';

export interface ProviderConfig {
  provider: ProviderId;
  model: string;
  customBaseUrl?: string;
}

// OpenAI adapter
export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai' as const;
  readonly label = 'OpenAI';
  readonly defaultModel = 'gpt-4o-mini';
  readonly requiresKey = true;

  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async listModels(): Promise<string[]> {
    return ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];
  }

  async generate(messages: ChatMessage[], opts: GenerateOptions = {}): Promise<GenerateResult> {
    const model = opts.model ?? this.defaultModel;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: opts.maxTokens || 800,
        temperature: opts.temperature ?? 0.4,
      }),
      signal: opts.abortSignal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new ProviderError(
        error.error?.message || `HTTP ${response.status}`,
        this.id,
      );
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    return {
      text: data.choices?.[0]?.message?.content || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
      },
    };
  }

  async countTokens(text: string): Promise<number> {
    return Math.ceil(text.length / 4);
  }
}

// Anthropic adapter
export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic' as const;
  readonly label = 'Anthropic';
  readonly defaultModel = 'claude-3-5-sonnet-20241022';
  readonly requiresKey = true;

  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async listModels(): Promise<string[]> {
    return ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'];
  }

  async generate(messages: ChatMessage[], opts: GenerateOptions = {}): Promise<GenerateResult> {
    const model = opts.model ?? this.defaultModel;
    const systemMessage = messages.find((m) => m.role === 'system');
    const userMessages = messages.filter((m) => m.role !== 'system');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens || 800,
        temperature: opts.temperature ?? 0.4,
        system: systemMessage?.content || '',
        messages: userMessages,
      }),
      signal: opts.abortSignal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new ProviderError(
        error.error?.message || `HTTP ${response.status}`,
        this.id,
      );
    }

    const data = await response.json() as {
      content?: Array<{ text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    return {
      text: data.content?.[0]?.text || '',
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
      },
    };
  }

  async countTokens(text: string): Promise<number> {
    return Math.ceil(text.length / 4);
  }
}

// OpenRouter adapter
export class OpenRouterProvider implements LLMProvider {
  readonly id = 'openrouter' as const;
  readonly label = 'OpenRouter';
  readonly defaultModel = 'openai/gpt-4o-mini';
  readonly requiresKey = true;

  private apiKey: string;
  private modelCache: { models: string[]; timestamp: number } | null = null;
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async listModels(): Promise<string[]> {
    const now = Date.now();
    if (this.modelCache && (now - this.modelCache.timestamp) < this.CACHE_TTL) {
      return this.modelCache.models;
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/models?output_modalities=text', {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        if (this.modelCache) return this.modelCache.models;
        throw new ProviderError(`OpenRouter /models returned ${response.status}`, this.id);
      }

      const data = await response.json() as { data?: Array<{ id: string }> };
      const models = data.data?.map((m) => m.id) || [];

      if (models.length > 0) {
        this.modelCache = { models, timestamp: now };
        return models;
      }

      if (this.modelCache) return this.modelCache.models;
      return ['openai/gpt-4o-mini', 'openai/gpt-4o', 'anthropic/claude-3.5-sonnet'];
    } catch {
      if (this.modelCache) return this.modelCache.models;
      return ['openai/gpt-4o-mini', 'openai/gpt-4o', 'anthropic/claude-3.5-sonnet'];
    }
  }

  async generate(messages: ChatMessage[], opts: GenerateOptions = {}): Promise<GenerateResult> {
    const model = opts.model ?? this.defaultModel;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'chrome-extension://jolly-r-autofill',
        'X-Title': 'jolly R',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: opts.maxTokens || 800,
        temperature: opts.temperature ?? 0.4,
      }),
      signal: opts.abortSignal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new ProviderError(
        error.error?.message || `HTTP ${response.status}`,
        this.id,
      );
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    return {
      text: data.choices?.[0]?.message?.content || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
      },
    };
  }

  async countTokens(text: string): Promise<number> {
    return Math.ceil(text.length / 4);
  }
}

// Custom OpenAI-compatible adapter
export class CustomProvider implements LLMProvider {
  readonly id = 'custom' as const;
  readonly label = 'Ollama (local)';
  readonly defaultModel = 'qwen2.5:7b';
  readonly requiresKey = false;

  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async listModels(): Promise<string[]> {
    try {
      const headers: Record<string, string> = {};
      if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/v1/models`, { headers });
      if (!response.ok) return [];
      const data = await response.json() as { data?: Array<{ id?: string }> };
      return (data.data || [])
        .map((model) => model.id)
        .filter((id): id is string => Boolean(id));
    } catch {
      return [];
    }
  }

  async generate(messages: ChatMessage[], opts: GenerateOptions = {}): Promise<GenerateResult> {
    const model = opts.model ?? this.defaultModel;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        max_tokens: opts.maxTokens || 800,
        temperature: opts.temperature ?? 0.4,
      }),
      signal: opts.abortSignal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new ProviderError(
        error.error?.message || `HTTP ${response.status}`,
        this.id,
      );
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    return {
      text: data.choices?.[0]?.message?.content || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
      },
    };
  }

  async countTokens(text: string): Promise<number> {
    return Math.ceil(text.length / 4);
  }
}

// Provider factory
export function createProvider(id: ProviderId, apiKey?: string, customBaseUrl?: string): LLMProvider {
  switch (id) {
    case 'openai':
      if (!apiKey) throw new ProviderError('OpenAI key required', id);
      return new OpenAIProvider(apiKey);
    case 'anthropic':
      if (!apiKey) throw new ProviderError('Anthropic key required', id);
      return new AnthropicProvider(apiKey);
    case 'openrouter':
      if (!apiKey) throw new ProviderError('OpenRouter key required', id);
      return new OpenRouterProvider(apiKey);
    case 'custom':
      return new CustomProvider(customBaseUrl || 'http://192.168.0.102:11434', apiKey);
    default:
      throw new ProviderError(`Unknown provider: ${id}`, id);
  }
}

export const providers: Record<ProviderId, { label: string; requiresKey: boolean; defaultModel: string }> = {
  openai: { label: 'OpenAI', requiresKey: true, defaultModel: 'gpt-4o-mini' },
  anthropic: { label: 'Anthropic', requiresKey: true, defaultModel: 'claude-3-5-sonnet-20241022' },
  openrouter: { label: 'OpenRouter', requiresKey: true, defaultModel: 'openai/gpt-4o-mini' },
  custom: { label: 'Ollama (local)', requiresKey: false, defaultModel: 'qwen2.5:7b' },
};
