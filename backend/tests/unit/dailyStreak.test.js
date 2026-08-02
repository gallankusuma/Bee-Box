const { dateKey, nextDailyStreak } = require('../../src/utils/dailyStreak');

describe('dateKey', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(dateKey(new Date(2026, 6, 5))).toBe('2026-07-05');
  });
});

describe('nextDailyStreak', () => {
  it('keeps the streak unchanged if already played today', () => {
    const today = new Date(2026, 6, 5);
    const result = nextDailyStreak(3, dateKey(today), today);
    expect(result).toEqual({ streak: 3, lastPlayedDate: dateKey(today) });
  });

  it('increments the streak if last played yesterday', () => {
    const today = new Date(2026, 6, 5);
    const yesterday = new Date(2026, 6, 4);
    const result = nextDailyStreak(3, dateKey(yesterday), today);
    expect(result).toEqual({ streak: 4, lastPlayedDate: dateKey(today) });
  });

  it('resets the streak to 1 after a gap of more than one day', () => {
    const today = new Date(2026, 6, 5);
    const threeDaysAgo = new Date(2026, 6, 2);
    const result = nextDailyStreak(5, dateKey(threeDaysAgo), today);
    expect(result).toEqual({ streak: 1, lastPlayedDate: dateKey(today) });
  });

  it('starts a fresh streak at 1 when there is no prior play date', () => {
    const today = new Date(2026, 6, 5);
    const result = nextDailyStreak(0, null, today);
    expect(result).toEqual({ streak: 1, lastPlayedDate: dateKey(today) });
  });
});
