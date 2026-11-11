// controllers/kpi.controller.js - COMPLETE FIXED VERSION
const { KPIWeight } = require("../models/KPIWeight.model");
const { KPIScore } = require("../models/KPIScore.model");
const { KPIFeedback } = require("../models/KPIFeedback.model");
const { KPILockStatus } = require("../models/KPILockStatus.model");
const { User } = require("../models/User.model");
const { Department } = require("../models/Department.model");
const { Task } = require("../models/Task.model");
const mongoose = require("mongoose");

// ============================================================
// HELPER: Find users by department
// ============================================================
const findUsersByDepartment = async (departmentId, departmentName) => {
  const allUsers = await User.find({ isActive: true })
    .select("_id fullName email department departmentId profilePhoto avatar");

  console.log(`🔍 Total active users: ${allUsers.length}`);

  const matchedUsers = allUsers.filter(user => {
    if (user.departmentId && user.departmentId.toString() === departmentId) {
      return true;
    }

    if (user.department) {
      if (user.department._id && user.department._id.toString() === departmentId) {
        return true;
      }
      if (user.department.id && user.department.id.toString() === departmentId) {
        return true;
      }
      if (user.department.name && user.department.name.toLowerCase() === departmentName.toLowerCase()) {
        return true;
      }
    }

    return false;
  });

  console.log(`📊 Found ${matchedUsers.length} users in department: ${departmentName}`);
  return matchedUsers;
};

// ============================================================
// CONSTANTS
// ============================================================
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// ============================================================
// KPI WEIGHT MANAGEMENT
// ============================================================

const getKPIWeights = async (req, res) => {
  try {
    const { departmentId } = req.params;

    let weights = await KPIWeight.findOne({ departmentId })
      .populate("departmentId", "name code")
      .populate("createdBy", "fullName email")
      .populate("updatedBy", "fullName email");

    if (!weights) {
      weights = {
        departmentId,
        weights: {
          taskCompletion: 20,
          qualityScore: 20,
          efficiency: 20,
          collaboration: 15,
          innovation: 15,
          attendance: 10,
        },
        totalWeight: 100,
        isActive: true,
      };
    }

    res.json({
      success: true,
      data: weights,
    });
  } catch (error) {
    console.error("Get KPI weights error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// HELPER: Resolve a KPI by real ObjectId OR synthetic "calculated_*" ID
// ============================================================
const resolveKPIScore = async (kpiId, options = {}) => {
  const { autoCreate = false } = options;

  if (!kpiId || typeof kpiId !== "string") return null;

  // 1. Real Mongo ObjectId
  if (mongoose.Types.ObjectId.isValid(kpiId) && kpiId.length === 24) {
    return KPIScore.findById(kpiId);
  }

  // 2. Synthetic: "calculated_<userId>_<Month>_<Year>"
  const match = kpiId.match(/^calculated_([a-f\d]{24})_([A-Za-z]+)_(\d{4})$/i);
  if (!match) return null;

  const [, userId, monthName, yearStr] = match;
  const year = Number(yearStr);
  const monthIdx = MONTHS.indexOf(monthName) + 1;

  if (monthIdx < 1 || !year) return null;

  const monthStr = `${year}-${String(monthIdx).padStart(2, "0")}`;

  // Query that handles both schema shapes
  let kpi = await KPIScore.findOne({
    $or: [{ "userId._id": userId }, { userId: userId }],
    month: monthStr,
    year: year,
  });

  // Auto-create a placeholder so the first feedback can attach
  if (!kpi && autoCreate) {
    const user = await User.findById(userId)
      .select(
        "fullName email role profilePhoto avatar employeeId departmentId department"
      )
      .lean();

    if (!user) return null;

    // ---- Resolve departmentId (schema-required) ----
    let departmentId = null;

    if (user.departmentId) {
      departmentId =
        typeof user.departmentId === "object" && user.departmentId._id
          ? user.departmentId._id
          : user.departmentId;
    }

    if (!departmentId && user.department) {
      departmentId =
        typeof user.department === "object" && user.department._id
          ? user.department._id
          : user.department;
    }

    // Fallback: any department in the DB (so validation passes)
    if (!departmentId) {
      const { Department } = require("../models/Department.model");
      const anyDept = await Department.findOne().select("_id").lean();
      departmentId = anyDept?._id || null;
    }

    // If we truly cannot resolve one, abort — do not attempt to save
    if (!departmentId) {
      console.error(
        `❌ Cannot auto-create KPIScore — no department available for user ${userId}`
      );
      return null;
    }

    try {
      kpi = await KPIScore.create({
        userId: {
          _id: user._id,
          fullName: user.fullName,
          email: user.email,
          employeeId: user.employeeId,
          role: user.role,
          avatar: user.profilePhoto || user.avatar || null,
        },
        departmentId,
        month: monthStr,
        year,
        scores: {},
        totalScore: 0,
        performanceLevel: "average",
        calculatedAt: new Date(),
        calculatedBy: null,
        comments: "Auto-created on first feedback",
      });
      console.log(
        `✅ Auto-created KPIScore for user ${userId} (${monthStr}) department=${departmentId}`
      );
    } catch (createErr) {
      console.error("❌ Failed to auto-create KPIScore:", createErr.message);
      return null;
    }
  }

  return kpi;
};
const upsertKPIWeights = async (req, res) => {
  try {
    const { departmentId } = req.params;
    const { weights } = req.body;
    const user = req.user;

    const {
      taskCompletion,
      qualityScore,
      efficiency,
      collaboration,
      innovation,
      attendance,
    } = weights;

    const total = taskCompletion + qualityScore + efficiency + collaboration + innovation + attendance;

    if (total !== 100) {
      return res.status(400).json({
        success: false,
        message: `Total weight must equal 100%. Current total: ${total}%`,
        total,
      });
    }

    let kpiWeights = await KPIWeight.findOne({ departmentId });

    if (kpiWeights) {
      kpiWeights.weights = {
        taskCompletion,
        qualityScore,
        efficiency,
        collaboration,
        innovation,
        attendance,
      };
      kpiWeights.totalWeight = total;
      kpiWeights.updatedBy = user._id;
      kpiWeights.version += 1;
      await kpiWeights.save();
    } else {
      kpiWeights = await KPIWeight.create({
        departmentId,
        weights: {
          taskCompletion,
          qualityScore,
          efficiency,
          collaboration,
          innovation,
          attendance,
        },
        totalWeight: total,
        createdBy: user._id,
        updatedBy: user._id,
      });
    }

    const populatedWeights = await KPIWeight.findById(kpiWeights._id)
      .populate("departmentId", "name code")
      .populate("createdBy", "fullName email")
      .populate("updatedBy", "fullName email");

    res.json({
      success: true,
      message: "KPI weights saved successfully",
      data: populatedWeights,
    });
  } catch (error) {
    console.error("Upsert KPI weights error:", error);
    res.status(500).json({ success: false, message: "Server error: " + error.message });
  }
};

const getAllKPIWeights = async (req, res) => {
  try {
    const weights = await KPIWeight.find({ isActive: true })
      .populate("departmentId", "name code")
      .populate("createdBy", "fullName email")
      .populate("updatedBy", "fullName email")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: weights,
    });
  } catch (error) {
    console.error("Get all KPI weights error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// KPI CALCULATION
// ============================================================

const calculateKPIScores = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { departmentId } = req.params;
    const { month, year } = req.body;
    const user = req.user;

    if (!month || !year) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Month and year are required",
      });
    }

    const monthStr = `${year}-${String(month).padStart(2, "0")}`;

    const department = await Department.findById(departmentId);
    if (!department) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    let kpiWeights = await KPIWeight.findOne({ departmentId });
    if (!kpiWeights) {
      kpiWeights = {
        weights: {
          taskCompletion: 20,
          qualityScore: 20,
          efficiency: 20,
          collaboration: 15,
          innovation: 15,
          attendance: 10,
        },
      };
    }

    const employees = await findUsersByDepartment(departmentId, department.name);

    if (employees.length === 0) {
      await session.abortTransaction();
      session.endSession();

      const allUsers = await User.find({ isActive: true })
        .select("fullName email department departmentId")
        .limit(10);

      return res.status(400).json({
        success: false,
        message: `No employees found in this department. Please ensure users have departmentId: "${departmentId}" or department.name: "${department.name}"`,
        debug: {
          departmentName: department.name,
          departmentId: departmentId,
          totalUsers: allUsers.length,
          sampleUsers: allUsers.map(u => ({
            name: u.fullName,
            department: u.department,
            departmentId: u.departmentId
          }))
        }
      });
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const scores = [];
    for (const employee of employees) {
      const tasks = await Task.find({
        assignedTo: employee._id,
        createdAt: { $gte: startDate, $lte: endDate },
      }).lean();

      const employeeScores = await calculateEmployeeScores(
        employee._id,
        tasks,
        kpiWeights.weights,
        departmentId,
        month,
        year,
      );

      let existingScore = await KPIScore.findOne({
        userId: employee._id,
        month: monthStr,
        year: year,
      }).session(session);

      const userIdObj = {
        _id: employee._id,
        fullName: employee.fullName,
        email: employee.email,
        employeeId: employee.employeeId,
        role: employee.role,
        avatar: employee.profilePhoto || employee.avatar || null
      };

      if (existingScore) {
        existingScore.userId = userIdObj;
        existingScore.scores = employeeScores.scores;
        existingScore.totalScore = employeeScores.totalScore;
        existingScore.performanceLevel = employeeScores.performanceLevel;
        existingScore.calculatedAt = new Date();
        existingScore.calculatedBy = user._id;
        existingScore.comments = employeeScores.comments || "";
        existingScore.departmentId = departmentId;
        await existingScore.save({ session });
        scores.push(existingScore);
      } else {
        const newScore = await KPIScore.create(
          [
            {
              userId: userIdObj,
              departmentId: departmentId,
              month: monthStr,
              year: year,
              scores: employeeScores.scores,
              totalScore: employeeScores.totalScore,
              performanceLevel: employeeScores.performanceLevel,
              calculatedAt: new Date(),
              calculatedBy: user._id,
              comments: employeeScores.comments || "",
            },
          ],
          { session },
        );
        scores.push(newScore[0]);
      }
    }

    await calculatePercentilesAndRanks(departmentId, month, year, session);

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: `KPI scores calculated successfully for ${employees.length} employees`,
      data: {
        totalEmployees: employees.length,
        scoresCreated: scores.length,
        department: department.name,
        month: `${month}/${year}`,
        employeesFound: employees.map(e => ({
          id: e._id,
          name: e.fullName,
          department: e.department
        }))
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Calculate KPI scores error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// Helper: Calculate individual employee scores
const calculateEmployeeScores = async (
  userId,
  tasks,
  weights,
  departmentId,
  month,
  year,
) => {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === "completed").length;
  const taskCompletionScore = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const submittedTasks = tasks.filter(
    (t) => t.status === "submitted" || t.status === "completed",
  );
  const approvedTasks = tasks.filter((t) => t.status === "completed");
  const qualityScore = submittedTasks.length > 0
    ? Math.round((approvedTasks.length / submittedTasks.length) * 100)
    : 0;

  const onTimeTasks = tasks.filter((t) => {
    if (t.status !== "completed") return false;
    return new Date(t.deadline) >= new Date(t.createdAt);
  });
  const efficiencyScore = totalTasks > 0 ? Math.round((onTimeTasks.length / totalTasks) * 100) : 0;

  const tasksWithComments = tasks.filter((t) => t.commentsCount > 0);
  const collaborationScore = totalTasks > 0
    ? Math.round((tasksWithComments.length / totalTasks) * 100)
    : 0;

  const innovativeTasks = tasks.filter(
    (t) => t.evidenceUrls && t.evidenceUrls.length > 0,
  );
  const innovationScore = totalTasks > 0
    ? Math.round((innovativeTasks.length / totalTasks) * 100)
    : 0;

  const attendanceScore = 100;

  const weightedScores = {
    taskCompletion: {
      score: taskCompletionScore,
      weight: weights.taskCompletion,
      weightedScore: Math.round((taskCompletionScore * weights.taskCompletion) / 100),
    },
    qualityScore: {
      score: qualityScore,
      weight: weights.qualityScore,
      weightedScore: Math.round((qualityScore * weights.qualityScore) / 100),
    },
    efficiency: {
      score: efficiencyScore,
      weight: weights.efficiency,
      weightedScore: Math.round((efficiencyScore * weights.efficiency) / 100),
    },
    collaboration: {
      score: collaborationScore,
      weight: weights.collaboration,
      weightedScore: Math.round((collaborationScore * weights.collaboration) / 100),
    },
    innovation: {
      score: innovationScore,
      weight: weights.innovation,
      weightedScore: Math.round((innovationScore * weights.innovation) / 100),
    },
    attendance: {
      score: attendanceScore,
      weight: weights.attendance,
      weightedScore: Math.round((attendanceScore * weights.attendance) / 100),
    },
  };

  const totalScore = Math.round(
    weightedScores.taskCompletion.weightedScore +
    weightedScores.qualityScore.weightedScore +
    weightedScores.efficiency.weightedScore +
    weightedScores.collaboration.weightedScore +
    weightedScores.innovation.weightedScore +
    weightedScores.attendance.weightedScore,
  );

  let performanceLevel = "average";
  if (totalScore >= 90) performanceLevel = "excellent";
  else if (totalScore >= 75) performanceLevel = "good";
  else if (totalScore >= 60) performanceLevel = "average";
  else performanceLevel = "needs_improvement";

  return {
    scores: weightedScores,
    totalScore,
    performanceLevel,
    comments: `Calculated for ${month}/${year}`,
  };
};

// Helper: Calculate percentiles and ranks
const calculatePercentilesAndRanks = async (
  departmentId,
  month,
  year,
  session,
) => {
  const allScores = await KPIScore.find({
    departmentId: departmentId,
    month: `${year}-${String(month).padStart(2, "0")}`,
    year: year,
  })
    .sort({ totalScore: -1 })
    .session(session);

  const total = allScores.length;

  for (let i = 0; i < allScores.length; i++) {
    const score = allScores[i];
    const rank = i + 1;
    const percentile = total > 0 ? Math.round(((total - i) / total) * 100) : 0;

    await KPIScore.findByIdAndUpdate(
      score._id,
      {
        rank: rank,
        percentile: percentile,
        totalEmployees: total,
      },
      { session },
    );
  }
};

// ============================================================
// KPI SCORE RETRIEVAL
// ============================================================

const getEmployeeKPIScores = async (req, res) => {
  try {
    const { userId } = req.params;
    const { month, year } = req.query;

    const query = { userId };
    if (month && year) {
      query.month = `${year}-${String(month).padStart(2, "0")}`;
      query.year = parseInt(year);
    }

    const scores = await KPIScore.find(query)
      .populate("userId", "fullName email employeeId profilePhoto avatar")
      .populate("departmentId", "name code")
      .sort({ year: -1, month: -1 });

    res.json({
      success: true,
      data: scores,
    });
  } catch (error) {
    console.error("Get employee KPI scores error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getDepartmentKPIScores = async (req, res) => {
  try {
    const { departmentId } = req.params;
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: "Month and year are required",
      });
    }

    const scores = await KPIScore.find({
      departmentId: departmentId,
      month: `${year}-${String(month).padStart(2, "0")}`,
      year: parseInt(year),
    })
      .populate("userId", "fullName email employeeId profilePhoto avatar")
      .sort({ totalScore: -1 });

    const averageScore = scores.length > 0
      ? Math.round(scores.reduce((sum, s) => sum + s.totalScore, 0) / scores.length)
      : 0;

    const distribution = {
      excellent: scores.filter((s) => s.performanceLevel === "excellent").length,
      good: scores.filter((s) => s.performanceLevel === "good").length,
      average: scores.filter((s) => s.performanceLevel === "average").length,
      needs_improvement: scores.filter((s) => s.performanceLevel === "needs_improvement").length,
    };

    res.json({
      success: true,
      data: {
        scores,
        summary: {
          totalEmployees: scores.length,
          averageScore,
          distribution,
        },
      },
    });
  } catch (error) {
    console.error("Get department KPI scores error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// GET MONTHLY KPI REPORT
// ============================================================

const getMonthlyKPIReport = async (req, res) => {
  try {
    const { month, year, departmentId } = req.query;

    console.log("📊 Fetching KPI report for:", { month, year, departmentId });

    let monthIndex, yearNum, monthStr;

    if (!month || !year) {
      const now = new Date();
      monthIndex = now.getMonth() + 1;
      yearNum = now.getFullYear();
      monthStr = `${yearNum}-${String(monthIndex).padStart(2, "0")}`;
    } else {
      monthIndex = parseInt(month);
      yearNum = parseInt(year);

      if (isNaN(monthIndex) || isNaN(yearNum) || monthIndex < 1 || monthIndex > 12) {
        return res.status(400).json({
          success: false,
          message: "Invalid month or year. Month must be 1-12 and year must be a valid number.",
        });
      }

      monthStr = `${yearNum}-${String(monthIndex).padStart(2, "0")}`;
    }

    let query = {
      month: monthStr,
      year: yearNum,
      userId: { $ne: null }
    };

    if (departmentId && departmentId !== "all" && departmentId !== "undefined" && departmentId !== "") {
      query.departmentId = departmentId;
    }

    console.log(`📊 Querying KPIScore with:`, JSON.stringify(query, null, 2));

    let kpiScores = await KPIScore.find(query)
      .populate("userId", "fullName email employeeId role profilePhoto avatar")
      .populate("departmentId", "name code")
      .sort({ totalScore: -1 })
      .lean();

    console.log(`📊 Found ${kpiScores.length} KPI scores`);

    if (kpiScores.length === 0 && departmentId && departmentId !== "all" && departmentId !== "undefined" && departmentId !== "") {
      console.log(`⚠️ No scores found with department filter, trying without filter...`);

      const allQuery = {
        month: monthStr,
        year: yearNum,
        userId: { $ne: null }
      };

      const allScores = await KPIScore.find(allQuery)
        .populate("userId", "fullName email employeeId role profilePhoto avatar")
        .populate("departmentId", "name code")
        .sort({ totalScore: -1 })
        .lean();

      console.log(`📊 Found ${allScores.length} scores without department filter`);

      if (allScores.length > 0) {
        kpiScores = allScores;
      }
    }

    const validScores = kpiScores.filter(score => score.userId !== null && score.userId !== undefined);

    const distribution = {
      excellent: 0,
      good: 0,
      average: 0,
      needs_improvement: 0,
    };

    validScores.forEach((score) => {
      if (score.performanceLevel === "excellent") distribution.excellent++;
      else if (score.performanceLevel === "good") distribution.good++;
      else if (score.performanceLevel === "average") distribution.average++;
      else if (score.performanceLevel === "needs_improvement") distribution.needs_improvement++;
    });

    const deptMap = new Map();
    validScores.forEach((score) => {
      if (!score.departmentId) return;
      if (!score.userId) return;

      const deptId = score.departmentId._id.toString();
      if (!deptMap.has(deptId)) {
        deptMap.set(deptId, {
          department: score.departmentId,
          total: 0,
          count: 0,
          topPerformer: score.userId.fullName || "Unknown",
          topScore: score.totalScore
        });
      }
      const dept = deptMap.get(deptId);
      dept.total += score.totalScore;
      dept.count++;
      if (score.totalScore > dept.topScore) {
        dept.topScore = score.totalScore;
        dept.topPerformer = score.userId?.fullName || "Unknown";
      }
    });

    const departmentAverages = Array.from(deptMap.entries()).map(([id, data]) => ({
      department: data.department,
      averageScore: Math.round(data.total / data.count),
      employeeCount: data.count,
      topPerformer: data.topPerformer || "Unknown"
    }));

    const topPerformers = validScores
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 5)
      .map((score) => ({
        name: score.userId?.fullName || "Deleted User",
        department: score.departmentId?.name || "Unknown",
        score: score.totalScore,
        level: score.performanceLevel
      }));

    res.json({
      success: true,
      data: {
        month: monthStr,
        year: yearNum,
        totalEmployees: validScores.length,
        overallAverage: validScores.length > 0
          ? Math.round(validScores.reduce((sum, s) => sum + s.totalScore, 0) / validScores.length)
          : 0,
        distribution,
        departmentAverages,
        topPerformers,
        allScores: validScores,
      },
    });
  } catch (error) {
    console.error("Get monthly KPI report error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// KPI TREND
// ============================================================

const getKPITrend = async (req, res) => {
  try {
    const { userId } = req.params;
    const { months = 6 } = req.query;

    const scores = await KPIScore.find({ userId })
      .populate("userId", "fullName email employeeId profilePhoto avatar")
      .sort({ year: -1, month: -1 })
      .limit(parseInt(months))
      .lean();

    const trend = scores
      .map((score) => ({
        month: score.month,
        totalScore: score.totalScore,
        performanceLevel: score.performanceLevel,
        components: {
          taskCompletion: score.scores.taskCompletion.score,
          qualityScore: score.scores.qualityScore.score,
          efficiency: score.scores.efficiency.score,
          collaboration: score.scores.collaboration.score,
          innovation: score.scores.innovation.score,
          attendance: score.scores.attendance.score,
        },
      }))
      .reverse();

    res.json({
      success: true,
      data: trend,
    });
  } catch (error) {
    console.error("Get KPI trend error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// GET EMPLOYEE KPI (Dashboard)
// ============================================================

const getEmployeeKPI = async (req, res) => {
  try {
    const userId = req.user._id;
    const { month, year } = req.query;

    const targetMonth = month || new Date().getMonth() + 1;
    const targetYear = year || new Date().getFullYear();

    const query = {
      userId: userId,
      month: `${targetYear}-${String(targetMonth).padStart(2, "0")}`,
      year: parseInt(targetYear),
    };

    const kpiScore = await KPIScore.findOne(query)
      .populate("userId", "fullName email employeeId role profilePhoto avatar")
      .populate("departmentId", "name code")
      .lean();

    if (!kpiScore) {
      return res.json({
        success: true,
        data: {
          hasKPI: false,
          message: "No KPI data available for this month",
          month: targetMonth,
          year: targetYear,
        },
      });
    }

    const prevMonth = targetMonth === 1 ? 12 : targetMonth - 1;
    const prevYear = targetMonth === 1 ? targetYear - 1 : targetYear;
    const prevQuery = {
      userId: userId,
      month: `${prevYear}-${String(prevMonth).padStart(2, "0")}`,
      year: prevYear,
    };
    const prevScore = await KPIScore.findOne(prevQuery).lean();

    let improvement = null;
    if (prevScore) {
      improvement = kpiScore.totalScore - prevScore.totalScore;
    }

    res.json({
      success: true,
      data: {
        hasKPI: true,
        current: kpiScore,
        previous: prevScore,
        improvement: improvement,
        month: targetMonth,
        year: targetYear,
        monthName: MONTHS[targetMonth - 1],
      },
    });
  } catch (error) {
    console.error("Get employee KPI error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// GET DEPARTMENT KPI
// ============================================================

const getDepartmentKPI = async (req, res) => {
  try {
    const { departmentId } = req.params;
    const { month, year } = req.query;

    const targetMonth = month || new Date().getMonth() + 1;
    const targetYear = year || new Date().getFullYear();

    const query = {
      departmentId: departmentId,
      month: `${targetYear}-${String(targetMonth).padStart(2, "0")}`,
      year: parseInt(targetYear),
    };

    const scores = await KPIScore.find(query)
      .populate("userId", "fullName email employeeId role profilePhoto avatar")
      .sort({ totalScore: -1 })
      .lean();

    const totalEmployees = scores.length;
    const averageScore = totalEmployees > 0
      ? Math.round(scores.reduce((sum, s) => sum + s.totalScore, 0) / totalEmployees)
      : 0;

    const distribution = {
      excellent: scores.filter(s => s.performanceLevel === "excellent").length,
      good: scores.filter(s => s.performanceLevel === "good").length,
      average: scores.filter(s => s.performanceLevel === "average").length,
      needs_improvement: scores.filter(s => s.performanceLevel === "needs_improvement").length,
    };

    const topPerformers = scores.slice(0, 5);

    res.json({
      success: true,
      data: {
        departmentId,
        month: targetMonth,
        year: targetYear,
        monthName: MONTHS[targetMonth - 1],
        summary: {
          totalEmployees,
          averageScore,
          distribution,
        },
        topPerformers,
        allScores: scores,
      },
    });
  } catch (error) {
    console.error("Get department KPI error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// GET KPI LEADERBOARD
// ============================================================

const getKPILeaderboard = async (req, res) => {
  try {
    const { departmentId } = req.params;
    const { month, year, limit = 10 } = req.query;

    const targetMonth = month || new Date().getMonth() + 1;
    const targetYear = year || new Date().getFullYear();

    let query = {
      month: `${targetYear}-${String(targetMonth).padStart(2, "0")}`,
      year: parseInt(targetYear),
    };

    if (departmentId) {
      query.departmentId = departmentId;
    }

    const scores = await KPIScore.find(query)
      .populate("userId", "fullName email employeeId role profilePhoto avatar")
      .populate("departmentId", "name code")
      .sort({ totalScore: -1 })
      .limit(parseInt(limit))
      .lean();

    let departmentName = "All Departments";
    if (departmentId) {
      const dept = await Department.findById(departmentId);
      if (dept) departmentName = dept.name;
    }

    res.json({
      success: true,
      data: {
        leaderboard: scores,
        departmentName,
        month: targetMonth,
        year: targetYear,
        monthName: MONTHS[targetMonth - 1],
        total: scores.length,
      },
    });
  } catch (error) {
    console.error("Get KPI leaderboard error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// GET KPI STATISTICS
// ============================================================

const getKPIStatistics = async (req, res) => {
  try {
    const { departmentId } = req.params;
    const { month, year } = req.query;

    const targetMonth = month || new Date().getMonth() + 1;
    const targetYear = year || new Date().getFullYear();

    let query = {
      month: `${targetYear}-${String(targetMonth).padStart(2, "0")}`,
      year: parseInt(targetYear),
    };

    if (departmentId) {
      query.departmentId = departmentId;
    }

    const scores = await KPIScore.find(query)
      .populate("userId", "fullName email role profilePhoto avatar")
      .populate("departmentId", "name code")
      .lean();

    const totalEmployees = scores.length;
    const averageScore = totalEmployees > 0
      ? Math.round(scores.reduce((sum, s) => sum + s.totalScore, 0) / totalEmployees)
      : 0;

    const distribution = {
      excellent: 0,
      good: 0,
      average: 0,
      needs_improvement: 0,
    };

    const categoryBreakdown = {};

    scores.forEach(score => {
      if (score.performanceLevel === "excellent") distribution.excellent++;
      else if (score.performanceLevel === "good") distribution.good++;
      else if (score.performanceLevel === "average") distribution.average++;
      else distribution.needs_improvement++;

      if (score.scores) {
        const categories = ['taskCompletion', 'qualityScore', 'efficiency', 'collaboration', 'innovation', 'attendance'];
        categories.forEach(cat => {
          if (score.scores[cat]) {
            if (!categoryBreakdown[cat]) {
              categoryBreakdown[cat] = {
                total: 0,
                count: 0,
              };
            }
            categoryBreakdown[cat].total += score.scores[cat].score || 0;
            categoryBreakdown[cat].count++;
          }
        });
      }
    });

    Object.keys(categoryBreakdown).forEach(cat => {
      const data = categoryBreakdown[cat];
      categoryBreakdown[cat].average = data.count > 0
        ? Math.round(data.total / data.count)
        : 0;
    });

    const topPerformers = scores
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 5);

    res.json({
      success: true,
      data: {
        summary: {
          totalEmployees,
          averageScore,
          distribution,
        },
        categoryBreakdown,
        topPerformers,
        month: targetMonth,
        year: targetYear,
        monthName: MONTHS[targetMonth - 1],
      },
    });
  } catch (error) {
    console.error("Get KPI statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// CLEANUP ORPHANED KPI RECORDS
// ============================================================

const cleanupOrphanedKPIScores = async () => {
  try {
    console.log("🧹 Cleaning up orphaned KPI scores...");

    const allScores = await KPIScore.find({});
    let deletedCount = 0;

    for (const score of allScores) {
      const userExists = await User.findById(score.userId);

      if (!userExists) {
        console.log(`🗑️ Deleting orphaned KPI score: ${score._id} (userId: ${score.userId})`);
        await KPIScore.deleteOne({ _id: score._id });
        deletedCount++;
      }
    }

    console.log(`✅ Cleanup complete. Deleted ${deletedCount} orphaned KPI scores.`);
    return deletedCount;
  } catch (error) {
    console.error("Error cleaning up orphaned KPI scores:", error);
    throw error;
  }
};


// ============================================================
// GET KPI FEEDBACK (accepts real or synthetic ID, tolerant of missing KPI)
// ============================================================
const getKPIFeedback = async (req, res) => {
  try {
    const { kpiId } = req.params;
    const user = req.user;

    console.log(`📋 Getting feedback for KPI: ${kpiId}`);

    // Resolve the KPI. If it doesn't exist yet, return a friendly empty state.
    const kpi = await resolveKPIScore(kpiId);

    if (!kpi) {
      console.log(`ℹ️ No KPI record yet for: ${kpiId}`);
      return res.json({
        success: true,
        data: {
          feedback: [],
          canEdit: true,
          isLocked: false,
          lockMessage: "",
          existingFeedback: null,
          totalFeedback: 0,
          hasFeedback: false,
          hasKPI: false,
        },
      });
    }

    // Get all feedback (including deleted ones for admin)
    let query = { kpiId: kpi._id, isDeleted: false };
    const isAdmin = ["super_admin", "admin"].includes(user.role);
    if (isAdmin) {
      query = { kpiId: kpi._id };
    }

    const feedback = await KPIFeedback.find(query)
      .populate("userId", "fullName email role profilePhoto avatar")
      .populate("createdBy", "fullName email role profilePhoto avatar")
      .populate("editedBy", "fullName email")
      .populate("deletedBy", "fullName email")
      .sort({ createdAt: -1 });

    // Check if KPI is locked
    const targetUserId = kpi.userId?._id || kpi.userId;
    const lockStatus = await KPILockStatus.findOne({
      userId: targetUserId,
      month: kpi.month,
      year: kpi.year,
    });

    const isLocked = lockStatus ? lockStatus.isLocked : false;
    const lockMessage =
      lockStatus?.lockReason || "KPI is locked. Feedback is read-only.";

    // Check if user can edit
    const canEdit =
      !isLocked &&
      (user.role === "super_admin" ||
        user.role === "admin" ||
        user.role === "hr_manager" ||
        user.role === "dept_manager" ||
        user.role === "project_manager");

    // Check if user has existing feedback
    const existingFeedback = feedback.find(
      (f) => f.createdBy?._id?.toString() === user._id.toString()
    );

    console.log(`✅ Found ${feedback.length} feedback records`);

    res.json({
      success: true,
      data: {
        feedback,
        canEdit,
        isLocked,
        lockMessage,
        existingFeedback: existingFeedback || null,
        totalFeedback: feedback.length,
        hasFeedback: feedback.length > 0,
        hasKPI: true,
        kpiId: kpi._id,
      },
    });
  } catch (error) {
    console.error("Get KPI feedback error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// ADD KPI FEEDBACK (auto-creates KPI for synthetic IDs)
// ============================================================
const addKPIFeedback = async (req, res) => {
  try {
    const { kpiId } = req.params;
    const { comment, rating } = req.body;
    const user = req.user;

    // Validate input
    if (!comment || comment.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Comment is required",
      });
    }

    if (comment.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Comment cannot exceed 2000 characters",
      });
    }

    // ✅ Resolve KPI — auto-create if this is the first feedback for a fresh "calculated_*" ID
    const kpi = await resolveKPIScore(kpiId, { autoCreate: true });
    if (!kpi) {
      return res.status(404).json({
        success: false,
        message: "KPI record not found for the given identifier",
      });
    }

    // Check if user has permission to add feedback
    const allowedRoles = [
      "super_admin",
      "admin",
      "hr_manager",
      "dept_manager",
      "project_manager",
    ];
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to add feedback",
      });
    }

    // Check if KPI is locked
    const targetUserId = kpi.userId?._id || kpi.userId;
    const lockStatus = await KPILockStatus.findOne({
      userId: targetUserId,
      month: kpi.month,
      year: kpi.year,
    });

    if (lockStatus && lockStatus.isLocked) {
      return res.status(403).json({
        success: false,
        message:
          lockStatus.lockReason || "KPI is locked. Cannot add feedback.",
        isLocked: true,
      });
    }

    // Check if user already gave feedback for this KPI
    const existingFeedback = await KPIFeedback.findOne({
      kpiId: kpi._id,
      createdBy: user._id,
      isDeleted: false,
    });

    if (existingFeedback) {
      return res.status(400).json({
        success: false,
        message: "You have already provided feedback for this KPI",
        existingFeedback,
      });
    }

    // Create feedback
    const feedback = await KPIFeedback.create({
      kpiId: kpi._id,
      userId: targetUserId,
      comment: comment.trim(),
      rating: rating && rating >= 1 && rating <= 5 ? rating : undefined,
      createdBy: user._id,
    });

    // Populate the response
    const populatedFeedback = await KPIFeedback.findById(feedback._id)
      .populate("userId", "fullName email role profilePhoto avatar")
      .populate("createdBy", "fullName email role profilePhoto avatar");

    res.status(201).json({
      success: true,
      message: "Feedback added successfully",
      data: populatedFeedback,
    });
  } catch (error) {
    console.error("Add KPI feedback error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// UPDATE KPI FEEDBACK
// ============================================================
const updateKPIFeedback = async (req, res) => {
  try {
    const { kpiId, feedbackId } = req.params;
    const { comment, rating } = req.body;
    const user = req.user;

    console.log(
      `✏️ Updating feedback: kpiId=${kpiId}, feedbackId=${feedbackId}`
    );

    // Validate input
    if (!comment || comment.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Comment is required",
      });
    }

    if (comment.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Comment cannot exceed 2000 characters",
      });
    }

    // Try to find feedback by ID only first (more flexible)
    let feedback = await KPIFeedback.findOne({
      _id: feedbackId,
      isDeleted: false,
    });

    // If not found, try with kpiId as well — but only if kpiId is a real ObjectId
    if (!feedback && mongoose.Types.ObjectId.isValid(kpiId) && kpiId.length === 24) {
      feedback = await KPIFeedback.findOne({
        _id: feedbackId,
        kpiId: kpiId,
        isDeleted: false,
      });
    }

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: "Feedback not found",
      });
    }

    // Check if user can edit this feedback
    const isOwner = feedback.createdBy.toString() === user._id.toString();
    const isAdmin = ["super_admin", "admin"].includes(user.role);
    const isManager = [
      "hr_manager",
      "dept_manager",
      "project_manager",
    ].includes(user.role);

    if (!isOwner && !isAdmin && !isManager) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to edit this feedback",
      });
    }

    // ✅ Resolve the KPI for the lock check
    const kpi = await resolveKPIScore(kpiId);
    if (kpi) {
      const targetUserId = kpi.userId?._id || kpi.userId;
      const lockStatus = await KPILockStatus.findOne({
        userId: targetUserId,
        month: kpi.month,
        year: kpi.year,
      });

      if (lockStatus && lockStatus.isLocked) {
        return res.status(403).json({
          success: false,
          message:
            lockStatus.lockReason || "KPI is locked. Cannot edit feedback.",
          isLocked: true,
        });
      }
    }

    // Update feedback
    feedback.comment = comment.trim();
    if (rating && rating >= 1 && rating <= 5) {
      feedback.rating = rating;
    }
    feedback.isEdited = true;
    feedback.editedAt = new Date();
    feedback.editedBy = user._id;
    await feedback.save();

    console.log(`✅ Feedback updated: ${feedbackId}`);

    // Populate the response
    const populatedFeedback = await KPIFeedback.findById(feedback._id)
      .populate("userId", "fullName email role profilePhoto avatar")
      .populate("createdBy", "fullName email role profilePhoto avatar")
      .populate("editedBy", "fullName email");

    res.json({
      success: true,
      message: "Feedback updated successfully",
      data: populatedFeedback,
    });
  } catch (error) {
    console.error("Update KPI feedback error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

const checkKPILockStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: "Month and year are required",
      });
    }

    const monthStr = `${year}-${String(month).padStart(2, "0")}`;

    // 👇 Use $or to match both schema shapes
    const kpi = await KPIScore.findOne({
      $or: [{ "userId._id": userId }, { userId: userId }],
      month: monthStr,
      year: parseInt(year),
    });

    // No KPI → not locked
    if (!kpi) {
      return res.json({
        success: true,
        data: {
          locked: false,
          hasKPI: false,
          message: "No KPI data found for this month",
        },
      });
    }

    const lockStatus = await KPILockStatus.findOne({
      userId: userId,
      month: monthStr,
      year: parseInt(year),
    });

    const isLocked = lockStatus ? lockStatus.isLocked : false;
    const lockMessage =
      lockStatus?.lockReason || "KPI is locked. Feedback is read-only.";

    res.json({
      success: true,
      data: {
        locked: isLocked,
        hasKPI: true,
        lockMessage,
        lockStatus: lockStatus || null,
        kpiId: kpi._id,
      },
    });
  } catch (error) {
    console.error("Check KPI lock status error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// Lock KPI for a user/month (Admin only)
const lockKPI = async (req, res) => {
  try {
    const { userId } = req.params;
    const { month, year, reason } = req.body;
    const user = req.user;

    // Check if user is admin
    if (!["super_admin", "admin"].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: "Only admins can lock KPI",
      });
    }

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: "Month and year are required",
      });
    }

    const monthStr = `${year}-${String(month).padStart(2, "0")}`;

    // Check if KPI exists
    const kpi = await KPIScore.findOne({
      userId,
      month: monthStr,
      year: parseInt(year),
    });

    if (!kpi) {
      return res.status(404).json({
        success: false,
        message: "KPI record not found for this user and month",
      });
    }

    // Update or create lock status
    let lockStatus = await KPILockStatus.findOne({
      userId,
      month: monthStr,
      year: parseInt(year),
    });

    if (lockStatus) {
      lockStatus.isLocked = true;
      lockStatus.lockedAt = new Date();
      lockStatus.lockedBy = user._id;
      lockStatus.lockReason = reason || "KPI locked by admin";
      await lockStatus.save();
    } else {
      lockStatus = await KPILockStatus.create({
        userId,
        month: monthStr,
        year: parseInt(year),
        isLocked: true,
        lockedAt: new Date(),
        lockedBy: user._id,
        lockReason: reason || "KPI locked by admin",
      });
    }

    res.json({
      success: true,
      message: "KPI locked successfully",
      data: lockStatus,
    });
  } catch (error) {
    console.error("Lock KPI error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};



// ============================================================
// DELETE KPI FEEDBACK (soft delete)
// ============================================================
const deleteKPIFeedback = async (req, res) => {
  try {
    const { kpiId, feedbackId } = req.params;
    const user = req.user;

    console.log(`🗑️ DELETE request received:`);
    console.log(`  - kpiId: ${kpiId}`);
    console.log(`  - feedbackId: ${feedbackId}`);
    console.log(`  - user: ${user._id} (${user.role})`);

    // Find feedback by ID only
    let feedback = await KPIFeedback.findOne({
      _id: feedbackId,
      isDeleted: false,
    });

    // Fallback: also match kpiId if it's a real ObjectId
    if (!feedback && mongoose.Types.ObjectId.isValid(kpiId) && kpiId.length === 24) {
      feedback = await KPIFeedback.findOne({
        _id: feedbackId,
        kpiId: kpiId,
        isDeleted: false,
      });
    }

    // Fallback: allow finding even if soft-deleted (for idempotent delete)
    if (!feedback) {
      feedback = await KPIFeedback.findOne({ _id: feedbackId });
    }

    if (!feedback) {
      console.log(`❌ Feedback not found: ${feedbackId}`);
      return res.status(404).json({
        success: false,
        message: "Feedback not found",
      });
    }

    console.log(`✅ Found feedback:`, {
      _id: feedback._id,
      kpiId: feedback.kpiId,
      createdBy: feedback.createdBy,
      isDeleted: feedback.isDeleted,
    });

    // Check if user can delete this feedback
    const isOwner = feedback.createdBy.toString() === user._id.toString();
    const isAdmin = ["super_admin", "admin"].includes(user.role);
    const isManager = [
      "hr_manager",
      "dept_manager",
      "project_manager",
    ].includes(user.role);

    if (!isOwner && !isAdmin && !isManager) {
      console.log(
        `❌ Permission denied for user ${user._id} to delete feedback ${feedbackId}`
      );
      return res.status(403).json({
        success: false,
        message: "You don't have permission to delete this feedback",
      });
    }

    // ✅ Resolve the KPI for the lock check
    const resolvedKpiId = feedback.kpiId?.toString() || kpiId;
    const kpi = await resolveKPIScore(resolvedKpiId);
    if (kpi) {
      const targetUserId = kpi.userId?._id || kpi.userId;
      const lockStatus = await KPILockStatus.findOne({
        userId: targetUserId,
        month: kpi.month,
        year: kpi.year,
      });

      if (lockStatus && lockStatus.isLocked) {
        return res.status(403).json({
          success: false,
          message:
            lockStatus.lockReason || "KPI is locked. Cannot delete feedback.",
          isLocked: true,
        });
      }
    }

    // Soft delete
    feedback.isDeleted = true;
    feedback.deletedAt = new Date();
    feedback.deletedBy = user._id;
    await feedback.save();

    console.log(`✅ Feedback deleted successfully: ${feedbackId}`);

    res.json({
      success: true,
      message: "Feedback deleted successfully",
      data: {
        _id: feedback._id,
        isDeleted: true,
        deletedAt: feedback.deletedAt,
      },
    });
  } catch (error) {
    console.error("Delete KPI feedback error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};
// Unlock KPI for a user/month (Admin only)
const unlockKPI = async (req, res) => {
  try {
    const { userId } = req.params;
    const { month, year } = req.body;
    const user = req.user;

    // Check if user is admin
    if (!["super_admin", "admin"].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: "Only admins can unlock KPI",
      });
    }

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: "Month and year are required",
      });
    }

    const monthStr = `${year}-${String(month).padStart(2, "0")}`;

    // Find and update lock status
    const lockStatus = await KPILockStatus.findOne({
      userId,
      month: monthStr,
      year: parseInt(year),
    });

    if (!lockStatus) {
      return res.status(404).json({
        success: false,
        message: "Lock status not found for this user and month",
      });
    }

    lockStatus.isLocked = false;
    lockStatus.unlockedAt = new Date();
    lockStatus.unlockedBy = user._id;
    await lockStatus.save();

    res.json({
      success: true,
      message: "KPI unlocked successfully",
      data: lockStatus,
    });
  } catch (error) {
    console.error("Unlock KPI error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};
// ============================================================
// EXPORT ALL
// ============================================================
module.exports = {
  getKPIWeights,
  upsertKPIWeights,
  getAllKPIWeights,
  calculateKPIScores,
  getEmployeeKPIScores,
  getDepartmentKPIScores,
  getMonthlyKPIReport,
  getKPITrend,
  getEmployeeKPI,
  getDepartmentKPI,
  getKPILeaderboard,
  getKPIStatistics,
  cleanupOrphanedKPIScores,
  getKPIFeedback,
  addKPIFeedback,
  updateKPIFeedback,
  deleteKPIFeedback,
  checkKPILockStatus,
  lockKPI,
  unlockKPI
};