import { useState } from 'react';
import type { ApplicationQuestion, ApplicationAnswerChoice, ApplicationQuestionsResponse } from '../../shared/applicationAnswers';
import { MESSAGE_TYPE } from '../../shared/messages';
import { send, type FillResponse } from '../api';

type AnswerRow = ApplicationQuestion & { answer: string; remember: boolean };

export function ApplicationAnswers() {
  const [rows, setRows] = useState<AnswerRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const scan = async () => {
    setBusy(true);
    try {
      const result = await send<ApplicationQuestionsResponse>(MESSAGE_TYPE.APPLICATION_QUESTIONS);
      const unique = new Map<string, ApplicationQuestion>();
      for (const question of result.candidates || []) unique.set(`${question.origin}\n${question.question}`, question);
      setRows([...unique.values()].map(question => ({ ...question, answer: question.savedAnswer, remember: question.savedAnswer ? true : !question.sensitive })));
      setMessage(unique.size ? `Found ${unique.size} questions. Choose the answers you want to use.` : 'No questions found. Open the application page and try again.');
    } finally {
      setBusy(false);
    }
  };

  const update = (index: number, patch: Partial<Pick<AnswerRow, 'answer' | 'remember'>>) => {
    setRows(previous => previous.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };

  const apply = async () => {
    setBusy(true);
    try {
      const choices: ApplicationAnswerChoice[] = rows.map(({ question, origin, answer, remember }) => ({ question, origin, answer, remember }));
      const result = await send<FillResponse>(MESSAGE_TYPE.APPLICATION_ANSWERS_APPLY, choices);
      setMessage(result.success ? `Applied ${result.fieldsFilled || 0} fields. Review your answers, then Resume if automation is paused.`
        : result.error || 'Could not apply these answers. Check the page and scan again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="automation-panel" aria-label="Application answers">
      <h2 className="section-title">Application answers</h2>
      <p className="muted-note">Scan this step to answer employer questions, consent choices, and identity fields. Remembered answers are saved locally and reused for the same question on this website. Leave Remember unchecked to use an answer just this time.</p>
      <button className="btn btn-secondary" disabled={busy} onClick={() => void scan()}>{busy ? 'Working…' : 'Scan questions'}</button>
      {rows.map((row, index) => (
        <div className="application-answer" key={`${row.origin}\n${row.question}`}>
          <label htmlFor={`application-answer-${index}`}>{row.question}</label>
          <p className="muted-note">{row.origin}</p>
          {row.options.length ? (
            <select id={`application-answer-${index}`} disabled={busy} value={row.answer} onChange={event => update(index, { answer: event.target.value })}>
              <option value="">Choose your answer</option>
              {row.options.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          ) : (
            <input id={`application-answer-${index}`} type={row.sensitive ? 'password' : 'text'} disabled={busy}
              autoComplete="off" value={row.answer} placeholder="Enter your answer or the exact dropdown option"
              onChange={event => update(index, { answer: event.target.value })} />
          )}
          <label className="checkbox-label">
            <input type="checkbox" checked={row.remember} disabled={busy} onChange={event => update(index, { remember: event.target.checked })} />
            Remember for this website
          </label>
        </div>
      ))}
      {!!rows.length && <button className="btn btn-primary" disabled={busy} onClick={() => void apply()}>Apply chosen answers</button>}
      <p role="status" aria-live="polite">{message}</p>
    </section>
  );
}
