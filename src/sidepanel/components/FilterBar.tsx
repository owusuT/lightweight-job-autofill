interface Prefs {
  query: string;
  remote: boolean;
  visa: boolean;
  minStars: number;
  maxAgeDays: number;
}

interface FilterBarProps {
  prefs: Prefs;
  loading: boolean;
  onChange: (patch: Partial<Prefs>) => void;
  onSearch: () => void;
  onAddPage?: () => void;
  adding?: boolean;
  onAutofill?: () => void;
  filling?: boolean;
  onClearAdded?: () => void;
  addedCount?: number;
  onClose?: () => void;
}

export function FilterBar({ prefs, loading, onChange, onSearch, onAddPage, adding, onAutofill, filling, onClearAdded, addedCount, onClose }: FilterBarProps) {
  return (
    <div className="filter-bar">
      <div className="search-row">
        <input
          className="input"
          type="search"
          placeholder="Search role or keyword…"
          value={prefs.query}
          onChange={(e) => onChange({ query: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearch();
          }}
          aria-label="Search jobs"
        />
        <button className="btn btn-primary" onClick={onSearch} disabled={loading || !prefs.query.trim()}>
          {loading ? "…" : "Go"}
        </button>
        {onAddPage && (
          <button
            className="btn btn-ghost"
            onClick={onAddPage}
            disabled={adding}
            title="Add the job on the current page"
          >
            {adding ? "…" : "Add page"}
          </button>
        )}
        {onClearAdded && (addedCount || 0) > 0 && (
          <button
            className="btn btn-text"
            onClick={onClearAdded}
            title="Remove jobs added from pages"
          >
            Clear added
          </button>
        )}
        {onClose && (
          <button className="btn btn-text" onClick={onClose} title="Close side panel" aria-label="Close side panel">
            ×
          </button>
        )}
      </div>

      <div className="toggles">
        {onAutofill && (
          <button
            className="btn btn-ghost"
            onClick={onAutofill}
            disabled={filling}
            title="Scan and autofill the current application page"
          >
            {filling ? "Scanning and filling…" : "Autofill"}
          </button>
        )}
        <label className="toggle">
          <input
            type="checkbox"
            checked={prefs.remote}
            onChange={(e) => onChange({ remote: e.target.checked })}
          />
          Remote
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={prefs.visa}
            onChange={(e) => onChange({ visa: e.target.checked })}
          />
          Visa
        </label>
        <label className="select-wrap">
          Min stars
          <select
            className="select"
            value={prefs.minStars}
            onChange={(e) => onChange({ minStars: Number(e.target.value) })}
          >
            {[1, 2, 3, 3.5, 4, 4.5].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="select-wrap">
          Age
          <select
            className="select"
            value={prefs.maxAgeDays}
            onChange={(e) => onChange({ maxAgeDays: Number(e.target.value) })}
          >
            <option value={7}>7d</option>
            <option value={14}>14d</option>
            <option value={30}>30d</option>
            <option value={365}>1y</option>
          </select>
        </label>
      </div>
    </div>
  );
}

export type { Prefs };
