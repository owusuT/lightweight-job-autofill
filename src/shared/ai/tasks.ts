// Task model resolution

import type { ProviderId } from './providers';
import { providers } from './providers';

export type TaskId = 'cover_letter' | 'answers' | 'tailor' | 'form_question';

export interface TaskModelConfig {
  provider: ProviderId;
  model: string;
}

export type TaskModelSetting = TaskModelConfig | 'inherit';

export interface AiConfig {
  activeProvider: ProviderId;
  providers: {
    openai: { model: string };
    anthropic: { model: string };
    openrouter: { model: string };
    custom: { baseUrl: string; model: string };
  };
  taskModels: Partial<Record<TaskId, TaskModelSetting>>;
  maxTokens: number;
  temperature: number;
}

export const DEFAULT_CONFIG: AiConfig = {
  activeProvider: 'openai',
  providers: {
    openai: { model: providers.openai.defaultModel },
    anthropic: { model: providers.anthropic.defaultModel },
    openrouter: { model: providers.openrouter.defaultModel },
    custom: { baseUrl: 'http://192.168.0.102:11434', model: providers.custom.defaultModel },
  },
  taskModels: {},
  maxTokens: 800,
  temperature: 0.4,
};

export function resolveTaskModel(task: TaskId, config: AiConfig): { provider: ProviderId; model: string } {
  const taskSetting = config.taskModels[task];

  if (taskSetting && taskSetting !== 'inherit') {
    return { provider: taskSetting.provider, model: taskSetting.model };
  }

  // Inherit from active provider
  const providerConfig = config.providers[config.activeProvider];
  return { provider: config.activeProvider, model: providerConfig.model };
}
