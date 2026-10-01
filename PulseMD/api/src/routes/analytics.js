const express = require('express');
const { authMiddleware, allowRoles } = require('../middleware/auth');
const { User, Appointment, Payment, DoctorProfile, AIUsageLog } = require('../models');

const router = express.Router();

router.get('/', authMiddleware, allowRoles('admin', 'doctor'), async (req, res, next) => {
  try {
    const scope = req.user.role === 'doctor' ? { doctor: req.user._id } : {};
    const [
      users,
      appointments,
      payments,
      doctors,
      aiUsage
    ] = await Promise.all([
      User.countDocuments(),
      Appointment.find(scope),
      Payment.find(scope),
      DoctorProfile.find(),
      AIUsageLog.find()
    ]);

    const revenue = payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
    const monthly = Array.from({ length: 6 }).map((_, index) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (5 - index));
      const label = date.toLocaleString('en-IN', { month: 'short' });
      return {
        month: label,
        appointments: appointments.filter((a) => new Date(a.createdAt).getMonth() === date.getMonth()).length,
        revenue: payments.filter((p) => new Date(p.createdAt).getMonth() === date.getMonth()).reduce((sum, p) => sum + p.amount, 0),
        ai: aiUsage.filter((a) => new Date(a.createdAt).getMonth() === date.getMonth()).length
      };
    });

    res.json({
      cards: {
        users,
        appointments: appointments.length,
        revenue,
        doctors: doctors.length,
        aiUsage: aiUsage.length
      },
      charts: {
        monthly,
        doctorGrowth: doctors.map((doctor, index) => ({ name: `D${index + 1}`, doctors: index + 1 })),
        usersByRole: await User.aggregate([{ $group: { _id: '$role', value: { $sum: 1 } } }])
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
