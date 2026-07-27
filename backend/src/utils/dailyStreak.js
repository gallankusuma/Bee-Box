// Server-side equivalent of the client's updateDailyStreak() fix - keeps the
// two implementations in lockstep. See game.js dateKey()/updateDailyStreak().
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Returns { streak, lastPlayedDate } - does not mutate its input.
function nextDailyStreak(currentStreak, lastPlayedDate, now = new Date()) {
  const todayKey = dateKey(now);
  if(lastPlayedDate === todayKey) return { streak: currentStreak, lastPlayedDate: todayKey };

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const streak = (lastPlayedDate === dateKey(yesterday)) ? currentStreak + 1 : 1;
  return { streak, lastPlayedDate: todayKey };
}

module.exports = { dateKey, nextDailyStreak };
