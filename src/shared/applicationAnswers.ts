export interface ApplicationQuestion {
  question: string;
  origin: string;
  options: string[];
  savedAnswer: string;
  sensitive: boolean;
}

export interface SavedApplicationAnswer {
  question: string;
  origin: string;
  answer: string;
}

export interface ApplicationAnswerChoice extends SavedApplicationAnswer {
  remember: boolean;
}

export interface ApplicationQuestionsResponse {
  success: boolean;
  candidates?: ApplicationQuestion[];
  error?: string;
}

export const APPLICATION_ANSWERS_KEY = 'applicationAnswers';

export function normalizeApplicationQuestion(question: string): string {
  return question.normalize('NFKC').toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}
