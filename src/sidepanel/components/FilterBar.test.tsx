import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FilterBar, type Prefs } from './FilterBar';

const prefs: Prefs = {
  query: 'data analyst',
  remote: false,
  visa: false,
  minStars: 3,
  maxAgeDays: 30,
};

describe('FilterBar', () => {
  it('clears only the jobs added from pages', () => {
    const onClearAdded = vi.fn();
    render(
      <FilterBar
        prefs={prefs}
        loading={false}
        onChange={() => {}}
        onSearch={() => {}}
        onClearAdded={onClearAdded}
        addedCount={2}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear added' }));
    expect(onClearAdded).toHaveBeenCalledOnce();
  });

  it('hides Clear added when no jobs were added', () => {
    render(
      <FilterBar
        prefs={prefs}
        loading={false}
        onChange={() => {}}
        onSearch={() => {}}
        onClearAdded={() => {}}
        addedCount={0}
      />
    );

    expect(screen.queryByRole('button', { name: 'Clear added' })).not.toBeInTheDocument();
  });
});
