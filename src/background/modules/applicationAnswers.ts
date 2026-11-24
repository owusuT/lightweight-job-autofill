import type { ApplicationAnswerChoice, SavedApplicationAnswer } from '../../shared/applicationAnswers';
import { APPLICATION_ANSWERS_KEY, normalizeApplicationQuestion } from '../../shared/applicationAnswers';
import { AllFramesModule } from './allFrames';

function validChoice(value: unknown): value is ApplicationAnswerChoice {
  if (!value || typeof value !== 'object') return false;
  return 'question' in value && typeof value.question === 'string' && value.question.trim().length > 0 && value.question.length <= 15000
    && 'answer' in value && typeof value.answer === 'string' && value.answer.length <= 4000
    && 'origin' in value && typeof value.origin === 'string' && /^https?:\/\/[^/]+$/.test(value.origin)
    && 'remember' in value && typeof value.remember === 'boolean';
}

export class ApplicationAnswersModule {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private frames: AllFramesModule) {}

  private async apply(choices: ApplicationAnswerChoice[], tabId: number) {
    const stored = await chrome.storage.local.get(APPLICATION_ANSWERS_KEY);
    const existing: SavedApplicationAnswer[] = Array.isArray(stored[APPLICATION_ANSWERS_KEY]) ? stored[APPLICATION_ANSWERS_KEY] : [];
    const matches = (a: SavedApplicationAnswer, b: SavedApplicationAnswer) => a.origin === b.origin
      && normalizeApplicationQuestion(a.question) === normalizeApplicationQuestion(b.question);
    const retained = existing.filter(entry => !choices.some(choice => matches(entry, choice)));
    const remembered = choices.filter(choice => choice.remember && choice.answer.trim())
      .map(({ question, origin, answer }) => ({ question, origin, answer }));
    await chrome.storage.local.set({ [APPLICATION_ANSWERS_KEY]: [...retained, ...remembered] });
    return this.frames.runForTab(tabId, 'APPLICATION_APPLY_ANSWERS', { profile: {}, answers: choices });
  }

  processMessage(message: { type: string; value?: unknown }, sender: chrome.runtime.MessageSender, respond: (response: unknown) => void): boolean {
    if (message.type !== 'APPLICATION_ANSWERS_APPLY') return false;
    if (sender.tab || !Array.isArray(message.value) || message.value.length > 200 || !message.value.every(validChoice)) {
      respond({ success: false, error: 'Scan the questions and choose your answers in Apply.' });
      return true;
    }
    const choices = message.value;
    const operation = this.queue.then(async () => {
      const stored = await chrome.storage.local.get('applicationFlow');
      if (stored.applicationFlow?.status === 'running') return { success: false, error: 'Pause application automation before applying answers, then Resume when you are ready.' };
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined) return { success: false, error: 'Open the application tab first.' };
      // Questions may originate inside cross-origin application frames. Each frame matches its own origin.
      return this.apply(choices, tab.id);
    });
    this.queue = operation.catch(() => undefined);
    void operation.then(respond, () => respond({ success: false, error: 'Could not apply the answers. Refresh the page and scan again.' }));
    return true;
  }
}
