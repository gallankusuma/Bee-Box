-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN "expiresAt" DATETIME;

-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN "linkCodeExpiresAt" DATETIME;

-- CreateTable
CREATE TABLE "TeacherInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "token" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" DATETIME NOT NULL,
    "acceptedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeacherInvite_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "schoolId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GuardianStudentRelationship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL DEFAULT 'PARENT',
    "legalGuardian" BOOLEAN NOT NULL DEFAULT true,
    "pickupPermission" BOOLEAN NOT NULL DEFAULT false,
    "emergencyContact" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "communicationPriority" INTEGER NOT NULL DEFAULT 1,
    "linkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" DATETIME,
    CONSTRAINT "GuardianStudentRelationship_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GuardianStudentRelationship_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_GuardianStudentRelationship" ("communicationPriority", "emergencyContact", "id", "legalGuardian", "linkedAt", "parentId", "pickupPermission", "relationshipType", "studentId", "verificationStatus") SELECT "communicationPriority", "emergencyContact", "id", "legalGuardian", "linkedAt", "parentId", "pickupPermission", "relationshipType", "studentId", "verificationStatus" FROM "GuardianStudentRelationship";
DROP TABLE "GuardianStudentRelationship";
ALTER TABLE "new_GuardianStudentRelationship" RENAME TO "GuardianStudentRelationship";
CREATE UNIQUE INDEX "GuardianStudentRelationship_parentId_studentId_key" ON "GuardianStudentRelationship"("parentId", "studentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "TeacherInvite_token_key" ON "TeacherInvite"("token");
