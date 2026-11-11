// controllers/attendance.controller.js

const { Attendance, attendanceStatus } = require("../models/Attendance.model");
const { User } = require("../models/User.model");

// ============================================================================
// EMPLOYEE ROUTES
// ============================================================================

// Get today's attendance
const getTodayAttendance = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const attendance = await Attendance.findOne({
      employeeId: userId,
      date: { $gte: today, $lt: tomorrow },
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "No attendance record for today",
      });
    }

    res.json({ success: true, data: attendance });
  } catch (error) {
    console.error("Get today attendance error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get attendance",
    });
  }
};

// Start timer - Check In
const startTimer = async (req, res) => {
  try {
    const userId = req.user._id;
    const { location, checkInLocation } = req.body;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let attendance = await Attendance.findOne({
      employeeId: userId,
      date: { $gte: today, $lt: tomorrow },
    });

    if (attendance && attendance.checkIn) {
      return res.status(400).json({
        success: false,
        message: "You have already checked in today",
        data: attendance,
      });
    }

    const user = await User.findById(userId).populate("departmentId");

    if (!attendance) {
      attendance = new Attendance({
        employeeId: userId,
        employeeName: user.fullName,
        employeeEmail: user.email,
        employeeDepartment: user.departmentId?.name || "Unassigned",
        employeePosition: user.position || "",
        date: new Date(),
        checkIn: new Date(),
        timerStart: new Date(),
        status: attendanceStatus.PRESENT,
        location: location || "Office",
        checkInLocation: checkInLocation || {},
      });
    } else {
      attendance.checkIn = new Date();
      attendance.timerStart = new Date();
      attendance.status = attendanceStatus.PRESENT;
      attendance.location = location || attendance.location;
      if (checkInLocation) {
        attendance.checkInLocation = checkInLocation;
      }
    }

    await attendance.save();

    res.status(201).json({
      success: true,
      message: "Timer started successfully",
      data: attendance,
    });
  } catch (error) {
    console.error("Start timer error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to start timer",
    });
  }
};

// Pause timer
const pauseTimer = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const attendance = await Attendance.findOne({
      employeeId: userId,
      date: { $gte: today, $lt: tomorrow },
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "No active timer found",
      });
    }

    if (!attendance.checkIn) {
      return res.status(400).json({
        success: false,
        message: "You haven't checked in yet",
      });
    }

    if (attendance.timerPaused) {
      return res.status(400).json({
        success: false,
        message: "Timer is already paused",
      });
    }

    attendance.timerPaused = true;
    attendance.timerPausedAt = new Date();
    await attendance.save();

    res.json({
      success: true,
      message: "Timer paused successfully",
      data: attendance,
    });
  } catch (error) {
    console.error("Pause timer error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to pause timer",
    });
  }
};

// Resume timer
const resumeTimer = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const attendance = await Attendance.findOne({
      employeeId: userId,
      date: { $gte: today, $lt: tomorrow },
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "No active timer found",
      });
    }

    if (!attendance.timerPaused) {
      return res.status(400).json({
        success: false,
        message: "Timer is not paused",
      });
    }

    if (attendance.timerPausedAt) {
      const pausedDuration =
        new Date().getTime() - attendance.timerPausedAt.getTime();
      attendance.totalPausedDuration += pausedDuration;
    }

    attendance.timerPaused = false;
    attendance.timerPausedAt = null;
    await attendance.save();

    res.json({
      success: true,
      message: "Timer resumed successfully",
      data: attendance,
    });
  } catch (error) {
    console.error("Resume timer error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to resume timer",
    });
  }
};

// Check Out - Done Today
const checkOut = async (req, res) => {
  try {
    const userId = req.user._id;
    const { location, checkOutLocation, notes } = req.body;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const attendance = await Attendance.findOne({
      employeeId: userId,
      date: { $gte: today, $lt: tomorrow },
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "No attendance record found for today",
      });
    }

    if (!attendance.checkIn) {
      return res.status(400).json({
        success: false,
        message: "You haven't checked in yet",
      });
    }

    if (attendance.checkOut) {
      return res.status(400).json({
        success: false,
        message: "You have already checked out for today",
      });
    }

    // Calculate total working time
    let totalWorkingMs = 0;
    if (attendance.timerStart) {
      if (attendance.timerPaused && attendance.timerPausedAt) {
        const pausedDuration =
          new Date().getTime() - attendance.timerPausedAt.getTime();
        totalWorkingMs =
          new Date().getTime() -
          attendance.timerStart.getTime() -
          attendance.totalPausedDuration -
          pausedDuration;
      } else {
        totalWorkingMs =
          new Date().getTime() -
          attendance.timerStart.getTime() -
          attendance.totalPausedDuration;
      }
    }

    const workingHours = Math.max(0, totalWorkingMs / (1000 * 60 * 60));

    attendance.checkOut = new Date();
    attendance.timerPaused = false;
    attendance.totalWorkingTime = totalWorkingMs;
    attendance.workingHours = parseFloat(workingHours.toFixed(2));
    attendance.location = location || attendance.location;
    if (checkOutLocation) {
      attendance.checkOutLocation = checkOutLocation;
    }
    if (notes) {
      attendance.notes = notes;
    }

    if (workingHours > 8) {
      attendance.overtime = parseFloat((workingHours - 8).toFixed(2));
    }

    await attendance.save();

    res.json({
      success: true,
      message: "Checked out successfully! Have a great day!",
      data: attendance,
    });
  } catch (error) {
    console.error("Check out error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to check out",
    });
  }
};

// Get timer status
const getTimerStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const attendance = await Attendance.findOne({
      employeeId: userId,
      date: { $gte: today, $lt: tomorrow },
    });

    if (!attendance) {
      return res.json({
        success: true,
        data: {
          isActive: false,
          isPaused: false,
          hasCheckedIn: false,
          hasCheckedOut: false,
          checkIn: null,
          checkOut: null,
          currentWorkingHours: 0,
          totalWorkingHours: 0,
          overtime: 0,
          status: "",
        },
      });
    }

    let currentWorkingMs = attendance.totalWorkingTime || 0;
    let isPaused = attendance.timerPaused || false;
    let isActive = !!attendance.checkIn && !attendance.checkOut;

    if (isActive && !isPaused && attendance.timerStart) {
      const elapsedMs = new Date().getTime() - attendance.timerStart.getTime();
      currentWorkingMs += elapsedMs - (attendance.totalPausedDuration || 0);
    }

    const currentWorkingHours = parseFloat(
      (currentWorkingMs / (1000 * 60 * 60)).toFixed(2),
    );

    res.json({
      success: true,
      data: {
        isActive,
        isPaused,
        hasCheckedIn: !!attendance.checkIn,
        hasCheckedOut: !!attendance.checkOut,
        checkIn: attendance.checkIn,
        checkOut: attendance.checkOut,
        checkInTime: attendance.checkInTime,
        checkOutTime: attendance.checkOutTime,
        currentWorkingHours,
        totalWorkingHours: attendance.workingHours || 0,
        overtime: attendance.overtime || 0,
        status: attendance.status,
        location: attendance.location,
        notes: attendance.notes,
        attendanceId: attendance._id,
      },
    });
  } catch (error) {
    console.error("Get timer status error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get timer status",
    });
  }
};

// ============================================================================
// ADMIN ROUTES
// ============================================================================

// Get all attendance records (Admin only)
const getAllAttendance = async (req, res) => {
  try {
    const {
      date,
      startDate,
      endDate,
      department,
      status,
      search,
      limit = 50,
      page = 1,
    } = req.query;

    const query = {};

    if (date) {
      const targetDate = new Date(date);
      targetDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);
      query.date = { $gte: targetDate, $lt: nextDay };
    } else if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    if (department) {
      query.employeeDepartment = department;
    }
    if (status) {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { employeeName: { $regex: search, $options: "i" } },
        { employeeEmail: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;

    const [attendance, total] = await Promise.all([
      Attendance.find(query)
        .sort({ date: -1, checkIn: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate("employeeId", "fullName email employeeId"),
      Attendance.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: attendance,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get all attendance error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get attendance records",
    });
  }
};

// Get attendance stats for dashboard
const getAttendanceStats = async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const employees = await User.find({ isActive: true });
    const totalEmployees = employees.length;

    const todayAttendance = await Attendance.find({
      date: { $gte: targetDate, $lt: nextDay },
    });

    const present = todayAttendance.filter(
      (a) => a.status === attendanceStatus.PRESENT,
    ).length;
    const absent = totalEmployees - todayAttendance.length;
    const late = todayAttendance.filter(
      (a) => a.status === attendanceStatus.LATE,
    ).length;
    const halfDay = todayAttendance.filter(
      (a) => a.status === attendanceStatus.HALF_DAY,
    ).length;
    const onLeave = todayAttendance.filter(
      (a) => a.status === attendanceStatus.ON_LEAVE,
    ).length;

    const presentCount = present + late;
    const attendanceRate =
      totalEmployees > 0
        ? Math.round((presentCount / totalEmployees) * 100)
        : 0;

    res.json({
      success: true,
      data: {
        totalEmployees,
        present,
        absent,
        late,
        halfDay,
        onLeave,
        attendanceRate,
        totalWorkingHours: todayAttendance.reduce(
          (sum, a) => sum + (a.workingHours || 0),
          0,
        ),
        totalOvertime: todayAttendance.reduce(
          (sum, a) => sum + (a.overtime || 0),
          0,
        ),
      },
    });
  } catch (error) {
    console.error("Get attendance stats error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get attendance stats",
    });
  }
};
// controllers/attendance.controller.js

// Add this function after the other functions
const getEmployeeAttendanceHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate, limit = 50, page = 1 } = req.query;

    const query = { employeeId: userId };

    if (startDate) {
      query.date = { ...query.date, $gte: new Date(startDate) };
    }
    if (endDate) {
      query.date = { ...query.date, $lte: new Date(endDate) };
    }

    const skip = (page - 1) * limit;

    const [attendance, total] = await Promise.all([
      Attendance.find(query)
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Attendance.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: attendance,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get employee attendance history error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get attendance history",
    });
  }
};

module.exports = {
  getEmployeeAttendanceHistory,
  getTodayAttendance,
  startTimer,
  pauseTimer,
  resumeTimer,
  checkOut,
  getTimerStatus,
  getAllAttendance,
  getAttendanceStats,
};
