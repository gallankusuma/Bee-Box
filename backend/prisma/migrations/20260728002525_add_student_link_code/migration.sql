/*
  Warnings:

  - Added the required column `linkCode` to the `StudentProfile` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StudentProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "birthdate" TEXT,
    "grade" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedDate" TEXT,
    "maxStreak" INTEGER NOT NULL DEFAULT 0,
    "totalGames" INTEGER NOT NULL DEFAULT 0,
    "correctAnswers" INTEGER NOT NULL DEFAULT 0,
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "fastestTime" INTEGER NOT NULL DEFAULT 999,
    "unlockedGrades" TEXT NOT NULL DEFAULT '[1]',
    "sound" BOOLEAN NOT NULL DEFAULT true,
    "vibrate" BOOLEAN NOT NULL DEFAULT true,
    "linkCode" TEXT NOT NULL,
    CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StudentProfile" ("birthdate", "correctAnswers", "fastestTime", "grade", "id", "lastPlayedDate", "level", "maxStreak", "sound", "streak", "totalGames", "totalQuestions", "unlockedGrades", "userId", "vibrate", "xp") SELECT "birthdate", "correctAnswers", "fastestTime", "grade", "id", "lastPlayedDate", "level", "maxStreak", "sound", "streak", "totalGames", "totalQuestions", "unlockedGrades", "userId", "vibrate", "xp" FROM "StudentProfile";
DROP TABLE "StudentProfile";
ALTER TABLE "new_StudentProfile" RENAME TO "StudentProfile";
CREATE UNIQUE INDEX "StudentProfile_userId_key" ON "StudentProfile"("userId");
CREATE UNIQUE INDEX "StudentProfile_linkCode_key" ON "StudentProfile"("linkCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
