import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfileTab } from './ProfileTab';
import { PROFILE_CHECKBOXES, PROFILE_FIELDS } from '../../shared/profileSchema';

function renderTab(overrides: Partial<Parameters<typeof ProfileTab>[0]> = {}) {
  const props = {
    profile: {},
    onChange: vi.fn(),
    onToggle: vi.fn(),
    onSave: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
  render(<ProfileTab {...props} />);
  return props;
}

describe('ProfileTab', () => {
  it('renders every profile field and consent toggle', () => {
    renderTab();
    expect(screen.getByLabelText('First Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Skills')).toBeInTheDocument();
    expect(screen.getByLabelText('Work Authorization')).toBeInTheDocument();
    expect(screen.getByLabelText('Cover Letter')).toBeInTheDocument();

    const inputs = document.querySelectorAll('input[id^="profile-"], select[id^="profile-"], textarea[id^="profile-"]');
    expect(inputs).toHaveLength(PROFILE_FIELDS.length);
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(PROFILE_CHECKBOXES.length);
  });

  it('reports text edits with the field key', () => {
    const props = renderTab();
    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Ada' } });
    expect(props.onChange).toHaveBeenCalledWith('firstName', 'Ada');
  });

  it('reports consent toggles separately', () => {
    const props = renderTab();
    fireEvent.click(screen.getByLabelText('Background check consent'));
    expect(props.onToggle).toHaveBeenCalledWith('consentBackgroundCheck', true);
  });

  it('wires save and clear', () => {
    const props = renderTab();
    fireEvent.click(screen.getByText('Save Profile'));
    fireEvent.click(screen.getByText('Clear'));
    expect(props.onSave).toHaveBeenCalled();
    expect(props.onClear).toHaveBeenCalled();
  });
});
