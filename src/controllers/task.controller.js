// controllers/task.controller.js - COMPLETE UPDATED VERSION
// With Milestone & Sub-task Support

const { Task } = require("../models/Task.model");
const { User } = require("../models/User.model");
const { Project } = require("../models/Project.model");
const TimerEntry = require("../models/TimerEntry");
const mongoose = require("mongoose");
const { NotificationService } = require("../services/notification.service");
const { createNotification } = require("./notification.controller");

// ============================================================
// VALID STATUSES - Used for validation
// ============================================================
const VALID_STATUSES = [
  "pending",
  "in_progress",
  "submitted",
  "completed",
  "overdue",
  "rejected",
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================
const getEmptyStats = () => ({
  total: 0,
  pending: 0,
  inProgress: 0,
  submitted: 0,
  completed: 0,
  overdue: 0,
  rejected: 0,
});

// ============================================================
// GET TASKS - With Milestone Filter Support
// ============================================================
const getTasks = async (req, res) => {
  try {
    const user = req.user;
    const {
      status,
      priority,
      projectId,
      departmentId,
      projectManagerId,
      assignedTo,          // 🆕 ADD THIS
      userId,              // 🆕 alt name
      assignee,            // 🆕 alt name
      page = 1,
      limit = 20,
      isMilestone,
      parentTaskId,
    } = req.query;

    let query = {};

    console.log("🔍 getTasks called with:", {
      userId: user._id,
      userRole: user.role,
      userDepartmentId: user.departmentId,
      queryParams: req.query
    });

    // 🆕 EXPLICIT USER FILTER — must come first
    const targetUserId = assignedTo || userId || assignee;
    if (targetUserId) {
      const canViewOthers = [
        "super_admin",
        "admin",
        "hr_manager",
        "dept_manager",
        "project_manager",
        "line_manager",
      ].includes(user.role);

      if (!canViewOthers && targetUserId !== user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to view this user's tasks",
        });
      }

      query.assignedTo = new mongoose.Types.ObjectId(targetUserId);
      console.log(`🎯 Explicit user filter: assignedTo = ${targetUserId}`);
    }
    // ============ ROLE-BASED FILTERING ============
    else if (user.role === "super_admin" || user.role === "admin" || user.role === "hr_manager") {
      console.log("👑 Admin role - seeing all tasks");
    }
    // ============ PROJECT MANAGER - Show department tasks ============
    else if (user.role === "project_manager") {
      console.log("📋 Project Manager - fetching tasks");

      // Get the user's department ID
      const deptId = user.departmentId || user.department?._id;

      if (deptId) {
        // Show ALL tasks from the department
        query.departmentId = deptId;
        console.log(`🏢 Project Manager - showing all tasks for department: ${deptId}`);
      } else {
        // If no department, fallback to assigned tasks only
        query.assignedTo = user._id;
        console.log(`👤 Project Manager has no department - showing assigned tasks only`);
      }
    }
    // Department Manager - see tasks in their department
    else if (user.role === "dept_manager") {
      if (user.departmentId) {
        query.departmentId = user.departmentId;
        console.log(`🏢 Dept Manager - filtering by department: ${user.departmentId}`);
      } else {
        console.log("⚠️ Dept Manager has no department assigned");
        return res.json({
          success: true,
          data: [],
          stats: getEmptyStats(),
          pagination: { page: 1, limit: 20, total: 0, pages: 0 }
        });
      }
    }
    // Line Manager - see tasks of their team
    else if (user.role === "line_manager") {
      const teamMembers = await User.find({ managerId: user._id })
        .select("_id")
        .lean();
      const teamMemberIds = [...teamMembers.map((m) => m._id), user._id];
      query.assignedTo = { $in: teamMemberIds };
      console.log(`👥 Line Manager - filtering ${teamMemberIds.length} team members`);
    }
    // Employee - see only their own tasks
    else {
      query.assignedTo = user._id;
      console.log(`👤 Employee - filtering by assignedTo: ${user._id}`);
    }

    // ============ ADDITIONAL FILTERS FROM QUERY PARAMS ============
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (projectId) query.projectId = projectId;
    if (departmentId) query.departmentId = departmentId;
    if (projectManagerId) query.projectManagerId = projectManagerId;

    // 🆕 Milestone filter
    if (isMilestone === 'true') {
      query.isMilestone = true;
    } else if (isMilestone === 'false') {
      query.isMilestone = false;
    }
    // If 'all' or undefined, show both

    // 🆕 Parent task filter (for sub-tasks)
    if (parentTaskId) {
      query.parentTaskId = parentTaskId;
    }

    console.log("📊 Final query:", JSON.stringify(query, null, 2));

    // ============ EXECUTE QUERIES ============
    const [tasks, total, stats] = await Promise.all([
      Task.find(query)
        .select(
          "_id title description priority status deadline estimatedHours actualMinutes projectId createdAt updatedAt evidenceUrls evidenceRequired rejectionReason approvalNote evidenceSubmitted evidenceSubmittedAt assignedTo assignedBy isMilestone parentTaskId progress startDate subTaskCount completedSubTaskCount"
        )
        .populate("assignedTo", "fullName email employeeId")
        .populate("assignedBy", "fullName email")
        .populate("projectId", "name code")
        .populate("departmentId", "name code")
        .populate("parentTaskId", "title status")
        .sort({ createdAt: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .lean(),
      Task.countDocuments(query),
      Task.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
            inProgress: { $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] } },
            submitted: { $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] } },
            completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
            overdue: { $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
            milestoneCount: { $sum: { $cond: [{ $eq: ["$isMilestone", true] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const statsData = stats[0] || {
      total: 0,
      pending: 0,
      inProgress: 0,
      submitted: 0,
      completed: 0,
      overdue: 0,
      rejected: 0,
      milestoneCount: 0,
    };

    console.log(`✅ Found ${tasks.length} tasks for user ${user._id} (${user.role})`);

    res.json({
      success: true,
      data: tasks,
      stats: statsData,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Get tasks error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message
    });
  }
};

// ============================================================
// GET MY TASKS
// ============================================================
const getMyTasks = async (req, res) => {
  try {
    const user = req.user;
    const { status } = req.query;

    const query = { assignedTo: user._id };
    if (status) query.status = status;

    const [tasks, stats] = await Promise.all([
      Task.find(query)
        .select(
          "_id title description priority status deadline estimatedHours projectId createdAt updatedAt evidenceUrls evidenceRequired rejectionReason approvalNote evidenceSubmitted evidenceSubmittedAt isMilestone parentTaskId progress"
        )
        .populate("assignedBy", "fullName email")
        .populate("projectId", "name code")
        .populate("parentTaskId", "title status")
        .sort({ deadline: 1 })
        .lean(),
      Task.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
            inProgress: { $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] } },
            submitted: { $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] } },
            completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
            overdue: { $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const statsData = stats[0] || {
      total: 0,
      pending: 0,
      inProgress: 0,
      submitted: 0,
      completed: 0,
      overdue: 0,
      rejected: 0,
    };

    res.json({
      success: true,
      data: tasks,
      stats: statsData,
    });
  } catch (error) {
    console.error("Get my tasks error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// GET TASK BY ID - With Milestone & Sub-task Data
// ============================================================
const getTaskById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    console.log("🔍 getTaskById called:", {
      userId: user._id,
      userRole: user.role,
      userDepartment: user.department,
      userDepartmentId: user.departmentId,
      taskId: id
    });

    const task = await Task.findById(id)
      .populate("assignedTo", "fullName email employeeId")
      .populate("assignedBy", "fullName email")
      .populate("projectId", "name code description")
      .populate("departmentId", "name code")
      .populate("parentTaskId", "title status deadline")
      .populate("extensionRequests.approvedBy", "fullName email")   // ✅ ADD THIS
      .lean();

    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    // 🆕 Get sub-tasks if this is a parent task
    let subTasks = [];
    if (task.subTaskCount > 0) {
      subTasks = await Task.find({ parentTaskId: task._id })
        .select("title status deadline priority isMilestone progress assignedTo estimatedHours")
        .populate("assignedTo", "fullName email")
        .sort({ order: 1 })
        .lean();
    }

    console.log("📋 Task found:", {
      taskId: task._id,
      taskDepartmentId: task.departmentId,
      taskAssignedTo: task.assignedTo?._id,
      taskProjectId: task.projectId?._id,
      isMilestone: task.isMilestone,
      subTaskCount: task.subTaskCount
    });

    // ============ PERMISSION CHECK ============
    const isAssignee = task.assignedTo && task.assignedTo._id.toString() === user._id.toString();
    const isCreator = task.assignedBy && task.assignedBy._id.toString() === user._id.toString();
    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(user.role);

    // Department Manager check
    let isDeptManager = false;
    if (user.role === "dept_manager" && task.departmentId) {
      isDeptManager = user.departmentId && user.departmentId.toString() === task.departmentId.toString();
    }

    // Project Manager check
    let isProjectManager = false;
    if (user.role === "project_manager") {
      console.log("🔍 Checking Project Manager permissions...");

      let userDeptId = user.departmentId || user.department || null;
      if (userDeptId && typeof userDeptId === 'object' && userDeptId._id) {
        userDeptId = userDeptId._id;
      }

      const taskDeptId = task.departmentId;
      console.log("📋 User Dept ID (resolved):", userDeptId);
      console.log("📋 Task Dept ID:", taskDeptId);

      if (taskDeptId && userDeptId) {
        isProjectManager = userDeptId.toString() === taskDeptId.toString();
        console.log("📋 Dept check result:", isProjectManager);
      }

      if (!isProjectManager && task.projectId) {
        try {
          const project = await Project.findById(task.projectId._id)
            .select("projectManager")
            .lean();
          if (project && project.projectManager) {
            isProjectManager = project.projectManager.toString() === user._id.toString();
            console.log("📋 Project manager check result:", isProjectManager);
          }
        } catch (err) {
          console.error("Error checking project:", err);
        }
      }

      if (!isProjectManager && taskDeptId) {
        isProjectManager = true;
        console.log("📋 ULTIMATE FALLBACK: Allowing project manager to view task");
      }
    }

    // Line Manager check
    let isLineManager = false;
    if (user.role === "line_manager" && task.assignedTo) {
      try {
        const assignee = await User.findById(task.assignedTo._id)
          .select("managerId")
          .lean();
        if (assignee && assignee.managerId) {
          isLineManager = assignee.managerId.toString() === user._id.toString();
        }
      } catch (err) {
        console.error("Error checking line manager:", err);
      }
    }

    const canView = isAssignee || isCreator || isAdmin || isDeptManager || isProjectManager || isLineManager;

    console.log("🔍 Permission check result:", {
      isAssignee,
      isCreator,
      isAdmin,
      isDeptManager,
      isProjectManager,
      isLineManager,
      canView,
      userRole: user.role,
    });

    if (!canView) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to view this task",
      });
    }

    const taskResponse = {
      ...task,
      evidenceUrls: task.evidenceUrls || [],
      evidenceRequired: task.evidenceRequired || false,
      evidenceSubmitted: task.evidenceSubmitted || false,
      evidenceSubmittedAt: task.evidenceSubmittedAt || null,
      rejectionReason: task.rejectionReason || "",
      approvalNote: task.approvalNote || "",
      // 🆕 Include sub-tasks info
      subTasks: subTasks,
      subTasksCompleted: task.completedSubTaskCount || 0,
      subTasksTotal: task.subTaskCount || 0,
      isParent: task.subTaskCount > 0,
    };

    res.json({ success: true, data: taskResponse });
  } catch (error) {
    console.error("Get task error:", error);
    res.status(500).json({ success: false, message: "Server error: " + error.message });
  }
};

// ============================================================
// CREATE TASK - With Milestone & Sub-task Support
// ============================================================
const createTask = async (req, res) => {
  try {
    const user = req.user;
    const {
      title,
      description,
      projectId,
      assignedTo,
      deadline,
      priority,
      estimatedHours,
      departmentId,
      isApprovalRequired,
      evidenceRequired,
      revisedDeadline,
      startTime,
      endTime,
      evidenceUrls,
      isMilestone,
      parentTaskId,
      startDate,
    } = req.body;

    // Validate required fields
    if (!title || !description || !assignedTo || !deadline || !projectId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: title, description, assignedTo, deadline, projectId",
      });
    }

    // 🆕 Validate milestone rules
    if (isMilestone) {
      if (parentTaskId) {
        return res.status(400).json({
          success: false,
          message: "Milestone cannot be a sub-task. It should be at project level.",
        });
      }

      if (estimatedHours && estimatedHours > 0) {
        return res.status(400).json({
          success: false,
          message: "Milestone should have 0 estimated hours.",
        });
      }
    }

    // 🆕 If parentTaskId exists, this is a sub-task
    let finalProjectId = projectId;
    let finalDepartmentId = departmentId;

    if (parentTaskId) {
      const parentTask = await Task.findById(parentTaskId);
      if (!parentTask) {
        return res.status(404).json({
          success: false,
          message: "Parent task not found",
        });
      }

      if (isMilestone) {
        return res.status(400).json({
          success: false,
          message: "Sub-task cannot be a milestone",
        });
      }

      // Inherit project and department from parent if not provided
      finalProjectId = projectId || parentTask.projectId;
      finalDepartmentId = departmentId || parentTask.departmentId;
    }

    // Parallel validation queries
    const [assignedUser, project] = await Promise.all([
      User.findById(assignedTo)
        .select("_id fullName email departmentId role")
        .lean(),
      Project.findById(finalProjectId)
        .select("_id name code departmentId projectManager teamMembers")
        .lean(),
    ]);

    if (!assignedUser) {
      return res.status(404).json({ success: false, message: "Assigned user not found" });
    }

    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }

    // ============ PERMISSION CHECKS ============
    const userRole = user.role;
    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(userRole);

    if (userRole === "dept_manager") {
      const assignedUserDept = assignedUser.departmentId?.toString();
      const managerDept = user.departmentId?.toString();
      if (assignedUserDept !== managerDept) {
        return res.status(403).json({
          success: false,
          message: "You can only assign tasks to users in your department",
        });
      }
    } else if (userRole === "project_manager") {
      const isInTeam = project.teamMembers?.some(
        (member) => member.userId?.toString() === assignedTo,
      );
      if (!isInTeam && project.projectManager?.toString() !== user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "User is not a member of this project",
        });
      }
    } else if (userRole === "line_manager") {
      const isDirectReport = assignedUser.managerId?.toString() === user._id.toString();
      if (!isDirectReport) {
        return res.status(403).json({
          success: false,
          message: "You can only assign tasks to your direct reports",
        });
      }
    } else if (userRole === "employee") {
      if (assignedTo !== user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "You can only create tasks for yourself",
        });
      }
    } else if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to create tasks",
      });
    }

    // Get task count for ordering
    const taskCount = await Task.countDocuments({ projectId: finalProjectId });

    // Determine department ID
    const finalDeptId = finalDepartmentId || assignedUser.departmentId || project.departmentId;

    // 🆕 Auto-set milestone properties
    let finalEstimatedHours = estimatedHours || 0;
    let finalProgress = 0;
    let finalStatus = "pending";

    if (isMilestone) {
      finalEstimatedHours = 0;
      finalProgress = 100;
      finalStatus = "pending";
    }

    // Create task
    const task = await Task.create({
      title: title.trim(),
      description: description.trim(),
      projectId: finalProjectId,
      project: project.name,
      assignedTo,
      assignedBy: user._id,
      departmentId: finalDeptId,
      priority: priority || "normal",
      status: finalStatus,
      estimatedHours: finalEstimatedHours,
      deadline: new Date(deadline),
      revisedDeadline: revisedDeadline ? new Date(revisedDeadline) : undefined,
      isApprovalRequired: isApprovalRequired || false,
      evidenceRequired: evidenceRequired || false,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      evidenceUrls: evidenceUrls || [],
      order: taskCount,
      // 🆕 NEW FIELDS
      isMilestone: isMilestone || false,
      parentTaskId: parentTaskId || null,
      startDate: startDate ? new Date(startDate) : new Date(deadline),
      progress: finalProgress,
      subTaskCount: 0,
      completedSubTaskCount: 0,
    });

    // 🆕 If this is a sub-task, update parent's sub-task count
    if (parentTaskId) {
      await Task.findByIdAndUpdate(parentTaskId, {
        $inc: { subTaskCount: 1 },
      });
    }

    // Update project task count
    Project.findByIdAndUpdate(finalProjectId, {
      $inc: { tasksCount: 1 },
    }).exec().catch((err) => console.error("Project update error:", err));

    // Populate the created task
    const populatedTask = await Task.findById(task._id)
      .select(
        "_id title description priority status deadline estimatedHours projectId createdAt isMilestone parentTaskId progress startDate"
      )
      .populate("assignedTo", "fullName email employeeId")
      .populate("assignedBy", "fullName email")
      .populate("projectId", "name code")
      .populate("parentTaskId", "title")
      .lean();

    // Send notification in background
    setImmediate(() => {
      NotificationService.sendTaskAssigned(task._id).catch((err) => {
        console.error("Notification error:", err);
      });
    });

    res.status(201).json({
      success: true,
      message: isMilestone ? "Milestone created successfully" : "Task created successfully",
      data: populatedTask,
    });

  } catch (error) {
    console.error("Create task error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// UPDATE TASK - With Milestone & Sub-task Support
// ============================================================
const updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const user = req.user;

    console.log("📝 updateTask called:", {
      taskId: id,
      userId: user._id,
      userRole: user.role,
      userDepartmentId: user.departmentId,
      updates
    });

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    // ============ PERMISSION CHECK ============
    const isAssignee = task.assignedTo && task.assignedTo.toString() === user._id.toString();
    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(user.role);

    let isDeptManager = false;
    if (user.role === "dept_manager" && task.departmentId) {
      isDeptManager = user.departmentId && user.departmentId.toString() === task.departmentId.toString();
    }

    let isProjectManager = false;
    if (user.role === "project_manager") {
      let userDeptId = user.departmentId || (user.department && user.department._id) || user.department;
      const taskDeptId = task.departmentId;

      if (taskDeptId && userDeptId) {
        isProjectManager = userDeptId.toString() === taskDeptId.toString();
      }

      if (!isProjectManager && taskDeptId && !userDeptId) {
        try {
          const { Department } = require("../models/Department.model");
          const dept = await Department.findById(taskDeptId).populate('employees').lean();
          if (dept && dept.employees) {
            isProjectManager = dept.employees.some(function (emp) {
              return emp._id.toString() === user._id.toString();
            });
          }
        } catch (err) {
          console.error("Error checking department membership:", err);
        }
      }

      if (!isProjectManager && task.projectId) {
        try {
          const project = await Project.findById(task.projectId).select("projectManager").lean();
          if (project && project.projectManager) {
            isProjectManager = project.projectManager.toString() === user._id.toString();
          }
        } catch (err) {
          console.error("Error checking project:", err);
        }
      }

      if (!isProjectManager && taskDeptId && user.role === "project_manager") {
        isProjectManager = true;
        console.log("📋 ULTIMATE FALLBACK: Allowing project manager to update task");
      }
    }

    let isLineManager = false;
    if (user.role === "line_manager" && task.assignedTo) {
      try {
        const assignee = await User.findById(task.assignedTo).select("managerId").lean();
        if (assignee && assignee.managerId) {
          isLineManager = assignee.managerId.toString() === user._id.toString();
        }
      } catch (err) {
        console.error("Error checking line manager:", err);
      }
    }

    const canUpdate = isAssignee || isAdmin || isDeptManager || isProjectManager || isLineManager;

    console.log("🔍 Permission check result:", {
      isAssignee,
      isAdmin,
      isDeptManager,
      isProjectManager,
      isLineManager,
      canUpdate,
      userRole: user.role,
    });

    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to update this task",
      });
    }

    // ============ ROLE-BASED UPDATE RESTRICTIONS ============
    if (user.role === "employee") {
      const allowedUpdates = ["status", "evidenceUrls", "evidenceSubmitted", "evidenceSubmittedAt"];
      const requestedUpdates = Object.keys(updates);
      const isValidUpdate = requestedUpdates.every(function (update) {
        return allowedUpdates.includes(update);
      });

      if (!isValidUpdate) {
        return res.status(403).json({
          success: false,
          message: "Employees can only update task status and evidence",
        });
      }
    }

    // ============ 🆕 MILESTONE CONVERSION CHECKS ============

    // If converting to milestone
    if (updates.isMilestone === true && !task.isMilestone) {
      if (task.subTaskCount > 0) {
        return res.status(400).json({
          success: false,
          message: "Cannot convert task with sub-tasks to milestone. Complete or remove sub-tasks first.",
        });
      }

      updates.estimatedHours = 0;
      updates.progress = 100;
      updates.parentTaskId = null;
    }

    // If converting from milestone to regular task
    if (updates.isMilestone === false && task.isMilestone) {
      updates.estimatedHours = updates.estimatedHours || 1;
      updates.progress = 0;

      if (task.subTaskCount > 0) {
        return res.status(400).json({
          success: false,
          message: "Cannot convert milestone with sub-tasks to regular task.",
        });
      }
    }

    // 🆕 Prevent updating parentTaskId for milestones
    if (updates.parentTaskId && task.isMilestone) {
      return res.status(400).json({
        success: false,
        message: "Milestone cannot be a sub-task.",
      });
    }

    // 🆕 If updating parentTaskId, update counts
    if (updates.parentTaskId && updates.parentTaskId !== task.parentTaskId?.toString()) {
      // Remove from old parent
      if (task.parentTaskId) {
        await Task.findByIdAndUpdate(task.parentTaskId, {
          $inc: { subTaskCount: -1 },
        });
      }

      // Add to new parent
      if (updates.parentTaskId) {
        const newParent = await Task.findById(updates.parentTaskId);
        if (!newParent) {
          return res.status(404).json({
            success: false,
            message: "Parent task not found",
          });
        }

        if (newParent.isMilestone) {
          return res.status(400).json({
            success: false,
            message: "Cannot add sub-task to milestone",
          });
        }

        await Task.findByIdAndUpdate(updates.parentTaskId, {
          $inc: { subTaskCount: 1 },
        });
      }
    }

    // ============ RESTRICTED UPDATES ============
    if (updates.isMilestone !== undefined && !isAdmin && !isDeptManager && !isProjectManager && !isLineManager) {
      return res.status(403).json({
        success: false,
        message: "Only managers can convert tasks to/from milestones",
      });
    }

    if (updates.parentTaskId !== undefined && !isAdmin && !isDeptManager && !isProjectManager && !isLineManager) {
      return res.status(403).json({
        success: false,
        message: "Only managers can change task relationships",
      });
    }

    // Don't allow changing assignedTo if not admin/manager
    if (updates.assignedTo && !isAdmin && !isDeptManager && !isProjectManager && !isLineManager) {
      return res.status(403).json({
        success: false,
        message: "Only managers can reassign tasks",
      });
    }

    // Don't allow changing projectId if not admin/manager
    if (updates.projectId && !isAdmin && !isDeptManager && !isProjectManager && !isLineManager) {
      return res.status(403).json({
        success: false,
        message: "Only managers can change task project",
      });
    }

    // ============ UPDATE THE TASK ============
    const updatedTask = await Task.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    })
      .populate("assignedTo", "fullName email employeeId")
      .populate("assignedBy", "fullName email")
      .populate("projectId", "name code")
      .populate("parentTaskId", "title")
      .lean();

    console.log("✅ Task updated successfully:", updatedTask._id);

    // Update project progress if status changed to completed
    if (updates.status === "completed" && task.status !== "completed") {
      Project.findByIdAndUpdate(task.projectId, {
        $inc: { completedTasks: 1 },
      }).exec().catch(function (err) {
        console.error("Project update error:", err);
      });
    }

    res.json({
      success: true,
      message: "Task updated successfully",
      data: updatedTask,
    });
  } catch (error) {
    console.error("❌ Update task error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message
    });
  }
};

// ============================================================
// UPDATE TASK STATUS
// ============================================================
const updateTaskStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason, approvalNote, evidenceUrls, actualMinutes } = req.body;
    const user = req.user;

    console.log("📝 updateTaskStatus called with:", { id, status, actualMinutes, evidenceUrls });

    if (!status) {
      return res.status(400).json({ success: false, message: "Status is required" });
    }

    let finalStatus = status;
    if (!VALID_STATUSES.includes(status)) {
      console.warn(`Custom status "${status}" received, mapping to "in_progress"`);
      finalStatus = "in_progress";
    }

    const oldTask = await Task.findById(id)
      .populate("assignedTo", "fullName email")
      .populate("assignedBy", "fullName email")
      .populate("projectId", "name code departmentId")
      .lean();

    if (!oldTask) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    // ============ PERMISSION CHECKS ============
    const isAssignee = oldTask.assignedTo && oldTask.assignedTo._id.toString() === user._id.toString();
    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(user.role);

    let isDeptManager = false;
    if (user.role === "dept_manager" && oldTask.departmentId) {
      isDeptManager = user.departmentId && user.departmentId.toString() === oldTask.departmentId.toString();
    }

    let isProjectManager = false;
    if (user.role === "project_manager") {
      if (oldTask.departmentId && user.departmentId) {
        isProjectManager = user.departmentId.toString() === oldTask.departmentId.toString();
      }
      if (!isProjectManager && oldTask.projectId) {
        const project = await Project.findById(oldTask.projectId._id)
          .select("projectManager")
          .lean();
        if (project && project.projectManager) {
          isProjectManager = project.projectManager.toString() === user._id.toString();
        }
      }
    }

    let isLineManager = false;
    if (user.role === "line_manager" && oldTask.assignedTo) {
      const assignee = await User.findById(oldTask.assignedTo._id)
        .select("managerId")
        .lean();
      if (assignee && assignee.managerId) {
        isLineManager = assignee.managerId.toString() === user._id.toString();
      }
    }

    const canUpdate = isAssignee || isAdmin || isDeptManager || isProjectManager || isLineManager;

    console.log("🔍 Permission check:", {
      isAssignee,
      isAdmin,
      isDeptManager,
      isProjectManager,
      isLineManager,
      canUpdate,
      userRole: user.role,
    });

    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to update this task status",
      });
    }

    // Only admins/managers can approve/reject
    const isApprovalAction = finalStatus === "completed" || finalStatus === "rejected";
    if (isApprovalAction && !isAdmin && !isDeptManager && !isProjectManager && !isLineManager) {
      return res.status(403).json({
        success: false,
        message: "Only managers can approve or reject tasks",
      });
    }

    // Only assignee can submit for review
    if (finalStatus === "submitted" && !isAssignee) {
      return res.status(403).json({
        success: false,
        message: "Only the assigned employee can submit this task",
      });
    }

    const oldStatus = oldTask.status;

    // ============ BUILD UPDATE OBJECT ============
    const updateData = { status: finalStatus };

    if (actualMinutes !== undefined && actualMinutes !== null) {
      if (typeof actualMinutes !== 'number' || actualMinutes < 0) {
        return res.status(400).json({
          success: false,
          message: "actualMinutes must be a positive number",
        });
      }
      updateData.actualMinutes = Math.round(actualMinutes * 100) / 100;
    }

    if (evidenceUrls && Array.isArray(evidenceUrls) && evidenceUrls.length > 0) {
      console.log("📎 Evidence URLs received:", evidenceUrls);
      const existingUrls = oldTask.evidenceUrls || [];
      const allUrls = [...new Set([...existingUrls, ...evidenceUrls])];
      updateData.evidenceUrls = allUrls;
      updateData.evidenceSubmitted = true;
      updateData.evidenceSubmittedAt = new Date();
    } else if (finalStatus === "submitted" && oldTask.evidenceRequired) {
      const hasExistingEvidence = oldTask.evidenceUrls && oldTask.evidenceUrls.length > 0;
      if (!hasExistingEvidence) {
        return res.status(400).json({
          success: false,
          message: "Evidence is required to submit this task. Please upload evidence first.",
          requiresEvidence: true,
        });
      }
      updateData.evidenceSubmitted = true;
      updateData.evidenceSubmittedAt = new Date();
    }

    if (finalStatus === "rejected" && rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    }

    if (finalStatus === "completed" && approvalNote) {
      updateData.approvalNote = approvalNote;
    }

    console.log("📤 Updating task with data:", updateData);

    const task = await Task.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: false }
    )
      .populate("assignedTo", "fullName email")
      .populate("assignedBy", "fullName email")
      .populate("projectId", "name code")
      .lean();

    console.log("✅ Task updated:", {
      id: task._id,
      status: task.status,
      actualMinutes: task.actualMinutes,
      evidenceUrls: task.evidenceUrls,
      evidenceSubmitted: task.evidenceSubmitted,
    });

    // Update project progress
    if (finalStatus === "completed" && oldStatus !== "completed") {
      Project.findByIdAndUpdate(task.projectId, {
        $inc: { completedTasks: 1 },
      }).exec().catch(err => console.error("Project update error:", err));
    }

    // Send notifications
    setImmediate(() => {
      NotificationService.sendTaskStatusUpdate(id, oldStatus, finalStatus, user._id).catch(err => {
        console.error("Notification error:", err);
      });
    });

    if (finalStatus === "submitted") {
      setImmediate(() => {
        notifyAllManagersAndAdmins(task, user).catch(err => {
          console.error("Manager notification error:", err);
        });
      });
    }

    if (finalStatus === "rejected" && rejectionReason) {
      setImmediate(() => {
        notifyAssigneeOfRejection(task, user, rejectionReason).catch(err => {
          console.error("Rejection notification error:", err);
        });
      });
    }

    if (finalStatus === "completed" && approvalNote) {
      setImmediate(() => {
        notifyAssigneeOfApproval(task, user, approvalNote).catch(err => {
          console.error("Approval notification error:", err);
        });
      });
    }

    res.json({
      success: true,
      message: `Task status updated to ${finalStatus}`,
      data: task,
    });

  } catch (error) {
    console.error("Update status error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message
    });
  }
};

// ============================================================
// SUBMIT EVIDENCE
// ============================================================
const submitEvidence = async (req, res) => {
  try {
    const { id } = req.params;
    const { evidenceUrls } = req.body;

    console.log("📎 submitEvidence called with:", { id, evidenceUrls });

    if (!evidenceUrls || !Array.isArray(evidenceUrls) || evidenceUrls.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one evidence URL is required",
      });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    if (task.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this task",
      });
    }

    const existingUrls = task.evidenceUrls || [];
    const allUrls = [...new Set([...existingUrls, ...evidenceUrls])];

    console.log("📎 Merged evidence URLs:", allUrls);

    const updatedTask = await Task.findByIdAndUpdate(
      id,
      {
        $set: {
          evidenceUrls: allUrls,
          evidenceSubmitted: true,
          evidenceSubmittedAt: new Date(),
        },
      },
      { new: true }
    )
      .populate("assignedTo", "fullName email")
      .lean();

    console.log("✅ Evidence submitted successfully:", {
      id: updatedTask._id,
      evidenceUrls: updatedTask.evidenceUrls,
      evidenceSubmitted: updatedTask.evidenceSubmitted,
    });

    res.json({
      success: true,
      message: "Evidence submitted successfully",
      data: updatedTask,
    });
  } catch (error) {
    console.error("Submit evidence error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// UPDATE TASK TIME
// ============================================================
const getTaskTime = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const task = await Task.findById(id).select("assignedTo departmentId").lean();
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    const isAssignee = task.assignedTo && task.assignedTo.toString() === user._id.toString();
    const isManager = ["admin", "super_admin", "hr_manager", "dept_manager", "project_manager", "line_manager"].includes(user.role);
    if (!isAssignee && !isManager) {
      return res.status(403).json({ success: false, message: "No permission" });
    }

    // Sum all COMPLETED timer entries for this task (duration is in seconds)
    const entries = await TimerEntry.find({
      taskId: id,
      isRunning: false,
    })
      .select("duration")
      .lean();

    const totalSeconds = entries.reduce(
      (sum, e) => sum + (Number(e.duration) || 0),
      0
    );

    // Currently running entry (duration already accumulated + live delta)
    const running = await TimerEntry.findOne({
      taskId: id,
      isRunning: true,
    }).lean();

    let runningSeconds = 0;
    if (running) {
      const base = Number(running.duration) || 0;
      const liveDelta = Math.max(
        0,
        Math.floor((Date.now() - new Date(running.startTime).getTime()) / 1000)
      );
      runningSeconds = base + liveDelta;
    }

    const combinedSeconds = totalSeconds + runningSeconds;

    res.json({
      success: true,
      data: {
        taskId: id,
        totalSeconds,
        totalMinutes: Math.round((totalSeconds / 60) * 100) / 100,
        runningSeconds,
        runningMinutes: Math.round((runningSeconds / 60) * 100) / 100,
        combinedSeconds,
        combinedMinutes: Math.round((combinedSeconds / 60) * 100) / 100,
        entriesCount: entries.length,
        hasRunning: !!running,
      },
    });
  } catch (error) {
    console.error("❌ getTaskTime error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get task time",
      error: error.message,
    });
  }
};

const updateTaskTime = async (req, res) => {
  try {
    const { id } = req.params;
    const { actualMinutes } = req.body;

    console.log("⏱️ updateTaskTime called:", { id, actualMinutes });

    if (actualMinutes === undefined || actualMinutes === null) {
      return res.status(400).json({
        success: false,
        message: "actualMinutes is required",
      });
    }

    if (typeof actualMinutes !== "number" || actualMinutes < 0) {
      return res.status(400).json({
        success: false,
        message: "actualMinutes must be a positive number",
      });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    const isAssignee = task.assignedTo && task.assignedTo.toString() === req.user._id.toString();
    const isManager = ["admin", "super_admin", "hr_manager", "dept_manager", "project_manager", "line_manager"].includes(req.user.role);

    if (!isAssignee && !isManager) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to update task time",
      });
    }

    const roundedMinutes = Math.round(actualMinutes * 100) / 100;

    const updatedTask = await Task.findByIdAndUpdate(
      id,
      { actualMinutes: roundedMinutes, updatedAt: new Date() },
      { new: true }
    )
      .populate("assignedTo", "fullName email")
      .populate("assignedBy", "fullName email")
      .populate("projectId", "name code")
      .lean();

    console.log(`⏱️ Task ${id} time set to: ${roundedMinutes}m by ${req.user.email}`);

    res.status(200).json({
      success: true,
      message: "Task time updated successfully",
      data: updatedTask,
    });
  } catch (error) {
    console.error("Error updating task time:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update task time",
      error: error.message,
    });
  }
};

// ============================================================
// 🆕 GET SUB-TASKS
// ============================================================
// controllers/task.controller.js - getSubTasks ফাংশন

const getSubTasks = async (req, res) => {
  try {
    // ✅ FIX: উভয় প্যারামিটার চেক করুন
    const taskId = req.params.id || req.params.taskId;

    console.log("🔍 getSubTasks called with taskId:", taskId);

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Task ID is required",
      });
    }

    const user = req.user;

    const parentTask = await Task.findById(taskId);
    if (!parentTask) {
      // ✅ 404 এর পরিবর্তে empty array রিটার্ন করুন
      return res.status(200).json({
        success: true,
        data: [],
        stats: {
          total: 0,
          completed: 0,
          inProgress: 0,
          pending: 0,
          overdue: 0,
        },
        parentTask: null,
        message: "No sub-tasks found"
      });
    }

    // Permission check
    const isAssignee = parentTask.assignedTo && parentTask.assignedTo.toString() === user._id.toString();
    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(user.role);
    const isDeptManager = user.role === "dept_manager" && user.departmentId?.toString() === parentTask.departmentId?.toString();
    const isProjectManager = user.role === "project_manager" && user.departmentId?.toString() === parentTask.departmentId?.toString();

    if (!isAssignee && !isAdmin && !isDeptManager && !isProjectManager) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to view sub-tasks",
      });
    }

    // ✅ subTaskCount চেক করুন
    if (parentTask.subTaskCount === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        stats: {
          total: 0,
          completed: 0,
          inProgress: 0,
          pending: 0,
          overdue: 0,
        },
        parentTask: {
          _id: parentTask._id,
          title: parentTask.title,
          progress: parentTask.progress,
        }
      });
    }

    const subTasks = await Task.find({ parentTaskId: taskId })
      .select("_id title description status priority deadline estimatedHours progress assignedTo isMilestone startDate")
      .populate("assignedTo", "fullName email")
      .sort({ order: 1, createdAt: 1 })
      .lean();

    console.log(`✅ Found ${subTasks.length} sub-tasks for task ${taskId}`);

    res.json({
      success: true,
      data: subTasks,
      stats: {
        total: subTasks.length,
        completed: subTasks.filter(t => t.status === 'completed' || t.status === 'done').length,
        inProgress: subTasks.filter(t => t.status === 'in_progress').length,
        pending: subTasks.filter(t => t.status === 'pending').length,
        overdue: subTasks.filter(t => t.status === 'overdue').length,
      },
      parentTask: {
        _id: parentTask._id,
        title: parentTask.title,
        progress: parentTask.progress,
      }
    });
  } catch (error) {
    console.error("❌ Get sub-tasks error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// 🆕 GET MILESTONES BY PROJECT
// ============================================================
const getMilestones = async (req, res) => {
  try {
    const { projectId } = req.params;
    const user = req.user;

    // Check if user has access to this project
    const project = await Project.findById(projectId).select("departmentId projectManager teamMembers").lean();
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(user.role);
    const isDeptManager = user.role === "dept_manager" && user.departmentId?.toString() === project.departmentId?.toString();
    const isProjectManager = project.projectManager?.toString() === user._id.toString();

    if (!isAdmin && !isDeptManager && !isProjectManager) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to view milestones for this project",
      });
    }

    const milestones = await Task.find({
      projectId,
      isMilestone: true
    })
      .select("_id title description status deadline priority assignedTo progress startDate")
      .populate("assignedTo", "fullName email")
      .sort({ deadline: 1 })
      .lean();

    const stats = {
      total: milestones.length,
      completed: milestones.filter(m => m.status === 'completed' || m.status === 'done').length,
      pending: milestones.filter(m => m.status !== 'completed' && m.status !== 'done').length,
      overdue: milestones.filter(m => m.status === 'overdue').length,
    };

    res.json({
      success: true,
      data: milestones,
      stats,
    });
  } catch (error) {
    console.error("Get milestones error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// 🆕 GET TASK HIERARCHY (Parent + Sub-tasks + Milestones)
// ============================================================
const getTaskHierarchy = async (req, res) => {
  try {
    const { taskId } = req.params;
    const user = req.user;

    const task = await Task.findById(taskId)
      .populate("assignedTo", "fullName email")
      .populate("projectId", "name code")
      .lean();

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // Permission check
    const isAssignee = task.assignedTo && task.assignedTo._id.toString() === user._id.toString();
    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(user.role);

    if (!isAssignee && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to view this task hierarchy",
      });
    }

    let hierarchy = {
      task: {
        _id: task._id,
        title: task.title,
        status: task.status,
        isMilestone: task.isMilestone,
        progress: task.progress,
        subTaskCount: task.subTaskCount,
      },
      parent: null,
      subTasks: [],
      siblings: [],
    };

    // Get parent if exists
    if (task.parentTaskId) {
      const parent = await Task.findById(task.parentTaskId)
        .select("_id title status isMilestone progress")
        .lean();
      hierarchy.parent = parent;

      // Get siblings
      const siblings = await Task.find({
        parentTaskId: task.parentTaskId,
        _id: { $ne: task._id }
      })
        .select("_id title status isMilestone progress")
        .sort({ order: 1 })
        .lean();
      hierarchy.siblings = siblings;
    }

    // Get sub-tasks
    if (task.subTaskCount > 0) {
      const subTasks = await Task.find({ parentTaskId: task._id })
        .select("_id title status isMilestone progress deadline assignedTo")
        .populate("assignedTo", "fullName email")
        .sort({ order: 1 })
        .lean();
      hierarchy.subTasks = subTasks;
    }

    res.json({
      success: true,
      data: hierarchy,
    });
  } catch (error) {
    console.error("Get task hierarchy error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// NOTIFICATION HELPERS
// ============================================================
const notifyAllManagersAndAdmins = async (task, submitter) => {
  try {
    const managementRoles = [
      "admin",
      "super_admin",
      "dept_manager",
      "project_manager",
      "line_manager",
      "hr_manager",
    ];

    const managers = await User.find({
      role: { $in: managementRoles },
      isActive: true,
    })
      .select("_id fullName email")
      .lean();

    const submitterName = submitter?.fullName || "Employee";

    const notificationPromises = managers
      .filter((manager) => manager._id.toString() !== submitter?._id?.toString())
      .map((manager) =>
        createNotification({
          userId: manager._id,
          title: "Task Ready for Review",
          message: `${submitterName} has submitted task "${task.title}" for review.`,
          type: "warning",
          category: "approval",
          taskId: task._id,
          taskTitle: task.title,
          actionUrl: `/tasks/${task._id}`,
          metadata: {
            submitter: submitterName,
            projectName: task.projectId?.name,
            priority: task.priority,
            deadline: task.deadline,
          },
        })
      );

    await Promise.all(notificationPromises);
    console.log(`✅ Notified ${notificationPromises.length} managers/admins`);
  } catch (error) {
    console.error("Error notifying managers:", error);
  }
};

const notifyAssigneeOfRejection = async (task, reviewer, rejectionReason) => {
  try {
    if (!task.assignedTo || !task.assignedTo._id) {
      console.log("No assignee found for rejection notification");
      return;
    }

    const assigneeId = task.assignedTo._id;
    const reviewerName = reviewer?.fullName || "Manager";

    await createNotification({
      userId: assigneeId,
      title: "❌ Task Rejected",
      message: `${reviewerName} has rejected your task "${task.title}". Reason: ${rejectionReason}`,
      type: "error",
      category: "task_update",
      taskId: task._id,
      taskTitle: task.title,
      actionUrl: `/tasks/${task._id}`,
      metadata: {
        reviewer: reviewerName,
        rejectionReason: rejectionReason,
        projectName: task.projectId?.name,
      },
    });

    console.log(`✅ Rejection notification sent to ${task.assignedTo.fullName}`);
  } catch (error) {
    console.error("Error sending rejection notification:", error);
  }
};

const notifyAssigneeOfApproval = async (task, approver, approvalNote) => {
  try {
    if (!task.assignedTo || !task.assignedTo._id) {
      console.log("No assignee found for approval notification");
      return;
    }

    const assigneeId = task.assignedTo._id;
    const approverName = approver?.fullName || "Manager";

    await createNotification({
      userId: assigneeId,
      title: "✅ Task Approved",
      message: `${approverName} has approved your task "${task.title}". ${approvalNote ? `Note: ${approvalNote}` : ''}`,
      type: "success",
      category: "task_update",
      taskId: task._id,
      taskTitle: task.title,
      actionUrl: `/tasks/${task._id}`,
      metadata: {
        approver: approverName,
        approvalNote: approvalNote,
        projectName: task.projectId?.name,
      },
    });

    console.log(`✅ Approval notification sent to ${task.assignedTo.fullName}`);
  } catch (error) {
    console.error("Error sending approval notification:", error);
  }
};

// ============================================================
// TIMER FUNCTIONS
// ============================================================
const startTaskTimer = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found"
      });
    }

    if (task.assignedTo.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this task"
      });
    }

    if (task.isTimerRunning) {
      return res.status(400).json({
        success: false,
        message: "Timer is already running for this task"
      });
    }

    if (task.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot start timer on completed task"
      });
    }

    task.isTimerRunning = true;
    task.timerStartTime = new Date();
    task.elapsedTime = 0;
    if (task.status === "pending") {
      task.status = "in_progress";
    }
    await task.save();

    res.status(200).json({
      success: true,
      message: "Timer started successfully",
      data: task
    });
  } catch (error) {
    console.error("Start timer error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to start timer",
      error: error.message
    });
  }
};

const pauseTaskTimer = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found"
      });
    }

    if (task.assignedTo.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this task"
      });
    }

    if (!task.isTimerRunning) {
      return res.status(400).json({
        success: false,
        message: "Timer is not running for this task"
      });
    }

    const startTime = new Date(task.timerStartTime);
    const now = new Date();
    const additionalSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);
    const totalElapsed = (task.elapsedTime || 0) + additionalSeconds;

    task.isTimerRunning = false;
    task.timerStartTime = null;
    task.elapsedTime = totalElapsed;
    task.timeSpent = Math.round((totalElapsed / 3600) * 10) / 10;
    await task.save();

    res.status(200).json({
      success: true,
      message: "Timer paused successfully",
      data: {
        ...task.toObject(),
        elapsedSeconds: totalElapsed
      }
    });
  } catch (error) {
    console.error("Pause timer error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to pause timer",
      error: error.message
    });
  }
};

const resumeTaskTimer = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found"
      });
    }

    if (task.assignedTo.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this task"
      });
    }

    if (task.isTimerRunning) {
      return res.status(400).json({
        success: false,
        message: "Timer is already running for this task"
      });
    }

    task.isTimerRunning = true;
    task.timerStartTime = new Date();
    await task.save();

    res.status(200).json({
      success: true,
      message: "Timer resumed successfully",
      data: task
    });
  } catch (error) {
    console.error("Resume timer error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to resume timer",
      error: error.message
    });
  }
};

const completeTask = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found"
      });
    }

    if (task.assignedTo.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this task"
      });
    }

    if (task.isTimerRunning) {
      const startTime = new Date(task.timerStartTime);
      const now = new Date();
      const additionalSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);
      const totalElapsed = (task.elapsedTime || 0) + additionalSeconds;

      task.isTimerRunning = false;
      task.timerStartTime = null;
      task.elapsedTime = totalElapsed;
      task.timeSpent = Math.round((totalElapsed / 3600) * 10) / 10;
    }

    task.status = "completed";
    task.completedAt = new Date();
    task.progress = 100;
    await task.save();

    // Update project progress
    if (task.projectId) {
      Project.findByIdAndUpdate(task.projectId, {
        $inc: { completedTasks: 1 },
      }).exec().catch(err => console.error("Project update error:", err));
    }

    res.status(200).json({
      success: true,
      message: "Task completed successfully! 🎉",
      data: task
    });
  } catch (error) {
    console.error("Complete task error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to complete task",
      error: error.message
    });
  }
};

// ============================================================
// REQUEST EXTENSION
// ============================================================
const requestExtension = async (req, res) => {
  try {
    const { id } = req.params;
    const { requestedDate, reason } = req.body;

    if (!requestedDate || !reason) {
      return res.status(400).json({
        success: false,
        message: "Requested date and reason are required",
      });
    }

    const task = await Task.findByIdAndUpdate(
      id,
      {
        $push: {
          extensionRequests: {
            requestedDate: new Date(requestedDate),
            reason,
            status: "pending",
          },
        },
      },
      { new: true },
    )
      .populate("assignedTo", "fullName email")
      .populate("assignedBy", "fullName email")
      .lean();

    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    res.json({
      success: true,
      message: "Extension request submitted successfully",
      data: task,
    });
  } catch (error) {
    console.error("Extension request error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// APPROVE EXTENSION
// ============================================================
const approveExtension = async (req, res) => {
  try {
    const { id, extensionId } = req.params;
    const { newDeadline } = req.body;

    const task = await Task.findOneAndUpdate(
      { _id: id, "extensionRequests._id": extensionId },
      {
        $set: {
          "extensionRequests.$.status": "approved",
          "extensionRequests.$.approvedBy": req.user._id,
          "extensionRequests.$.approvedAt": new Date(),
          deadline: new Date(newDeadline),        // ✅ actually move the deadline
          revisedDeadline: new Date(newDeadline), // ✅ keep audit trail
        },
      },
      { new: true },
    )
      .populate("assignedTo", "fullName email")
      .populate("assignedBy", "fullName email")
      .populate("extensionRequests.approvedBy", "fullName email")
      .lean();

    if (!task) {
      return res.status(404).json({ success: false, message: "Task or extension not found" });
    }

    res.json({
      success: true,
      message: "Extension approved successfully",
      data: task,
    });
  } catch (error) {
    console.error("Approve extension error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// GET EXTENSION REQUESTS
// ============================================================
const getExtensionRequests = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const task = await Task.findById(id)
      .populate("assignedTo", "fullName email")
      .populate("extensionRequests.approvedBy", "fullName email")
      .lean();

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    const isAssignee = task.assignedTo && task.assignedTo._id.toString() === user._id.toString();
    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(user.role);
    let isDeptManager = false;
    if (user.role === "dept_manager" && task.departmentId) {
      isDeptManager = user.departmentId && user.departmentId.toString() === task.departmentId.toString();
    }
    let isProjectManager = false;
    if (user.role === "project_manager") {
      let userDeptId = user.departmentId || user.department || null;
      if (userDeptId && typeof userDeptId === 'object' && userDeptId._id) {
        userDeptId = userDeptId._id;
      }
      const taskDeptId = task.departmentId;
      if (taskDeptId && userDeptId) {
        isProjectManager = userDeptId.toString() === taskDeptId.toString();
      }
    }

    const canView = isAssignee || isAdmin || isDeptManager || isProjectManager;

    if (!canView) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to view extension requests",
      });
    }

    const extensionRequests = task.extensionRequests || [];
    extensionRequests.sort((a, b) => {
      return new Date(b.createdAt || b.requestedDate) - new Date(a.createdAt || a.requestedDate);
    });

    res.json({
      success: true,
      data: extensionRequests.map((req) => ({
        _id: req._id,
        requestedDate: req.requestedDate,
        reason: req.reason,
        status: req.status,
        approvedBy: req.approvedBy && req.approvedBy.fullName
          ? {
            _id: req.approvedBy._id,
            fullName: req.approvedBy.fullName,
            email: req.approvedBy.email,
          }
          : null,
        createdAt: req.createdAt || req.requestedDate,
      })),
    });
  } catch (error) {
    console.error("Get extension requests error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// DELETE TASK
// ============================================================
const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    // Permission Check
    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(user.role);
    let isDeptManager = false;
    if (user.role === "dept_manager" && task.departmentId) {
      isDeptManager = user.departmentId && user.departmentId.toString() === task.departmentId.toString();
    }
    let isProjectManager = false;
    if (user.role === "project_manager" && task.projectId) {
      const project = await Project.findById(task.projectId).select("projectManager").lean();
      if (project && project.projectManager) {
        isProjectManager = project.projectManager.toString() === user._id.toString();
      }
    }

    if (!isAdmin && !isDeptManager && !isProjectManager) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to delete this task",
      });
    }

    // 🆕 If this is a parent task, handle sub-tasks
    if (task.subTaskCount > 0) {
      // Either delete all sub-tasks or move them
      await Task.updateMany(
        { parentTaskId: task._id },
        { parentTaskId: null }
      );
    }

    // 🆕 If this is a sub-task, update parent's count
    if (task.parentTaskId) {
      await Task.findByIdAndUpdate(task.parentTaskId, {
        $inc: { subTaskCount: -1 },
      });
    }

    // Update project task count
    Project.findByIdAndUpdate(task.projectId, {
      $inc: {
        tasksCount: -1,
        completedTasks: task.status === "completed" ? -1 : 0,
      },
    })
      .exec()
      .catch((err) => console.error("Project update error:", err));

    await Task.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error) {
    console.error("Delete task error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// BULK CREATE TASKS
// ============================================================
const bulkCreateTasks = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { projectId } = req.params;
    const { tasks } = req.body;
    const user = req.user;

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Tasks array is required and cannot be empty",
      });
    }

    if (tasks.length > 100) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Maximum 100 tasks per bulk upload",
      });
    }

    const project = await Project.findById(projectId).session(session).lean();
    if (!project) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const assignedUserIds = tasks.map((t) => t.assignedTo).filter((id) => id);
    const existingUsers = await User.find(
      { _id: { $in: assignedUserIds } },
      { _id: 1, departmentId: 1 },
    )
      .lean()
      .session(session);

    const existingUserIds = new Set(existingUsers.map((u) => u._id.toString()));

    const validTasks = [];
    const validationErrors = [];
    const currentTaskCount = await Task.countDocuments({ projectId });

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const errors = [];

      if (!task.title) errors.push(`Task ${i + 1}: Title is required`);
      if (!task.description) errors.push(`Task ${i + 1}: Description is required`);
      if (!task.assignedTo) errors.push(`Task ${i + 1}: AssignedTo is required`);
      if (!task.deadline) errors.push(`Task ${i + 1}: Deadline is required`);

      if (task.assignedTo && !existingUserIds.has(task.assignedTo)) {
        errors.push(`Task ${i + 1}: Assigned user not found`);
      }

      if (errors.length > 0) {
        validationErrors.push(...errors);
      } else {
        validTasks.push({
          title: task.title,
          description: task.description,
          projectId: projectId,
          project: project.name,
          assignedTo: task.assignedTo,
          assignedBy: user._id,
          departmentId: project.departmentId,
          priority: task.priority || "normal",
          status: "pending",
          estimatedHours: task.estimatedHours || 0,
          deadline: new Date(task.deadline),
          isApprovalRequired: task.isApprovalRequired || false,
          evidenceRequired: task.evidenceRequired || false,
          order: currentTaskCount + i,
          isMilestone: task.isMilestone || false,
          progress: task.isMilestone ? 100 : 0,
        });
      }
    }

    if (validationErrors.length > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        errors: validationErrors,
      });
    }

    const createdTasks = await Task.insertMany(validTasks, { session });

    await Project.findByIdAndUpdate(
      projectId,
      { $inc: { tasksCount: createdTasks.length } },
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    const populatedTasks = await Task.find({
      _id: { $in: createdTasks.map((t) => t._id) },
    })
      .select("_id title description priority status deadline estimatedHours projectId isMilestone progress")
      .populate("assignedTo", "fullName email employeeId")
      .populate("assignedBy", "fullName email")
      .populate("projectId", "name code")
      .lean();

    const notificationPromises = populatedTasks.map((task) =>
      NotificationService.sendTaskAssigned(task._id).catch((err) =>
        console.error("Notification error for task", task._id, err),
      )
    );
    Promise.all(notificationPromises).catch((err) =>
      console.error("Some notifications failed:", err),
    );

    res.status(201).json({
      success: true,
      message: `Successfully created ${createdTasks.length} tasks`,
      data: populatedTasks,
      stats: {
        total: createdTasks.length,
        projectId: projectId,
        projectName: project.name,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Bulk create tasks error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// BULK CREATE TASKS WITHOUT PROJECT
// ============================================================
const bulkCreateTasksWithoutProject = async (req, res) => {
  try {
    const { tasks } = req.body;
    const user = req.user;

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Tasks array is required and cannot be empty",
      });
    }

    if (tasks.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Maximum 100 tasks per bulk upload",
      });
    }

    // Get the user's department ID from their profile
    let userDepartmentId = null;

    // Check if user has departmentId
    if (user.departmentId) {
      // If departmentId is an object with _id
      if (typeof user.departmentId === 'object' && user.departmentId._id) {
        userDepartmentId = user.departmentId._id;
      } else {
        userDepartmentId = user.departmentId;
      }
    }

    // If user doesn't have a department, try to find any department
    if (!userDepartmentId) {
      try {
        const { Department } = require("../models/Department.model");
        const anyDepartment = await Department.findOne().select('_id').lean();
        if (anyDepartment) {
          userDepartmentId = anyDepartment._id;
          console.log(`📋 Using fallback department: ${userDepartmentId}`);
        }
      } catch (err) {
        console.error("Error finding fallback department:", err);
      }
    }

    // If still no department, assign user's ID as department or throw error
    if (!userDepartmentId) {
      // Last resort: use the user's ID as department ID (though this might not work if Department collection is empty)
      userDepartmentId = user._id;
      console.warn(`⚠️ No department found, using user ID as department: ${userDepartmentId}`);
    }

    const assignedUserIds = tasks.map((t) => t.assignedTo).filter((id) => id);
    const existingUsers = await User.find(
      { _id: { $in: assignedUserIds } },
      { _id: 1, departmentId: 1 },
    ).lean();

    const existingUserIds = new Set(existingUsers.map((u) => u._id.toString()));
    const userDepartmentMap = {};
    existingUsers.forEach((u) => {
      userDepartmentMap[u._id.toString()] = u.departmentId;
    });

    const validationErrors = [];
    const validTasks = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const errors = [];

      if (!task.title) errors.push(`Task ${i + 1}: Title is required`);
      if (!task.description) errors.push(`Task ${i + 1}: Description is required`);
      if (!task.assignedTo) errors.push(`Task ${i + 1}: AssignedTo is required`);
      if (!task.deadline) errors.push(`Task ${i + 1}: Deadline is required`);

      if (task.assignedTo && !existingUserIds.has(task.assignedTo)) {
        errors.push(`Task ${i + 1}: Assigned user not found`);
      }

      if (errors.length > 0) {
        validationErrors.push(...errors);
      } else {
        // Get department from assigned user, or fallback to user's department
        const departmentId = userDepartmentMap[task.assignedTo] || userDepartmentId;

        validTasks.push({
          title: task.title,
          description: task.description,
          assignedTo: task.assignedTo,
          assignedBy: user._id,
          departmentId: departmentId || userDepartmentId,
          priority: task.priority || "normal",
          status: "pending",
          estimatedHours: task.estimatedHours || 0,
          deadline: new Date(task.deadline),
          isApprovalRequired: task.isApprovalRequired || false,
          evidenceRequired: task.evidenceRequired || false,
          isMilestone: task.isMilestone || false,
          progress: task.isMilestone ? 100 : 0,
        });
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        errors: validationErrors,
      });
    }

    const createdTasks = await Task.insertMany(validTasks);

    const populatedTasks = await Task.find({
      _id: { $in: createdTasks.map((t) => t._id) },
    })
      .populate("assignedTo", "fullName email employeeId")
      .populate("assignedBy", "fullName email")
      .lean();

    const notificationPromises = populatedTasks.map((task) =>
      NotificationService.sendTaskAssigned(task._id).catch((err) =>
        console.error("Notification error for task", task._id, err),
      )
    );
    Promise.all(notificationPromises).catch((err) =>
      console.error("Some notifications failed:", err),
    );

    res.status(201).json({
      success: true,
      message: `Successfully created ${createdTasks.length} tasks`,
      data: populatedTasks,
    });
  } catch (error) {
    console.error("Bulk create tasks without project error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// GET TASKS BY PROJECT
// ============================================================
const getTasksByProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status, priority, page = 1, limit = 20 } = req.query;

    const project = await Project.findById(projectId).lean();
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    let query = { projectId };
    if (status) query.status = status;
    if (priority) query.priority = priority;

    const [tasks, total, stats, estimatedHoursResult] = await Promise.all([
      Task.find(query)
        .select("_id title description priority status deadline estimatedHours projectId createdAt isMilestone progress parentTaskId")
        .populate("assignedTo", "fullName email employeeId")
        .populate("assignedBy", "fullName email")
        .sort({ order: 1, createdAt: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .lean(),
      Task.countDocuments(query),
      Task.aggregate([
        { $match: { projectId: new mongoose.Types.ObjectId(projectId) } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
            inProgress: { $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] } },
            submitted: { $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] } },
            completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
            overdue: { $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
            milestoneCount: { $sum: { $cond: [{ $eq: ["$isMilestone", true] }, 1, 0] } },
          },
        },
      ]),
      Task.aggregate([
        { $match: { projectId: new mongoose.Types.ObjectId(projectId) } },
        { $group: { _id: null, total: { $sum: "$estimatedHours" } } },
      ]),
    ]);

    const statsData = stats[0] || {
      total: 0,
      pending: 0,
      inProgress: 0,
      submitted: 0,
      completed: 0,
      overdue: 0,
      rejected: 0,
      milestoneCount: 0,
    };

    statsData.totalEstimatedHours = estimatedHoursResult[0]?.total || 0;

    res.json({
      success: true,
      data: tasks,
      project: {
        id: project._id,
        name: project.name,
        code: project.code,
        progress: project.progress,
        tasksCount: project.tasksCount,
        completedTasks: project.completedTasks,
      },
      stats: statsData,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Get tasks by project error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ============================================================
// IMPORT TASKS FROM FILE
// ============================================================
const importTasksFromFile = async (req, res) => {
  try {
    const { projectId } = req.params;
    const tasksData = req.body.tasks;
    const user = req.user;

    const project = await Project.findById(projectId).lean();
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    if (!tasksData || !Array.isArray(tasksData) || tasksData.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Tasks array is required",
      });
    }

    const results = {
      successful: [],
      failed: [],
      total: tasksData.length,
    };

    const currentTaskCount = await Task.countDocuments({ projectId });

    const taskPromises = tasksData.map(async (taskData, index) => {
      try {
        if (!taskData.title || !taskData.description || !taskData.assignedTo || !taskData.deadline) {
          return {
            success: false,
            index,
            task: taskData,
            error: "Missing required fields: title, description, assignedTo, deadline",
          };
        }

        const assignedUser = await User.findById(taskData.assignedTo).lean();
        if (!assignedUser) {
          return {
            success: false,
            index,
            task: taskData,
            error: "Assigned user not found",
          };
        }

        const task = await Task.create({
          title: taskData.title,
          description: taskData.description,
          projectId: projectId,
          project: project.name,
          assignedTo: taskData.assignedTo,
          assignedBy: user._id,
          departmentId: project.departmentId,
          priority: taskData.priority || "normal",
          estimatedHours: taskData.estimatedHours || 0,
          deadline: new Date(taskData.deadline),
          isApprovalRequired: taskData.isApprovalRequired || false,
          evidenceRequired: taskData.evidenceRequired || false,
          order: currentTaskCount + results.successful.length,
          isMilestone: taskData.isMilestone || false,
          progress: taskData.isMilestone ? 100 : 0,
        });

        return { success: true, task };
      } catch (error) {
        return {
          success: false,
          index,
          task: taskData,
          error: error.message,
        };
      }
    });

    const resultsArray = await Promise.all(taskPromises);

    resultsArray.forEach((result) => {
      if (result.success) {
        results.successful.push(result.task);
      } else {
        results.failed.push({
          index: result.index,
          task: result.task,
          error: result.error,
        });
      }
    });

    if (results.successful.length > 0) {
      await Project.findByIdAndUpdate(projectId, {
        $inc: { tasksCount: results.successful.length },
      });
    }

    const notificationPromises = results.successful.map((task) =>
      NotificationService.sendTaskAssigned(task._id).catch((err) =>
        console.error("Notification error:", err),
      )
    );
    Promise.all(notificationPromises).catch((err) =>
      console.error("Some notifications failed:", err),
    );

    res.json({
      success: true,
      message: `Imported ${results.successful.length} out of ${results.total} tasks`,
      data: results,
    });
  } catch (error) {
    console.error("Import tasks error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// REORDER TASKS
// ============================================================
const reorderTasks = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { taskOrders } = req.body;

    if (!taskOrders || !Array.isArray(taskOrders)) {
      return res.status(400).json({
        success: false,
        message: "taskOrders array is required",
      });
    }

    const bulkOps = taskOrders.map((item) => ({
      updateOne: {
        filter: { _id: item.taskId, projectId: projectId },
        update: { $set: { order: item.order } },
      },
    }));

    const result = await Task.bulkWrite(bulkOps);

    res.json({
      success: true,
      message: "Tasks reordered successfully",
      data: {
        modifiedCount: result.modifiedCount,
        matchedCount: result.matchedCount,
      },
    });
  } catch (error) {
    console.error("Reorder tasks error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ============================================================
// GET PROJECT TASKS SUMMARY
// ============================================================
const getProjectTasksSummary = async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await Project.findById(projectId).lean();
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const [statusSummary, priorityDistribution, assignedUsers] = await Promise.all([
      Task.aggregate([
        { $match: { projectId: new mongoose.Types.ObjectId(projectId) } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalEstimatedHours: { $sum: "$estimatedHours" },
          },
        },
      ]),
      Task.aggregate([
        { $match: { projectId: new mongoose.Types.ObjectId(projectId) } },
        {
          $group: {
            _id: "$priority",
            count: { $sum: 1 },
          },
        },
      ]),
      Task.distinct("assignedTo", { projectId }),
    ]);

    const assignedUsersDetails = await User.find(
      { _id: { $in: assignedUsers } },
      "fullName email employeeId",
    ).lean();

    res.json({
      success: true,
      data: {
        statusSummary,
        priorityDistribution,
        totalAssignedUsers: assignedUsers.length,
        assignedUsersList: assignedUsersDetails,
        projectProgress: {
          tasksCount: project.tasksCount,
          completedTasks: project.completedTasks,
          progressPercentage: project.progress,
        },
      },
    });
  } catch (error) {
    console.error("Project tasks summary error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ============================================================
// GET TASK STATISTICS
// ============================================================
const getTaskStatistics = async (req, res) => {
  try {
    const user = req.user;
    const { period = "month" } = req.query;

    let dateFilter = {};
    const now = new Date();

    if (period === "week") {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      dateFilter = { createdAt: { $gte: weekAgo } };
    } else if (period === "month") {
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      dateFilter = { createdAt: { $gte: monthAgo } };
    } else if (period === "year") {
      const yearAgo = new Date(now);
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      dateFilter = { createdAt: { $gte: yearAgo } };
    }

    let query = {};

    if (user.role === "employee") {
      query.assignedTo = user._id;
    } else if (user.role === "line_manager") {
      const teamMembers = await User.find({ managerId: user._id }).select("_id").lean();
      query.assignedTo = { $in: [...teamMembers.map((m) => m._id), user._id] };
    } else if (user.role === "dept_manager" || user.role === "project_manager") {
      query.departmentId = user.departmentId;
    }

    const combinedQuery = { ...query, ...dateFilter };

    const stats = await Task.aggregate([
      { $match: combinedQuery },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] } },
          submitted: { $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          overdue: { $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
          lowPriority: { $sum: { $cond: [{ $eq: ["$priority", "low"] }, 1, 0] } },
          normalPriority: { $sum: { $cond: [{ $eq: ["$priority", "normal"] }, 1, 0] } },
          highPriority: { $sum: { $cond: [{ $eq: ["$priority", "high"] }, 1, 0] } },
          urgentPriority: { $sum: { $cond: [{ $eq: ["$priority", "urgent"] }, 1, 0] } },
          milestoneCount: { $sum: { $cond: [{ $eq: ["$isMilestone", true] }, 1, 0] } },
        },
      },
    ]);

    const statsData = stats[0] || {
      total: 0,
      pending: 0,
      inProgress: 0,
      submitted: 0,
      completed: 0,
      overdue: 0,
      rejected: 0,
      lowPriority: 0,
      normalPriority: 0,
      highPriority: 0,
      urgentPriority: 0,
      milestoneCount: 0,
    };

    const totalTasks = statsData.total;
    const completedTasks = statsData.completed;
    statsData.completionRate = totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        total: statsData.total,
        byStatus: {
          pending: statsData.pending,
          inProgress: statsData.inProgress,
          submitted: statsData.submitted,
          completed: statsData.completed,
          overdue: statsData.overdue,
          rejected: statsData.rejected,
        },
        byPriority: {
          low: statsData.lowPriority,
          normal: statsData.normalPriority,
          high: statsData.highPriority,
          urgent: statsData.urgentPriority,
        },
        milestones: {
          total: statsData.milestoneCount,
        },
        completionRate: statsData.completionRate,
      },
      period: period,
    });
  } catch (error) {
    console.error("Get task statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


// ============================================================
// 🆕 ADD DEPENDENCY TO TASK
// ============================================================
const addDependency = async (req, res) => {
  try {
    const { id } = req.params;
    const { dependencyTaskId, type = "FS", lag = 0 } = req.body;
    const user = req.user;

    console.log("🔗 addDependency called:", { taskId: id, dependencyTaskId, type, lag });

    // Validate required fields
    if (!dependencyTaskId) {
      return res.status(400).json({
        success: false,
        message: "Dependency task ID is required",
      });
    }

    // Get both tasks
    const [task, dependencyTask] = await Promise.all([
      Task.findById(id),
      Task.findById(dependencyTaskId),
    ]);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    if (!dependencyTask) {
      return res.status(404).json({
        success: false,
        message: "Dependency task not found",
      });
    }

    // Check permission
    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(user.role);
    const isAssignee = task.assignedTo && task.assignedTo.toString() === user._id.toString();
    const isProjectManager = user.role === "project_manager" && task.departmentId?.toString() === user.departmentId?.toString();

    if (!isAdmin && !isAssignee && !isProjectManager) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to add dependencies to this task",
      });
    }

    // Check if dependency already exists
    const existingDependency = task.dependencies?.find(
      (d) => d.taskId.toString() === dependencyTaskId
    );

    if (existingDependency) {
      return res.status(400).json({
        success: false,
        message: "This dependency already exists",
      });
    }

    // Check for circular dependency
    const circular = await task.checkCircularDependencies(id, [
      ...(task.dependencies || []),
      { taskId: dependencyTaskId, type, lag },
    ]);

    if (circular) {
      return res.status(400).json({
        success: false,
        message: `Circular dependency detected: ${circular}`,
      });
    }

    // Add dependency
    const updatedTask = await Task.findByIdAndUpdate(
      id,
      {
        $push: {
          dependencies: {
            taskId: dependencyTaskId,
            type: type || "FS",
            lag: lag || 0,
            addedAt: new Date(),
          },
        },
        $addToSet: {
          dependents: dependencyTaskId,
        },
      },
      { new: true }
    )
      .populate("assignedTo", "fullName email")
      .populate("assignedBy", "fullName email")
      .populate("projectId", "name code")
      .lean();

    // Also add to dependent's dependents array
    await Task.findByIdAndUpdate(dependencyTaskId, {
      $addToSet: {
        dependents: id,
      },
    });

    // Send notification
    setImmediate(() => {
      createNotification({
        userId: dependencyTask.assignedTo,
        title: "🔗 New Dependency Added",
        message: `Task "${task.title}" now depends on your task "${dependencyTask.title}"`,
        type: "info",
        category: "task_update",
        taskId: task._id,
        taskTitle: task.title,
        actionUrl: `/tasks/${task._id}`,
        metadata: {
          dependencyType: type,
          lag: lag,
        },
      }).catch(err => console.error("Notification error:", err));
    });

    res.json({
      success: true,
      message: "Dependency added successfully",
      data: updatedTask,
    });

  } catch (error) {
    console.error("❌ Add dependency error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// 🆕 REMOVE DEPENDENCY FROM TASK
// ============================================================
const removeDependency = async (req, res) => {
  try {
    const { id, dependencyId } = req.params;
    const user = req.user;

    console.log("🔗 removeDependency called:", { taskId: id, dependencyId });

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // Check permission
    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(user.role);
    const isAssignee = task.assignedTo && task.assignedTo.toString() === user._id.toString();
    const isProjectManager = user.role === "project_manager" && task.departmentId?.toString() === user.departmentId?.toString();

    if (!isAdmin && !isAssignee && !isProjectManager) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to remove dependencies from this task",
      });
    }

    // Check if dependency exists
    const dependency = task.dependencies?.find(
      (d) => d.taskId.toString() === dependencyId
    );

    if (!dependency) {
      return res.status(404).json({
        success: false,
        message: "Dependency not found",
      });
    }

    // Remove dependency
    const updatedTask = await Task.findByIdAndUpdate(
      id,
      {
        $pull: {
          dependencies: { taskId: dependencyId },
        },
        $pull: {
          dependents: dependencyId,
        },
      },
      { new: true }
    )
      .populate("assignedTo", "fullName email")
      .populate("assignedBy", "fullName email")
      .populate("projectId", "name code")
      .lean();

    // Remove from dependent's dependents array
    await Task.findByIdAndUpdate(dependencyId, {
      $pull: {
        dependents: id,
      },
    });

    res.json({
      success: true,
      message: "Dependency removed successfully",
      data: updatedTask,
    });

  } catch (error) {
    console.error("❌ Remove dependency error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// 🆕 GET TASK DEPENDENCIES
// ============================================================
// ============================================================
// 🆕 GET TASK DEPENDENCIES - FIXED
// ============================================================
const getTaskDependencies = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    console.log("🔗 getTaskDependencies called:", { taskId: id });

    const task = await Task.findById(id)
      .populate("assignedTo", "fullName email")
      .populate("assignedBy", "fullName email")
      .lean();

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // Check permission
    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(user.role);
    const isAssignee = task.assignedTo && task.assignedTo._id.toString() === user._id.toString();
    const isCreator = task.assignedBy && task.assignedBy._id.toString() === user._id.toString();

    if (!isAdmin && !isAssignee && !isCreator) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to view dependencies of this task",
      });
    }

    // Get predecessor tasks (tasks this task depends on)
    const predecessorIds = (task.dependencies || []).map(d => d.taskId);
    const predecessors = await Task.find({
      _id: { $in: predecessorIds },
    })
      .select("_id title status deadline priority")
      .lean();

    // Get dependent tasks (tasks that depend on this task)
    const dependents = await Task.find({
      "dependencies.taskId": task._id,
    })
      .select("_id title status deadline priority")
      .lean();

    // 🆕 Check dependency status - inline without calling external function
    let dependencyStatus = {
      isBlocked: false,
      blockedBy: [],
      allCompleted: true,
      progress: 100,
    };

    if (task.dependencies && task.dependencies.length > 0) {
      const predIds = task.dependencies.map(d => d.taskId);
      const preds = await Task.find({
        _id: { $in: predIds },
      }).lean();

      const blockedBy = [];
      let allCompleted = true;
      let totalProgress = 0;

      preds.forEach(pred => {
        const isCompleted = pred.status === "completed" || pred.status === "done";
        if (!isCompleted) {
          blockedBy.push({
            _id: pred._id,
            title: pred.title,
            status: pred.status,
            deadline: pred.deadline,
          });
          allCompleted = false;
        }
        totalProgress += pred.progress || 0;
      });

      const avgProgress = preds.length > 0
        ? Math.round(totalProgress / preds.length)
        : 100;

      dependencyStatus = {
        isBlocked: blockedBy.length > 0,
        blockedBy: blockedBy,
        allCompleted: allCompleted,
        progress: avgProgress,
        totalPredecessors: preds.length,
        completedPredecessors: preds.length - blockedBy.length,
      };
    }

    const response = {
      task: {
        _id: task._id,
        title: task.title,
        status: task.status,
        deadline: task.deadline,
      },
      predecessors: predecessors.map(p => ({
        ...p,
        dependencyType: task.dependencies?.find(d => d.taskId.toString() === p._id.toString())?.type || "FS",
        lag: task.dependencies?.find(d => d.taskId.toString() === p._id.toString())?.lag || 0,
      })),
      dependents: dependents,
      status: dependencyStatus,
      stats: {
        totalPredecessors: predecessors.length,
        totalDependents: dependents.length,
        totalDependencies: (task.dependencies || []).length,
        isBlocked: dependencyStatus.isBlocked,
        blockedBy: dependencyStatus.blockedBy,
      },
    };

    res.json({
      success: true,
      data: response,
    });

  } catch (error) {
    console.error("❌ Get task dependencies error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// 🆕 CHECK DEPENDENCY STATUS
// ============================================================
const checkDependencyStatus = async (task) => {
  if (!task || !task.dependencies || task.dependencies.length === 0) {
    return {
      isBlocked: false,
      blockedBy: [],
      allCompleted: true,
      progress: 100,
    };
  }

  const predecessorIds = task.dependencies.map(d => d.taskId);
  const predecessors = await Task.find({
    _id: { $in: predecessorIds },
  }).lean();

  const blockedBy = [];
  let allCompleted = true;
  let totalProgress = 0;

  predecessors.forEach(pred => {
    const isCompleted = pred.status === "completed" || pred.status === "done";
    if (!isCompleted) {
      blockedBy.push({
        _id: pred._id,
        title: pred.title,
        status: pred.status,
        deadline: pred.deadline,
      });
      allCompleted = false;
    }
    totalProgress += pred.progress || 0;
  });

  const avgProgress = predecessors.length > 0
    ? Math.round(totalProgress / predecessors.length)
    : 100;

  return {
    isBlocked: blockedBy.length > 0,
    blockedBy: blockedBy,
    allCompleted: allCompleted,
    progress: avgProgress,
    totalPredecessors: predecessors.length,
    completedPredecessors: predecessors.length - blockedBy.length,
  };
};

// ============================================================
// 🆕 GET PROJECT DEPENDENCY GRAPH
// ============================================================
const getProjectDependencyGraph = async (req, res) => {
  try {
    const { projectId } = req.params;
    const user = req.user;

    console.log("🔗 getProjectDependencyGraph called:", { projectId });

    // Check project access
    const project = await Project.findById(projectId).select("departmentId projectManager teamMembers").lean();
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(user.role);
    const isDeptManager = user.role === "dept_manager" && user.departmentId?.toString() === project.departmentId?.toString();
    const isProjectManager = project.projectManager?.toString() === user._id.toString();

    if (!isAdmin && !isDeptManager && !isProjectManager) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to view project dependencies",
      });
    }

    // Get all tasks with dependencies
    const tasks = await Task.find({ projectId })
      .select("_id title status deadline priority dependencies")
      .lean();

    // Build dependency graph
    const graph = {
      nodes: tasks.map(task => ({
        id: task._id,
        title: task.title,
        status: task.status,
        deadline: task.deadline,
        priority: task.priority,
        hasDependencies: task.dependencies && task.dependencies.length > 0,
        dependencyCount: task.dependencies?.length || 0,
      })),
      edges: [],
    };

    tasks.forEach(task => {
      if (task.dependencies && task.dependencies.length > 0) {
        task.dependencies.forEach(dep => {
          graph.edges.push({
            from: dep.taskId,
            to: task._id,
            type: dep.type || "FS",
            lag: dep.lag || 0,
          });
        });
      }
    });

    // Detect circular dependencies in graph
    const circularDependencies = await detectCircularDependenciesInGraph(graph);

    res.json({
      success: true,
      data: {
        graph,
        stats: {
          totalNodes: graph.nodes.length,
          totalEdges: graph.edges.length,
          hasCircularDependencies: circularDependencies.length > 0,
          circularDependencies: circularDependencies,
        },
      },
    });

  } catch (error) {
    console.error("❌ Get project dependency graph error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// 🆕 DETECT CIRCULAR DEPENDENCIES IN GRAPH
// ============================================================
const detectCircularDependenciesInGraph = async (graph) => {
  const visited = new Set();
  const recursionStack = new Set();
  const cycles = [];

  const buildAdjacencyList = () => {
    const adj = {};
    graph.edges.forEach(edge => {
      if (!adj[edge.from]) adj[edge.from] = [];
      adj[edge.from].push(edge.to);
    });
    return adj;
  };

  const adj = buildAdjacencyList();

  const dfs = (node, path = []) => {
    if (recursionStack.has(node)) {
      const cycleStart = path.indexOf(node);
      const cycle = path.slice(cycleStart).concat(node);
      cycles.push(cycle);
      return;
    }

    if (visited.has(node)) return;

    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const neighbors = adj[node] || [];
    for (const neighbor of neighbors) {
      dfs(neighbor, path);
    }

    recursionStack.delete(node);
    path.pop();
  };

  const nodes = graph.nodes.map(n => n.id);
  for (const node of nodes) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
};

// ============================================================
// 🆕 BULK ADD DEPENDENCIES
// ============================================================
const bulkAddDependencies = async (req, res) => {
  try {
    const { id } = req.params;
    const { dependencies } = req.body;
    const user = req.user;

    if (!dependencies || !Array.isArray(dependencies) || dependencies.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Dependencies array is required",
      });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // Check permission
    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(user.role);
    const isAssignee = task.assignedTo && task.assignedTo.toString() === user._id.toString();
    const isProjectManager = user.role === "project_manager" && task.departmentId?.toString() === user.departmentId?.toString();

    if (!isAdmin && !isAssignee && !isProjectManager) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to add dependencies to this task",
      });
    }

    // Validate each dependency
    const validationErrors = [];
    const validDependencies = [];

    for (const dep of dependencies) {
      if (!dep.taskId) {
        validationErrors.push("Each dependency must have a taskId");
        continue;
      }

      // Check if dependency already exists
      const existing = task.dependencies?.find(
        (d) => d.taskId.toString() === dep.taskId
      );

      if (existing) {
        validationErrors.push(`Dependency ${dep.taskId} already exists`);
        continue;
      }

      // Check if dep task exists
      const depTask = await Task.findById(dep.taskId);
      if (!depTask) {
        validationErrors.push(`Task ${dep.taskId} not found`);
        continue;
      }

      validDependencies.push({
        taskId: dep.taskId,
        type: dep.type || "FS",
        lag: dep.lag || 0,
        addedAt: new Date(),
      });
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        errors: validationErrors,
      });
    }

    // Check for circular dependencies
    const allDependencies = [...(task.dependencies || []), ...validDependencies];
    const circular = await task.checkCircularDependencies(id, allDependencies);

    if (circular) {
      return res.status(400).json({
        success: false,
        message: `Circular dependency detected: ${circular}`,
      });
    }

    // Add all dependencies
    const updatedTask = await Task.findByIdAndUpdate(
      id,
      {
        $push: {
          dependencies: { $each: validDependencies },
        },
        $addToSet: {
          dependents: { $each: validDependencies.map(d => d.taskId) },
        },
      },
      { new: true }
    )
      .populate("assignedTo", "fullName email")
      .populate("assignedBy", "fullName email")
      .populate("projectId", "name code")
      .lean();

    // Update dependents arrays
    for (const dep of validDependencies) {
      await Task.findByIdAndUpdate(dep.taskId, {
        $addToSet: {
          dependents: id,
        },
      });
    }

    res.json({
      success: true,
      message: `${validDependencies.length} dependencies added successfully`,
      data: updatedTask,
    });

  } catch (error) {
    console.error("❌ Bulk add dependencies error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// 🆕 GET DEPENDENCY CHAIN FOR TASK
// ============================================================
const getDependencyChain = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const task = await Task.findById(id).lean();
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // Check permission
    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(user.role);
    const isAssignee = task.assignedTo && task.assignedTo.toString() === user._id.toString();

    if (!isAdmin && !isAssignee) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to view dependency chain",
      });
    }

    const chain = await Task.getDependencyChain(id);

    res.json({
      success: true,
      data: chain,
    });

  } catch (error) {
    console.error("❌ Get dependency chain error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// 🆕 UPDATE DEPENDENCY TYPE
// ============================================================
const updateDependencyType = async (req, res) => {
  try {
    const { id, dependencyId } = req.params;
    const { type, lag } = req.body;
    const user = req.user;

    if (!type && lag === undefined) {
      return res.status(400).json({
        success: false,
        message: "Type or lag is required",
      });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // Check permission
    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(user.role);
    const isAssignee = task.assignedTo && task.assignedTo.toString() === user._id.toString();
    const isProjectManager = user.role === "project_manager" && task.departmentId?.toString() === user.departmentId?.toString();

    if (!isAdmin && !isAssignee && !isProjectManager) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to update dependencies",
      });
    }

    // Check if dependency exists
    const dependencyIndex = task.dependencies?.findIndex(
      (d) => d.taskId.toString() === dependencyId
    );

    if (dependencyIndex === -1 || dependencyIndex === undefined) {
      return res.status(404).json({
        success: false,
        message: "Dependency not found",
      });
    }

    // Update dependency
    const updateQuery = {};
    if (type) updateQuery[`dependencies.${dependencyIndex}.type`] = type;
    if (lag !== undefined) updateQuery[`dependencies.${dependencyIndex}.lag`] = lag;

    const updatedTask = await Task.findByIdAndUpdate(
      id,
      { $set: updateQuery },
      { new: true }
    )
      .populate("assignedTo", "fullName email")
      .populate("assignedBy", "fullName email")
      .populate("projectId", "name code")
      .lean();

    res.json({
      success: true,
      message: "Dependency updated successfully",
      data: updatedTask,
    });

  } catch (error) {
    console.error("❌ Update dependency error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// 🆕 GET DEPENDENCY STATISTICS
// ============================================================
const getDependencyStatistics = async (req, res) => {
  try {
    const user = req.user;

    let query = {};

    // Role-based filtering
    if (user.role === "employee") {
      query.assignedTo = user._id;
    } else if (user.role === "line_manager") {
      const teamMembers = await User.find({ managerId: user._id }).select("_id").lean();
      query.assignedTo = { $in: [...teamMembers.map((m) => m._id), user._id] };
    } else if (user.role === "dept_manager" || user.role === "project_manager") {
      query.departmentId = user.departmentId;
    }

    // Get all tasks with dependencies
    const tasks = await Task.find(query)
      .select("_id title status dependencies dependents")
      .lean();

    const stats = {
      totalTasks: tasks.length,
      tasksWithDependencies: tasks.filter(t => t.dependencies && t.dependencies.length > 0).length,
      totalDependencies: tasks.reduce((sum, t) => sum + (t.dependencies?.length || 0), 0),
      maxDependencies: Math.max(...tasks.map(t => t.dependencies?.length || 0), 0),
      avgDependencies: tasks.length > 0
        ? (tasks.reduce((sum, t) => sum + (t.dependencies?.length || 0), 0) / tasks.length).toFixed(2)
        : 0,
      dependencyTypes: {},
      blockedTasks: [],
    };

    // Count dependency types
    tasks.forEach(task => {
      if (task.dependencies) {
        task.dependencies.forEach(dep => {
          stats.dependencyTypes[dep.type] = (stats.dependencyTypes[dep.type] || 0) + 1;
        });
      }
    });

    // Find blocked tasks
    for (const task of tasks) {
      if (task.dependencies && task.dependencies.length > 0) {
        const status = await checkDependencyStatus(task);
        if (status.isBlocked) {
          stats.blockedTasks.push({
            _id: task._id,
            title: task.title,
            blockedBy: status.blockedBy,
          });
        }
      }
    }

    res.json({
      success: true,
      data: stats,
    });

  } catch (error) {
    console.error("❌ Get dependency statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

const reorderSingleTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { order, status } = req.body;

    if (order === undefined && !status) {
      return res.status(400).json({
        success: false,
        message: "Order or status is required",
      });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // Permission check
    const user = req.user;
    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(user.role);
    const isAssignee = task.assignedTo && task.assignedTo.toString() === user._id.toString();
    const isProjectManager = user.role === "project_manager" && task.departmentId?.toString() === user.departmentId?.toString();

    if (!isAdmin && !isAssignee && !isProjectManager) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to reorder this task",
      });
    }

    const updateData = {};
    if (order !== undefined) updateData.order = order;
    if (status) updateData.status = status;

    const updatedTask = await Task.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    )
      .populate("assignedTo", "fullName email")
      .populate("assignedBy", "fullName email")
      .populate("projectId", "name code")
      .lean();

    res.json({
      success: true,
      message: "Task reordered successfully",
      data: updatedTask,
    });
  } catch (error) {
    console.error("❌ Reorder single task error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};
// ============================================================
// 🆕 GET TASKS BY USER (for admin/manager reports)
// ============================================================
const getTasksByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = req.user;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Valid userId is required",
      });
    }

    // Permission: only admins/managers can look up another user's tasks.
    // Anyone can look up their own.
    const isSelf = userId === user._id.toString();
    const canViewOthers = [
      "super_admin",
      "admin",
      "hr_manager",
      "dept_manager",
      "project_manager",
      "line_manager",
    ].includes(user.role);

    if (!isSelf && !canViewOthers) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to view this user's tasks",
      });
    }

    const query = { assignedTo: userId };
    if (req.query.status) query.status = req.query.status;
    if (req.query.projectId) query.projectId = req.query.projectId;

    const tasks = await Task.find(query)
      .select("_id title description priority status deadline estimatedHours actualMinutes startDate projectId createdAt updatedAt evidenceUrls isMilestone parentTaskId progress subTaskCount completedSubTaskCount")
      .populate("assignedTo", "fullName email employeeId")
      .populate("assignedBy", "fullName email")
      .populate("projectId", "name code")
      .populate("parentTaskId", "title status")
      .sort({ startDate: 1, createdAt: 1 })
      .lean();

    // Also fetch the user info so the frontend has it in one call
    const targetUser = await User.findById(userId)
      .select("fullName email employeeId position department role")
      .populate("department", "name code")
      .lean();

    res.json({
      success: true,
      data: tasks,
      user: targetUser,
      count: tasks.length,
    });
  } catch (error) {
    console.error("❌ getTasksByUser error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};
// ============================================================
// EXPORT ALL CONTROLLERS
// ============================================================
module.exports = {
  getTasks,
  getMyTasks,
  getTaskById,
  createTask,
  updateTask,
  updateTaskStatus,
  submitEvidence,
  requestExtension,
  approveExtension,
  deleteTask,
  bulkCreateTasks,
  bulkCreateTasksWithoutProject,
  getTasksByProject,
  importTasksFromFile,
  reorderTasks,
  getProjectTasksSummary,
  getTaskStatistics,
  getExtensionRequests,
  notifyAssigneeOfRejection,
  notifyAssigneeOfApproval,
  startTaskTimer,
  pauseTaskTimer,
  resumeTaskTimer,
  completeTask,
  updateTaskTime,
  getTaskTime,
  getSubTasks,
  getMilestones,
  getTaskHierarchy,
  addDependency,
  removeDependency,
  getTaskDependencies,
  checkDependencyStatus,
  getProjectDependencyGraph,
  bulkAddDependencies,
  getDependencyChain,
  updateDependencyType,
  getDependencyStatistics,
  reorderSingleTask,
  getTasksByUser
};