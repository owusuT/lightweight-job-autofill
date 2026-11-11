import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomProvider } from './providers';

describe('CustomProvider.listModels', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads Ollama model ids from the OpenAI-compatible endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'qwen2.5:7b' }, { id: 'qwen3.5:latest' }, {}] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const models = await new CustomProvider('http://192.168.0.102:11434').listModels();

    expect(fetchMock).toHaveBeenCalledWith('http://192.168.0.102:11434/v1/models', { headers: {} });
    expect(models).toEqual(['qwen2.5:7b', 'qwen3.5:latest']);
  });

  it('returns an empty list when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(new CustomProvider('http://192.168.0.102:11434').listModels()).resolves.toEqual([]);
  });
});
