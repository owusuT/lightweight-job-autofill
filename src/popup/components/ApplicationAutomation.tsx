import { useEffect, useState } from 'react';
import type { ApplicationFlow, FlowResponse } from '../../shared/applicationFlow';
import { MESSAGE_TYPE } from '../../shared/messages';
import { send } from '../api';

interface Props {
  position: string;
  company: string;
}

export function ApplicationAutomation({ position, company }: Props) {
  const [flow, setFlow] = useState<ApplicationFlow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    let polling = false;
    const refresh = async () => {
      if (polling) return;
      polling = true;
      const result = await send<FlowResponse>(MESSAGE_TYPE.APPLICATION_FLOW_STATUS);
      if (mounted && result.success) setFlow(result.flow);
      polling = false;
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 1000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  const control = async (type: string) => {
    setBusy(true);
    setError('');
    try {
      const result = await send<FlowResponse>(type, { position, company });
      if (result.success) setFlow(result.flow);
      else setError(result.error || 'Could not update application automation.');
    } finally {
      setBusy(false);
    }
  };

  const active = flow?.status === 'running' || flow?.status === 'paused';
  return (
    <section className="automation-panel" aria-label="Application automation">
      <h2 className="section-title">Application automation</h2>
      <p className="muted-note">Open the application form, then Start. Saved profile details and documents fill each step automatically through final review.</p>
      <p role="status" aria-live="polite">{flow ? `Step ${flow.step} · ${flow.message}` : 'Ready to start.'}</p>
      {error && <p className="status-msg error" role="alert">{error}</p>}
      <div className="btn-row">
        {!active && <button className="btn btn-primary" disabled={busy} onClick={() => void control(MESSAGE_TYPE.APPLICATION_FLOW_START)}>Start application</button>}
        {flow?.status === 'running' && <button className="btn btn-secondary" disabled={busy} onClick={() => void control(MESSAGE_TYPE.APPLICATION_FLOW_PAUSE)}>{busy ? 'Pausing…' : 'Pause'}</button>}
        {flow?.status === 'paused' && <button className="btn btn-primary" disabled={busy} onClick={() => void control(MESSAGE_TYPE.APPLICATION_FLOW_RESUME)}>Resume</button>}
        {active && <button className="btn btn-danger" disabled={busy} onClick={() => void control(MESSAGE_TYPE.APPLICATION_FLOW_STOP)}>Stop</button>}
      </div>
    </section>
  );
}
