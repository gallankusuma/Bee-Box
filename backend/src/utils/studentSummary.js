// Shared shape for "one row in a roster/children list" - used by both the
// teacher class roster and the parent's linked-children list.
function studentSummary(sp) {
  const accuracy = sp.totalQuestions > 0 ? Math.round((sp.correctAnswers / sp.totalQuestions) * 100) : 0;
  return {
    studentId: sp.id,
    name: sp.user.name,
    avatar: sp.user.avatar,
    grade: sp.grade,
    level: sp.level,
    xp: sp.xp,
    totalGames: sp.totalGames,
    accuracy,
    maxStreak: sp.maxStreak,
    streak: sp.streak,
    lastPlayedDate: sp.lastPlayedDate
  };
}

module.exports = { studentSummary };
