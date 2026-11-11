const { Task } = require("../models/Task.model");
const { User } = require("../models/User.model");
const { Project } = require("../models/Project.model");
const mongoose = require("mongoose");

// Helper function to get date range
const getDateRange = (range) => {
  const now = new Date();
  let startDate = new Date();

  switch (range) {
    case "week":
      startDate.setDate(now.getDate() - 7);
      break;
    case "month":
      startDate.setMonth(now.getMonth() - 1);
      break;
    case "quarter":
      startDate.setMonth(now.getMonth() - 3);
      break;
    case "year":
      startDate.setFullYear(now.getFullYear() - 1);
      break;
    default:
      startDate.setMonth(now.getMonth() - 1);
  }

  return startDate;
};

// Helper function to calculate report stats
const calculateReportStats = (tasks) => {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const pending = tasks.filter((t) => t.status === "pending").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const submitted = tasks.filter((t) => t.status === "submitted").length;
  const overdue = tasks.filter((t) => t.status === "overdue").length;
  const rejected = tasks.filter((t) => t.status === "rejected").length;

  const completionRate = total > 0 ? (completed / total) * 100 : 0;

  // Calculate on-time rate
  const completedTasks = tasks.filter((t) => t.status === "completed");
  const onTimeTasks = completedTasks.filter(
    (t) => new Date(t.deadline) >= new Date(t.updatedAt),
  );
  const onTimeRate =
    completedTasks.length > 0
      ? (onTimeTasks.length / completedTasks.length) * 100
      : 0;

  // Calculate average completion time (in days)
  let averageCompletionTime = 0;
  if (completedTasks.length > 0) {
    const totalTime = completedTasks.reduce((sum, t) => {
      const created = new Date(t.createdAt);
      const completed = new Date(t.updatedAt);
      const diffHours = (completed - created) / (1000 * 60 * 60);
      return sum + diffHours;
    }, 0);
    averageCompletionTime = totalTime / completedTasks.length / 24;
  }

  // Tasks by priority
  const tasksByPriority = {
    low: tasks.filter((t) => t.priority === "low").length,
    normal: tasks.filter((t) => t.priority === "normal").length,
    high: tasks.filter((t) => t.priority === "high").length,
    urgent: tasks.filter((t) => t.priority === "urgent").length,
  };

  // Tasks by status
  const tasksByStatus = {
    pending,
    in_progress: inProgress,
    submitted,
    completed,
    overdue,
    rejected,
  };

  return {
    total,
    completed,
    pending,
    inProgress,
    submitted,
    overdue,
    rejected,
    completionRate: Math.round(completionRate * 10) / 10,
    onTimeRate: Math.round(onTimeRate * 10) / 10,
    averageCompletionTime: Math.round(averageCompletionTime * 10) / 10,
    tasksByPriority,
    tasksByStatus,
  };
};

// Get task reports (Admin/Super Admin/HR Manager)
const getTaskReports = async (req, res) => {
  try {
    const { range = "month" } = req.query;
    const startDate = getDateRange(range);
    const userId = req.user._id;

    // Check if user has admin access
    const isAdmin = ["super_admin", "admin", "hr_manager"].includes(
      req.user.role,
    );
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin privileges required.",
      });
    }

    // Get all tasks within date range with populated fields
    const tasks = await Task.find({
      createdAt: { $gte: startDate },
    })
      .populate("assignedTo", "fullName email")
      .populate("assignedBy", "fullName")
      .populate("projectId", "name code")
      .populate("departmentId", "name code");

    const stats = calculateReportStats(tasks);

    // Tasks by project
    const projectMap = new Map();
    for (const task of tasks) {
      const projectId = task.projectId?._id?.toString() || "unassigned";
      const projectName = task.projectId?.name || "Unassigned";

      if (!projectMap.has(projectId)) {
        projectMap.set(projectId, {
          projectId,
          projectName,
          total: 0,
          completed: 0,
        });
      }
      const proj = projectMap.get(projectId);
      proj.total++;
      if (task.status === "completed") proj.completed++;
    }

    const tasksByProject = Array.from(projectMap.values()).map((p) => ({
      ...p,
      completionRate:
        p.total > 0 ? Math.round((p.completed / p.total) * 100 * 10) / 10 : 0,
    }));

    // Tasks by assignee
    const assigneeMap = new Map();
    for (const task of tasks) {
      const assigneeId = task.assignedTo?._id?.toString() || "unassigned";
      const assigneeName = task.assignedTo?.fullName || "Unassigned";

      if (!assigneeMap.has(assigneeId)) {
        assigneeMap.set(assigneeId, {
          userId: assigneeId,
          fullName: assigneeName,
          total: 0,
          completed: 0,
        });
      }
      const assignee = assigneeMap.get(assigneeId);
      assignee.total++;
      if (task.status === "completed") assignee.completed++;
    }

    const tasksByAssignee = Array.from(assigneeMap.values()).map((a) => ({
      ...a,
      completionRate:
        a.total > 0 ? Math.round((a.completed / a.total) * 100 * 10) / 10 : 0,
    }));

    // Tasks by department
    const deptMap = new Map();
    for (const task of tasks) {
      const deptId = task.departmentId?._id?.toString() || "unassigned";
      const deptName = task.departmentId?.name || "Unassigned";

      if (!deptMap.has(deptId)) {
        deptMap.set(deptId, {
          departmentId: deptId,
          departmentName: deptName,
          total: 0,
          completed: 0,
        });
      }
      const dept = deptMap.get(deptId);
      dept.total++;
      if (task.status === "completed") dept.completed++;
    }

    const tasksByDepartment = Array.from(deptMap.values()).map((d) => ({
      ...d,
      completionRate:
        d.total > 0 ? Math.round((d.completed / d.total) * 100 * 10) / 10 : 0,
    }));

    // Daily trend
    const dailyMap = new Map();
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (let i = 0; i < 14; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split("T")[0];
      const dayName = dayNames[date.getDay()];
      dailyMap.set(dateKey, {
        date: dayName,
        created: 0,
        completed: 0,
      });
    }

    for (const task of tasks) {
      const dateKey = task.createdAt.toISOString().split("T")[0];
      if (dailyMap.has(dateKey)) {
        const data = dailyMap.get(dateKey);
        data.created++;
        if (task.status === "completed") data.completed++;
        dailyMap.set(dateKey, data);
      }
    }

    const dailyTrend = Array.from(dailyMap.values()).reverse();

    // Monthly stats
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const monthMap = new Map();

    for (let i = 0; i < 6; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthKey = date.getFullYear() + "-" + date.getMonth();
      monthMap.set(monthKey, {
        month: monthNames[date.getMonth()],
        created: 0,
        completed: 0,
        totalHours: 0,
        tasks: [],
      });
    }

    for (const task of tasks) {
      const monthKey =
        task.createdAt.getFullYear() + "-" + task.createdAt.getMonth();
      if (monthMap.has(monthKey)) {
        const data = monthMap.get(monthKey);
        data.created++;
        data.tasks.push(task);
        if (task.status === "completed") data.completed++;
        data.totalHours += task.estimatedHours || 0;
        monthMap.set(monthKey, data);
      }
    }

    const monthlyStats = Array.from(monthMap.values())
      .reverse()
      .map((data) => ({
        month: data.month,
        created: data.created,
        completed: data.completed,
        avgCompletionTime:
          data.tasks.length > 0
            ? Math.round((data.totalHours / data.tasks.length / 24) * 10) / 10
            : 0,
      }));

    res.json({
      success: true,
      data: {
        ...stats,
        tasksByProject,
        tasksByAssignee,
        tasksByDepartment,
        dailyTrend,
        monthlyStats,
      },
    });
  } catch (error) {
    console.error("Error generating task report:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to generate report",
    });
  }
};

// Get personal task report (Employee)
const getPersonalTaskReport = async (req, res) => {
  try {
    const { range = "month" } = req.query;
    const startDate = getDateRange(range);
    const userId = req.user._id;

    // Get tasks assigned to the user
    const tasks = await Task.find({
      assignedTo: userId,
      createdAt: { $gte: startDate },
    })
      .populate("assignedBy", "fullName")
      .populate("projectId", "name code")
      .populate("departmentId", "name code");

    const stats = calculateReportStats(tasks);

    // Get user info
    const user = await User.findById(userId).select("fullName email role");

    // Tasks by priority
    const tasksByPriority = {
      low: tasks.filter((t) => t.priority === "low").length,
      normal: tasks.filter((t) => t.priority === "normal").length,
      high: tasks.filter((t) => t.priority === "high").length,
      urgent: tasks.filter((t) => t.priority === "urgent").length,
    };

    // Tasks by status
    const tasksByStatus = {
      pending: tasks.filter((t) => t.status === "pending").length,
      in_progress: tasks.filter((t) => t.status === "in_progress").length,
      submitted: tasks.filter((t) => t.status === "submitted").length,
      completed: tasks.filter((t) => t.status === "completed").length,
      overdue: tasks.filter((t) => t.status === "overdue").length,
      rejected: tasks.filter((t) => t.status === "rejected").length,
    };

    // Daily trend
    const dailyMap = new Map();
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (let i = 0; i < 14; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split("T")[0];
      const dayName = dayNames[date.getDay()];
      dailyMap.set(dateKey, {
        date: dayName,
        created: 0,
        completed: 0,
      });
    }

    for (const task of tasks) {
      const dateKey = task.createdAt.toISOString().split("T")[0];
      if (dailyMap.has(dateKey)) {
        const data = dailyMap.get(dateKey);
        data.created++;
        if (task.status === "completed") data.completed++;
        dailyMap.set(dateKey, data);
      }
    }

    const dailyTrend = Array.from(dailyMap.values()).reverse();

    res.json({
      success: true,
      data: {
        ...stats,
        userStats: {
          total: stats.total,
          completed: stats.completed,
          pending: stats.pending,
          inProgress: stats.inProgress,
          completionRate: stats.completionRate,
          onTimeRate: stats.onTimeRate,
        },
        tasksByPriority,
        tasksByStatus,
        dailyTrend,
        user: {
          fullName: user?.fullName || req.user.fullName,
          email: user?.email || req.user.email,
          role: user?.role || req.user.role,
        },
      },
    });
  } catch (error) {
    console.error("Error generating personal task report:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to generate personal report",
    });
  }
};

// Get department task report (Department Manager)
const getDepartmentTaskReport = async (req, res) => {
  try {
    const { range = "month" } = req.query;
    const startDate = getDateRange(range);
    const userId = req.user._id;

    // Get user's department from the User model
    const user = await User.findById(userId).populate("departmentId");
    if (!user || !user.departmentId) {
      return res.status(404).json({
        success: false,
        message: "Department not found for this user",
      });
    }

    const departmentId = user.departmentId._id;

    // Get all users in the department
    const departmentUsers = await User.find({
      departmentId: departmentId,
    }).select("_id");
    const userIds = departmentUsers.map((u) => u._id);

    // Get tasks assigned to department members
    const tasks = await Task.find({
      assignedTo: { $in: userIds },
      createdAt: { $gte: startDate },
    })
      .populate("assignedTo", "fullName email")
      .populate("assignedBy", "fullName")
      .populate("projectId", "name code")
      .populate("departmentId", "name code");

    const stats = calculateReportStats(tasks);

    // Tasks by assignee within department
    const assigneeMap = new Map();
    for (const task of tasks) {
      const assigneeId = task.assignedTo?._id?.toString();
      if (!assigneeId) continue;

      if (!assigneeMap.has(assigneeId)) {
        assigneeMap.set(assigneeId, {
          userId: assigneeId,
          fullName: task.assignedTo?.fullName || "Unknown",
          total: 0,
          completed: 0,
        });
      }
      const assignee = assigneeMap.get(assigneeId);
      assignee.total++;
      if (task.status === "completed") assignee.completed++;
    }

    const tasksByAssignee = Array.from(assigneeMap.values()).map((a) => ({
      ...a,
      completionRate:
        a.total > 0 ? Math.round((a.completed / a.total) * 100 * 10) / 10 : 0,
    }));

    // Tasks by priority
    const tasksByPriority = {
      low: tasks.filter((t) => t.priority === "low").length,
      normal: tasks.filter((t) => t.priority === "normal").length,
      high: tasks.filter((t) => t.priority === "high").length,
      urgent: tasks.filter((t) => t.priority === "urgent").length,
    };

    // Tasks by status
    const tasksByStatus = {
      pending: tasks.filter((t) => t.status === "pending").length,
      in_progress: tasks.filter((t) => t.status === "in_progress").length,
      submitted: tasks.filter((t) => t.status === "submitted").length,
      completed: tasks.filter((t) => t.status === "completed").length,
      overdue: tasks.filter((t) => t.status === "overdue").length,
      rejected: tasks.filter((t) => t.status === "rejected").length,
    };

    // Daily trend
    const dailyMap = new Map();
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (let i = 0; i < 14; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split("T")[0];
      const dayName = dayNames[date.getDay()];
      dailyMap.set(dateKey, {
        date: dayName,
        created: 0,
        completed: 0,
      });
    }

    for (const task of tasks) {
      const dateKey = task.createdAt.toISOString().split("T")[0];
      if (dailyMap.has(dateKey)) {
        const data = dailyMap.get(dateKey);
        data.created++;
        if (task.status === "completed") data.completed++;
        dailyMap.set(dateKey, data);
      }
    }

    const dailyTrend = Array.from(dailyMap.values()).reverse();

    res.json({
      success: true,
      data: {
        ...stats,
        tasksByPriority,
        tasksByStatus,
        department: {
          id: departmentId,
          name: user.departmentId.name,
          code: user.departmentId.code,
        },
        tasksByAssignee,
        dailyTrend,
      },
    });
  } catch (error) {
    console.error("Error generating department task report:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to generate department report",
    });
  }
};

// Get project task report (Project Manager)
const getProjectTaskReport = async (req, res) => {
  try {
    const { range = "month" } = req.query;
    const startDate = getDateRange(range);
    const userId = req.user._id;

    // Get projects managed by the user
    const userProjects = await Project.find({ managerId: userId }).select(
      "_id name code",
    );

    if (userProjects.length === 0) {
      return res.json({
        success: true,
        data: {
          total: 0,
          completed: 0,
          pending: 0,
          inProgress: 0,
          submitted: 0,
          overdue: 0,
          rejected: 0,
          completionRate: 0,
          onTimeRate: 0,
          averageCompletionTime: 0,
          tasksByPriority: { low: 0, normal: 0, high: 0, urgent: 0 },
          tasksByStatus: {
            pending: 0,
            in_progress: 0,
            submitted: 0,
            completed: 0,
            overdue: 0,
            rejected: 0,
          },
          tasksByProject: [],
          tasksByAssignee: [],
          dailyTrend: [],
          monthlyStats: [],
          projects: [],
        },
      });
    }

    const projectIds = userProjects.map((p) => p._id);

    // Get tasks from these projects
    const tasks = await Task.find({
      projectId: { $in: projectIds },
      createdAt: { $gte: startDate },
    })
      .populate("assignedTo", "fullName email")
      .populate("assignedBy", "fullName")
      .populate("projectId", "name code")
      .populate("departmentId", "name code");

    const stats = calculateReportStats(tasks);

    // Tasks by project
    const projectMap = new Map();
    for (const task of tasks) {
      const projectId = task.projectId?._id?.toString();
      if (!projectId) continue;

      if (!projectMap.has(projectId)) {
        projectMap.set(projectId, {
          projectId,
          projectName: task.projectId?.name || "Unknown",
          total: 0,
          completed: 0,
        });
      }
      const proj = projectMap.get(projectId);
      proj.total++;
      if (task.status === "completed") proj.completed++;
    }

    const tasksByProject = Array.from(projectMap.values()).map((p) => ({
      ...p,
      completionRate:
        p.total > 0 ? Math.round((p.completed / p.total) * 100 * 10) / 10 : 0,
    }));

    // Tasks by assignee
    const assigneeMap = new Map();
    for (const task of tasks) {
      const assigneeId = task.assignedTo?._id?.toString();
      if (!assigneeId) continue;

      if (!assigneeMap.has(assigneeId)) {
        assigneeMap.set(assigneeId, {
          userId: assigneeId,
          fullName: task.assignedTo?.fullName || "Unknown",
          total: 0,
          completed: 0,
        });
      }
      const assignee = assigneeMap.get(assigneeId);
      assignee.total++;
      if (task.status === "completed") assignee.completed++;
    }

    const tasksByAssignee = Array.from(assigneeMap.values()).map((a) => ({
      ...a,
      completionRate:
        a.total > 0 ? Math.round((a.completed / a.total) * 100 * 10) / 10 : 0,
    }));

    // Daily trend
    const dailyMap = new Map();
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (let i = 0; i < 14; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split("T")[0];
      const dayName = dayNames[date.getDay()];
      dailyMap.set(dateKey, {
        date: dayName,
        created: 0,
        completed: 0,
      });
    }

    for (const task of tasks) {
      const dateKey = task.createdAt.toISOString().split("T")[0];
      if (dailyMap.has(dateKey)) {
        const data = dailyMap.get(dateKey);
        data.created++;
        if (task.status === "completed") data.completed++;
        dailyMap.set(dateKey, data);
      }
    }

    const dailyTrend = Array.from(dailyMap.values()).reverse();

    // Monthly stats
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const monthMap = new Map();

    for (let i = 0; i < 6; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthKey = date.getFullYear() + "-" + date.getMonth();
      monthMap.set(monthKey, {
        month: monthNames[date.getMonth()],
        created: 0,
        completed: 0,
        totalHours: 0,
        tasks: [],
      });
    }

    for (const task of tasks) {
      const monthKey =
        task.createdAt.getFullYear() + "-" + task.createdAt.getMonth();
      if (monthMap.has(monthKey)) {
        const data = monthMap.get(monthKey);
        data.created++;
        data.tasks.push(task);
        if (task.status === "completed") data.completed++;
        data.totalHours += task.estimatedHours || 0;
        monthMap.set(monthKey, data);
      }
    }

    const monthlyStats = Array.from(monthMap.values())
      .reverse()
      .map((data) => ({
        month: data.month,
        created: data.created,
        completed: data.completed,
        avgCompletionTime:
          data.tasks.length > 0
            ? Math.round((data.totalHours / data.tasks.length / 24) * 10) / 10
            : 0,
      }));

    res.json({
      success: true,
      data: {
        ...stats,
        projects: userProjects.map((p) => ({
          id: p._id,
          name: p.name,
          code: p.code,
        })),
        tasksByProject,
        tasksByAssignee,
        dailyTrend,
        monthlyStats,
      },
    });
  } catch (error) {
    console.error("Error generating project task report:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to generate project report",
    });
  }
};

// Export task report
// controllers/report.controller.js

// Export task report - FIXED
const exportTaskReport = async (req, res) => {
  try {
    const { range = "month", format = "csv", fields } = req.query;
    const startDate = getDateRange(range);
    const userId = req.user._id;

    let tasks = [];
    let isAdmin = ["super_admin", "admin", "hr_manager"].includes(
      req.user.role,
    );

    if (isAdmin) {
      tasks = await Task.find({
        createdAt: { $gte: startDate },
      })
        .populate("assignedTo", "fullName email")
        .populate("assignedBy", "fullName")
        .populate("projectId", "name code")
        .populate("departmentId", "name code")
        .lean();
    } else {
      // For non-admins, get only their tasks
      tasks = await Task.find({
        assignedTo: userId,
        createdAt: { $gte: startDate },
      })
        .populate("projectId", "name code")
        .lean();
    }

    // Handle different formats
    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=tasks_report_${new Date().toISOString().split("T")[0]}.json`,
      );
      return res.json(tasks);
    }

    if (format === "excel") {
      // For Excel, we'll send CSV but with .xlsx extension (client will handle)
      // Or you can use a library like exceljs
    }

    // Generate CSV (default)
    const headers = [
      "Title",
      "Description",
      "Priority",
      "Status",
      "Assigned To",
      "Assigned By",
      "Project",
      "Department",
      "Deadline",
      "Estimated Hours",
      "Actual Minutes",
      "Created At",
      "Updated At",
    ];

    // Get selected fields
    let selectedFields = fields ? fields.split(",") : [];
    let fieldMap = {
      title: 0,
      description: 1,
      priority: 2,
      status: 3,
      assignedTo: 4,
      assignedBy: 5,
      project: 6,
      department: 7,
      deadline: 8,
      estimatedHours: 9,
      actualMinutes: 10,
      createdAt: 11,
      updatedAt: 12,
    };

    const rows = tasks.map((task) => {
      const row = [
        `"${(task.title || "").replace(/"/g, '""')}"`,
        `"${(task.description || "").replace(/"/g, '""')}"`,
        task.priority || "normal",
        task.status || "pending",
        `"${task.assignedTo?.fullName || ""}"`,
        `"${task.assignedBy?.fullName || ""}"`,
        `"${task.projectId?.name || ""}"`,
        `"${task.departmentId?.name || ""}"`,
        task.deadline ? new Date(task.deadline).toLocaleDateString() : "",
        task.estimatedHours || 0,
        task.actualMinutes || 0,
        task.createdAt ? new Date(task.createdAt).toLocaleDateString() : "",
        task.updatedAt ? new Date(task.updatedAt).toLocaleDateString() : "",
      ];
      return row;
    });

    // Filter columns if fields are selected
    let finalHeaders = headers;
    let finalRows = rows;

    if (selectedFields.length > 0) {
      const indices = selectedFields.map(f => fieldMap[f]).filter(i => i !== undefined);
      finalHeaders = indices.map(i => headers[i]);
      finalRows = rows.map(row => indices.map(i => row[i] || ""));
    }

    const csvContent = [
      finalHeaders.join(","),
      ...finalRows.map((row) => row.join(",")),
    ].join("\n");

    // Add BOM for UTF-8
    const csvWithBOM = "\uFEFF" + csvContent;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=tasks_report_${new Date().toISOString().split("T")[0]}.csv`,
    );
    res.send(csvWithBOM);
  } catch (error) {
    console.error("Error exporting task report:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to export report",
    });
  }
};

module.exports = {
  getTaskReports,
  getPersonalTaskReport,
  getDepartmentTaskReport,
  getProjectTaskReport,
  exportTaskReport,
};
