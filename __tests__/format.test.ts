import { formatDuration } from '../src/utils/format';

describe('formatDuration', () => {
  it('formats seconds as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5_000)).toBe('0:05');
    expect(formatDuration(65_000)).toBe('1:05');
  });
  it('adds hours for long durations', () => {
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });
  it('clamps negative values', () => {
    expect(formatDuration(-500)).toBe('0:00');
  });
});
