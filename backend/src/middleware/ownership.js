const prisma = require('../db');

// Loads req.params.id as a Class, requires it belong to the caller
// (teacherId) AND the caller's tenant (schoolId). Same 404 for "doesn't
// exist" and "exists in another teacher/school" - don't leak which.
// RoleAssignment.scopeType/scopeId stay unused here deliberately: there's no
// TeachingAssignment/CourseOffering yet to scope against (Class.teacherId is
// still a flat single-owner FK), so real scope-based permission is deferred
// to Academic Foundation. This middleware is the narrower fix the review's
// "Scope-based permission" gap actually needs today: one auditable place
// instead of 5 inline copies.
function requireClassOwnership() {
  return async (req, res, next) => {
    const cls = await prisma.class.findUnique({ where: { id: req.params.id } });
    if(!cls || cls.teacherId !== req.auth.userId || cls.schoolId !== req.auth.schoolId) {
      return res.status(404).json({ error: 'Class not found' });
    }
    req.class = cls;
    next();
  };
}

// Must run after requireClassOwnership() - assumes req.class is set.
function requireStudentEnrollment() {
  return async (req, res, next) => {
    const enrollment = await prisma.classEnrollment.findUnique({
      where: { classId_studentId: { classId: req.class.id, studentId: req.params.studentId } }
    });
    if(!enrollment) return res.status(404).json({ error: 'Student is not enrolled in this class' });
    req.enrollment = enrollment;
    next();
  };
}

module.exports = { requireClassOwnership, requireStudentEnrollment };
