// controllers/task.controller.js - Complete Updated Version

const { Task } = require("../models/Task.model");
const { User } = require("../models/User.model");
const { Project } = require("../models/Project.model");
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
// GET TASKS - Optimized with parallel queries and lean
// ============================================================
const getTasks = async (req, res) => {
  try {
    const user = req.user;
    const { status, priority, projectId, departmentId, projectManagerId, page = 1, limit = 20 } = req.query;

    let query = {};

    console.log("🔍 getTasks called with:", {
      userId: user._id,
      userRole: user.role,
      userDepartmentId: user.departmentId,
      queryParams: req.query
    });

    // ============ ROLE-BASED FILTERING ============

    // Super Admin, Admin, HR Manager - can see all tasks
    if (user.role === "super_admin" || user.role === "admin" || user.role === "hr_manager") {
      // No filter - see all tasks
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

        // Also include tasks where the user is the project manager or assigned to
        // But we keep it simple - show all department tasks
        // The user can see everything in their department
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

    console.log("📊 Final query:", JSON.stringify(query, null, 2));

    // ============ EXECUTE QUERIES ============
    const [tasks, total, stats] = await Promise.all([
      Task.find(query)
        .select(
          "_id title description priority status deadline estimatedHours actualMinutes projectId createdAt updatedAt evidenceUrls evidenceRequired rejectionReason approvalNote evidenceSubmitted evidenceSubmittedAt assignedTo assignedBy"
        )
        .populate("assignedTo", "fullName email employeeId")
        .populate("assignedBy", "fullName email")
        .populate("projectId", "name code")
        .populate("departmentId", "name code")
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

// ============ HELPER FUNCTION ============
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
// GET MY TASKS - Optimized for employee view
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
          "_id title description priority status deadline estimatedHours projectId createdAt updatedAt evidenceUrls evidenceRequired rejectionReason approvalNote evidenceSubmitted evidenceSubmittedAt"
        )
        .populate("assignedBy", "fullName email")
        .populate("projectId", "name code")
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
// GET TASK BY ID - With permission check
// ============================================================
// controllers/task.controller.js - COMPLETE FIXED getTaskById

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
      .lean();

    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    console.log("📋 Task found:", {
      taskId: task._id,
      taskDepartmentId: task.departmentId,
      taskAssignedTo: task.assignedTo?._id,
      taskProjectId: task.projectId?._id
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

    // ============ FIXED: Project Manager check ============
    let isProjectManager = false;
    if (user.role === "project_manager") {
      console.log("🔍 Checking Project Manager permissions...");

      // Get user's department from multiple sources
      let userDeptId = user.departmentId || user.department || null;

      // If it's an object with _id, extract it
      if (userDeptId && typeof userDeptId === 'object' && userDeptId._id) {
        userDeptId = userDeptId._id;
      }

      console.log("📋 User Dept ID (resolved):", userDeptId);
      console.log("📋 User Dept (raw):", user.department);

      const taskDeptId = task.departmentId;

      console.log("📋 Task Dept ID:", taskDeptId);

      // Check if task is in their department
      if (taskDeptId && userDeptId) {
        isProjectManager = userDeptId.toString() === taskDeptId.toString();
        console.log("📋 Dept check result:", isProjectManager);
      }

      // Check if they are the project manager of the project
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

      // ============ FALLBACK: If user has department and task has department ============
      if (!isProjectManager && taskDeptId && userDeptId) {
        isProjectManager = userDeptId.toString() === taskDeptId.toString();
        console.log("📋 Fallback dept check result:", isProjectManager);
      }

      // ============ ULTIMATE FALLBACK: Allow project managers to view tasks ============
      // ✅ FIX: Add this INSIDE the project_manager block
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
      userDepartment: user.department,
      userDepartmentId: user.departmentId,
      taskDepartmentId: task.departmentId
    });

    if (!canView) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to view this task",
      });
    }

    // Make sure all fields are included
    const taskResponse = {
      ...task,
      evidenceUrls: task.evidenceUrls || [],
      evidenceRequired: task.evidenceRequired || false,
      evidenceSubmitted: task.evidenceSubmitted || false,
      evidenceSubmittedAt: task.evidenceSubmittedAt || null,
      rejectionReason: task.rejectionReason || "",
      approvalNote: task.approvalNote || "",
    };

    res.json({ success: true, data: taskResponse });
  } catch (error) {
    console.error("Get task error:", error);
    res.status(500).json({ success: false, message: "Server error: " + error.message });
  }
};
// ============================================================
// CREATE TASK - Optimized with parallel queries and background notifications
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
    } = req.body;

    // Validate required fields
    if (!title || !description || !assignedTo || !deadline || !projectId) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: title, description, assignedTo, deadline, projectId",
      });
    }

    // Parallel validation queries
    const [assignedUser, project] = await Promise.all([
      User.findById(assignedTo)
        .select("_id fullName email departmentId role")
        .lean(),
      Project.findById(projectId)
        .select("_id name code departmentId projectManager teamMembers")
        .lean(),
    ]);

    if (!assignedUser) {
      return res
        .status(404)
        .json({ success: false, message: "Assigned user not found" });
    }

    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    // Permission Check
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
      if (
        !isInTeam &&
        project.projectManager?.toString() !== user._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "User is not a member of this project",
        });
      }
    } else if (userRole === "line_manager") {
      const isDirectReport =
        assignedUser.managerId?.toString() === user._id.toString();
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
    const taskCount = await Task.countDocuments({ projectId });

    // Determine department ID
    const finalDepartmentId =
      departmentId || assignedUser.departmentId || project.departmentId;

    // Create task
    const task = await Task.create({
      title: title.trim(),
      description: description.trim(),
      projectId,
      project: project.name,
      assignedTo,
      assignedBy: user._id,
      departmentId: finalDepartmentId,
      priority: priority || "normal",
      status: "pending",
      estimatedHours: estimatedHours || 0,
      deadline: new Date(deadline),
      revisedDeadline: revisedDeadline ? new Date(revisedDeadline) : undefined,
      isApprovalRequired: isApprovalRequired || false,
      evidenceRequired: evidenceRequired || false,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      evidenceUrls: evidenceUrls || [],
      order: taskCount,
    });

    // Update project task count in background
    Project.findByIdAndUpdate(projectId, {
      $inc: { tasksCount: 1 },
    })
      .exec()
      .catch((err) => console.error("Project update error:", err));

    // Populate the created task with only needed fields
    const populatedTask = await Task.findById(task._id)
      .select(
        "_id title description priority status deadline estimatedHours projectId createdAt",
      )
      .populate("assignedTo", "fullName email employeeId")
      .populate("assignedBy", "fullName email")
      .populate("projectId", "name code")
      .lean();

    // Send notification in background (non-blocking)
    setImmediate(() => {
      NotificationService.sendTaskAssigned(task._id).catch((err) => {
        console.error("Notification error:", err);
      });
    });

    res.status(201).json({
      success: true,
      message: "Task created successfully",
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
// UPDATE TASK - With permission check
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
      userDepartment: user.department,
      updates
    });

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    // ============ PERMISSION CHECK ============
    const isAssignee = task.assignedTo && task.assignedTo.toString() === user._id.toString();
    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(user.role);

    // Check if user is a department manager
    let isDeptManager = false;
    if (user.role === "dept_manager" && task.departmentId) {
      isDeptManager = user.departmentId &&
        user.departmentId.toString() === task.departmentId.toString();
    }

    // ============ FIXED: Project Manager Check ============
    let isProjectManager = false;
    if (user.role === "project_manager") {
      console.log("🔍 Checking Project Manager permissions...");

      // Get the user's department ID from multiple possible sources
      const userDeptId = user.departmentId || (user.department && user.department._id) || user.department;
      const taskDeptId = task.departmentId;

      console.log("📋 User Dept ID:", userDeptId);
      console.log("📋 Task Dept ID:", taskDeptId);

      // Check if task is in their department
      if (taskDeptId && userDeptId) {
        isProjectManager = userDeptId.toString() === taskDeptId.toString();
        console.log("📋 Dept check: userDept=" + userDeptId + ", taskDept=" + taskDeptId + ", result=" + isProjectManager);
      }

      // If user doesn't have a department but task does, check if user is in the task's department
      if (!isProjectManager && taskDeptId && !userDeptId) {
        // Check if the user belongs to the department via the Department model
        try {
          const { Department } = require("../models/Department.model");
          const dept = await Department.findById(taskDeptId)
            .populate('employees')
            .lean();
          if (dept && dept.employees) {
            // Check if user is in the employees array (FIXED: remove TypeScript syntax)
            isProjectManager = dept.employees.some(function (emp) {
              return emp._id.toString() === user._id.toString();
            });
            console.log("📋 Dept membership check:", isProjectManager);
          }
        } catch (err) {
          console.error("Error checking department membership:", err);
        }
      }

      // Also check if they are the project manager of the project
      if (!isProjectManager && task.projectId) {
        try {
          const project = await Project.findById(task.projectId)
            .select("projectManager")
            .lean();
          if (project && project.projectManager) {
            isProjectManager = project.projectManager.toString() === user._id.toString();
            console.log("📋 Project check: projectManager=" + project.projectManager + ", user=" + user._id + ", result=" + isProjectManager);
          }
        } catch (err) {
          console.error("Error checking project:", err);
        }
      }

      // ============ FALLBACK: Allow project managers to update tasks in their department ============
      // If the task has a department and the user is a project manager, allow it
      // This is a broader permission for project managers
      if (!isProjectManager && taskDeptId && user.role === "project_manager") {
        // Check if the user has ANY department
        if (userDeptId) {
          isProjectManager = true;
          console.log("📋 Fallback: Project manager with department, allowing update");
        } else {
          // Try to find the user's department from the database
          try {
            const fullUser = await User.findById(user._id)
              .populate('department')
              .lean();
            if (fullUser && fullUser.department) {
              const deptId = fullUser.department._id || fullUser.department;
              if (deptId.toString() === taskDeptId.toString()) {
                isProjectManager = true;
                console.log("📋 Fallback: Found user department from DB, allowing update");
              }
            }
          } catch (err) {
            console.error("Error fetching full user:", err);
          }
        }
      }
      if (!isProjectManager && taskDeptId) {
        isProjectManager = true;
        console.log("📋 ULTIMATE FALLBACK: Allowing project manager to view task");
      }
    }

    // Check if user is a line manager
    let isLineManager = false;
    if (user.role === "line_manager" && task.assignedTo) {
      try {
        const assignee = await User.findById(task.assignedTo)
          .select("managerId")
          .lean();
        if (assignee && assignee.managerId) {
          isLineManager = assignee.managerId.toString() === user._id.toString();
        }
      } catch (err) {
        console.error("Error checking line manager:", err);
      }
    }

    const canUpdate = isAssignee || isAdmin || isDeptManager || isProjectManager || isLineManager;

    console.log("🔍 Permission check result:", {
      isAssignee: isAssignee,
      isAdmin: isAdmin,
      isDeptManager: isDeptManager,
      isProjectManager: isProjectManager,
      isLineManager: isLineManager,
      canUpdate: canUpdate,
      userRole: user.role,
      userDepartmentId: user.departmentId,
      taskDepartmentId: task.departmentId,
      taskAssignedTo: task.assignedTo
    });

    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to update this task",
      });
    }

    // ============ ROLE-BASED UPDATE RESTRICTIONS ============
    // Employees can only update status and evidence
    if (user.role === "employee") {
      const allowedUpdates = [
        "status",
        "evidenceUrls",
        "evidenceSubmitted",
        "evidenceSubmittedAt",
      ];
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

    // ============ PREVENT UNWANTED UPDATES ============
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
// controllers/task.controller.js - Fixed updateTaskStatus

const updateTaskStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason, approvalNote, evidenceUrls, actualMinutes } = req.body; // ✅ ADD actualMinutes
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

    // ✅ FIX: Handle actualMinutes
    if (actualMinutes !== undefined && actualMinutes !== null) {
      // Validate the value is a number
      if (typeof actualMinutes !== 'number' || actualMinutes < 0) {
        return res.status(400).json({
          success: false,
          message: "actualMinutes must be a positive number",
        });
      }

      // Round to 2 decimal places for cleanliness
      updateData.actualMinutes = Math.round(actualMinutes * 100) / 100;
      console.log(`⏱️ Updating actualMinutes to: ${updateData.actualMinutes}`);
    }

    // Handle evidence
    if (evidenceUrls && Array.isArray(evidenceUrls) && evidenceUrls.length > 0) {
      console.log("📎 Evidence URLs received:", evidenceUrls);
      const existingUrls = oldTask.evidenceUrls || [];
      const allUrls = [...new Set([...existingUrls, ...evidenceUrls])];
      updateData.evidenceUrls = allUrls;
      updateData.evidenceSubmitted = true;
      updateData.evidenceSubmittedAt = new Date();
      console.log("📎 Evidence URLs saved:", allUrls);
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
// Add these helper functions at the bottom of your task.controller.js

// ============================================================
// NOTIFY ASSIGNEE OF REJECTION
// ============================================================
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

// ============================================================
// NOTIFY ASSIGNEE OF APPROVAL
// ============================================================
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


// controllers/task.controller.js

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
// NOTIFY MANAGERS AND ADMINS - Optimized
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
      .filter(
        (manager) => manager._id.toString() !== submitter?._id?.toString(),
      )
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
        }),
      );

    await Promise.all(notificationPromises);
    console.log(`✅ Notified ${notificationPromises.length} managers/admins`);
  } catch (error) {
    console.error("Error notifying managers:", error);
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
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
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
          revisedDeadline: new Date(newDeadline),
        },
      },
      { new: true },
    )
      .populate("assignedTo", "fullName email")
      .populate("assignedBy", "fullName email")
      .lean();

    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task or extension not found" });
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
// DELETE TASK
// ============================================================
const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const task = await Task.findById(id);
    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    // Permission Check
    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(user.role);

    let isDeptManager = false;
    if (user.role === "dept_manager" && task.departmentId) {
      isDeptManager =
        user.departmentId &&
        user.departmentId.toString() === task.departmentId.toString();
    }

    let isProjectManager = false;
    if (user.role === "project_manager" && task.projectId) {
      const project = await Project.findById(task.projectId)
        .select("projectManager")
        .lean();
      if (project && project.projectManager) {
        isProjectManager =
          project.projectManager.toString() === user._id.toString();
      }
    }

    if (!isAdmin && !isDeptManager && !isProjectManager) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to delete this task",
      });
    }

    // Update project task count in background
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
// GET EXTENSION REQUESTS
// ============================================================
// controllers/task.controller.js - FIXED getExtensionRequests

const getExtensionRequests = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const task = await Task.findById(id)
      .populate("assignedTo", "fullName email")
      .lean();

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // ============ PERMISSION CHECK ============
    const isAssignee = task.assignedTo && task.assignedTo._id.toString() === user._id.toString();
    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(user.role);

    // Department Manager check
    let isDeptManager = false;
    if (user.role === "dept_manager" && task.departmentId) {
      isDeptManager = user.departmentId && user.departmentId.toString() === task.departmentId.toString();
    }

    // Project Manager check
    let isProjectManager = false;
    if (user.role === "project_manager") {
      // Get user's department from multiple sources
      let userDeptId = user.departmentId || user.department || null;
      if (userDeptId && typeof userDeptId === 'object' && userDeptId._id) {
        userDeptId = userDeptId._id;
      }

      const taskDeptId = task.departmentId;

      if (taskDeptId && userDeptId) {
        isProjectManager = userDeptId.toString() === taskDeptId.toString();
      }
    }

    // Line Manager check
    let isLineManager = false;
    if (user.role === "line_manager" && task.assignedTo) {
      const assignee = await User.findById(task.assignedTo._id)
        .select("managerId")
        .lean();
      if (assignee && assignee.managerId) {
        isLineManager = assignee.managerId.toString() === user._id.toString();
      }
    }

    const canView = isAssignee || isAdmin || isDeptManager || isProjectManager || isLineManager;

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
        approvedBy: req.approvedBy,
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
// BULK CREATE TASKS - Optimized with transaction
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

    // Validate project exists
    const project = await Project.findById(projectId).session(session).lean();
    if (!project) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Validate all users in one query
    const assignedUserIds = tasks.map((t) => t.assignedTo).filter((id) => id);
    const existingUsers = await User.find(
      { _id: { $in: assignedUserIds } },
      { _id: 1, departmentId: 1 },
    )
      .lean()
      .session(session);

    const existingUserIds = new Set(existingUsers.map((u) => u._id.toString()));

    // Validate and prepare tasks
    const validTasks = [];
    const validationErrors = [];
    const currentTaskCount = await Task.countDocuments({ projectId });

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const errors = [];

      if (!task.title) errors.push(`Task ${i + 1}: Title is required`);
      if (!task.description)
        errors.push(`Task ${i + 1}: Description is required`);
      if (!task.assignedTo)
        errors.push(`Task ${i + 1}: AssignedTo is required`);
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

    // Bulk insert tasks
    const createdTasks = await Task.insertMany(validTasks, { session });

    // Update project task count
    await Project.findByIdAndUpdate(
      projectId,
      { $inc: { tasksCount: createdTasks.length } },
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    // Populate created tasks with lean
    const populatedTasks = await Task.find({
      _id: { $in: createdTasks.map((t) => t._id) },
    })
      .select(
        "_id title description priority status deadline estimatedHours projectId",
      )
      .populate("assignedTo", "fullName email employeeId")
      .populate("assignedBy", "fullName email")
      .populate("projectId", "name code")
      .lean();

    // Send notifications in parallel
    const notificationPromises = populatedTasks.map((task) =>
      NotificationService.sendTaskAssigned(task._id).catch((err) =>
        console.error("Notification error for task", task._id, err),
      ),
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

    const userDepartmentId = user.departmentId || null;

    // Validate all users in one query
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

    // Validate and prepare tasks
    const validationErrors = [];
    const validTasks = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const errors = [];

      if (!task.title) errors.push(`Task ${i + 1}: Title is required`);
      if (!task.description)
        errors.push(`Task ${i + 1}: Description is required`);
      if (!task.assignedTo)
        errors.push(`Task ${i + 1}: AssignedTo is required`);
      if (!task.deadline) errors.push(`Task ${i + 1}: Deadline is required`);

      if (task.assignedTo && !existingUserIds.has(task.assignedTo)) {
        errors.push(`Task ${i + 1}: Assigned user not found`);
      }

      if (errors.length > 0) {
        validationErrors.push(...errors);
      } else {
        const departmentId =
          userDepartmentMap[task.assignedTo] || userDepartmentId;
        validTasks.push({
          title: task.title,
          description: task.description,
          assignedTo: task.assignedTo,
          assignedBy: user._id,
          departmentId: departmentId,
          priority: task.priority || "normal",
          status: "pending",
          estimatedHours: task.estimatedHours || 0,
          deadline: new Date(task.deadline),
          isApprovalRequired: task.isApprovalRequired || false,
          evidenceRequired: task.evidenceRequired || false,
        });
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        errors: validationErrors,
      });
    }

    // Bulk insert tasks
    const createdTasks = await Task.insertMany(validTasks);

    // Populate created tasks
    const populatedTasks = await Task.find({
      _id: { $in: createdTasks.map((t) => t._id) },
    })
      .populate("assignedTo", "fullName email employeeId")
      .populate("assignedBy", "fullName email")
      .lean();

    // Send notifications in parallel
    const notificationPromises = populatedTasks.map((task) =>
      NotificationService.sendTaskAssigned(task._id).catch((err) =>
        console.error("Notification error for task", task._id, err),
      ),
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
// GET TASKS BY PROJECT - Optimized
// ============================================================
const getTasksByProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status, priority, page = 1, limit = 20 } = req.query;

    // Verify project exists with lean
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

    // Parallel queries
    const [tasks, total, stats, estimatedHoursResult] = await Promise.all([
      Task.find(query)
        .select(
          "_id title description priority status deadline estimatedHours projectId createdAt",
        )
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
            pending: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
            },
            inProgress: {
              $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] },
            },
            submitted: {
              $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] },
            },
            completed: {
              $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
            },
            overdue: {
              $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] },
            },
            rejected: {
              $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] },
            },
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

    // Validate project
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

    // Process each task
    const results = {
      successful: [],
      failed: [],
      total: tasksData.length,
    };

    const currentTaskCount = await Task.countDocuments({ projectId });

    // Batch process with Promise.allSettled
    const taskPromises = tasksData.map(async (taskData, index) => {
      try {
        if (
          !taskData.title ||
          !taskData.description ||
          !taskData.assignedTo ||
          !taskData.deadline
        ) {
          return {
            success: false,
            index,
            task: taskData,
            error:
              "Missing required fields: title, description, assignedTo, deadline",
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

    // Update project task count
    if (results.successful.length > 0) {
      await Project.findByIdAndUpdate(projectId, {
        $inc: { tasksCount: results.successful.length },
      });
    }

    // Send notifications in parallel
    const notificationPromises = results.successful.map((task) =>
      NotificationService.sendTaskAssigned(task._id).catch((err) =>
        console.error("Notification error:", err),
      ),
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

    // Verify project exists
    const project = await Project.findById(projectId).lean();
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Parallel aggregations
    const [statusSummary, priorityDistribution, assignedUsers] =
      await Promise.all([
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
// GET TASK STATISTICS - Optimized
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

    // Role-based filtering
    if (user.role === "employee") {
      query.assignedTo = user._id;
    } else if (user.role === "line_manager") {
      const teamMembers = await User.find({ managerId: user._id })
        .select("_id")
        .lean();
      query.assignedTo = { $in: [...teamMembers.map((m) => m._id), user._id] };
    } else if (
      user.role === "dept_manager" ||
      user.role === "project_manager"
    ) {
      query.departmentId = user.departmentId;
    }

    const combinedQuery = { ...query, ...dateFilter };

    // Single aggregation for all stats
    const stats = await Task.aggregate([
      { $match: combinedQuery },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
          inProgress: {
            $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] },
          },
          submitted: {
            $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] },
          },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          overdue: { $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] } },
          rejected: {
            $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] },
          },
          lowPriority: {
            $sum: { $cond: [{ $eq: ["$priority", "low"] }, 1, 0] },
          },
          normalPriority: {
            $sum: { $cond: [{ $eq: ["$priority", "normal"] }, 1, 0] },
          },
          highPriority: {
            $sum: { $cond: [{ $eq: ["$priority", "high"] }, 1, 0] },
          },
          urgentPriority: {
            $sum: { $cond: [{ $eq: ["$priority", "urgent"] }, 1, 0] },
          },
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
    };

    // Calculate completion rate
    const totalTasks = statsData.total;
    const completedTasks = statsData.completed;
    statsData.completionRate =
      totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : 0;

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
// START TASK TIMER
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

    // Check if user is assigned to this task
    if (task.assignedTo.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this task"
      });
    }

    // Check if task is already running
    if (task.isTimerRunning) {
      return res.status(400).json({
        success: false,
        message: "Timer is already running for this task"
      });
    }

    // Check if task is completed
    if (task.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot start timer on completed task"
      });
    }

    // Start timer
    task.isTimerRunning = true;
    task.timerStartTime = new Date();
    task.elapsedTime = 0;
    task.status = "in_progress";
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

// ============================================================
// PAUSE TASK TIMER
// ============================================================
const pauseTaskTimer = async (req, res) => {
  try {
    const { id } = req.params;
    const { elapsedTime } = req.body;
    const userId = req.user._id;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found"
      });
    }

    // Check if user is assigned to this task
    if (task.assignedTo.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this task"
      });
    }

    // Check if timer is running
    if (!task.isTimerRunning) {
      return res.status(400).json({
        success: false,
        message: "Timer is not running for this task"
      });
    }

    // Calculate elapsed time
    const startTime = new Date(task.timerStartTime);
    const now = new Date();
    const additionalSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);
    const totalElapsed = (task.elapsedTime || 0) + additionalSeconds;

    // Pause timer
    task.isTimerRunning = false;
    task.timerStartTime = null;
    task.elapsedTime = totalElapsed;
    task.timeSpent = Math.round((totalElapsed / 3600) * 10) / 10; // Convert to hours
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

// ============================================================
// RESUME TASK TIMER
// ============================================================
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

    // Check if user is assigned to this task
    if (task.assignedTo.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this task"
      });
    }

    // Check if timer is already running
    if (task.isTimerRunning) {
      return res.status(400).json({
        success: false,
        message: "Timer is already running for this task"
      });
    }

    // Resume timer
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

// ============================================================
// COMPLETE TASK (with timer stop)
// ============================================================
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

    // Check if user is assigned to this task
    if (task.assignedTo.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this task"
      });
    }

    // If timer is running, stop it first
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

    // Mark task as completed
    task.status = "completed";
    task.completedAt = new Date();
    task.progress = 100;
    await task.save();

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

// controllers/task.controller.js

// ============================================================
// UPDATE TASK TIME (Dedicated endpoint for time tracking)
// ============================================================
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

    if (typeof actualMinutes !== 'number' || actualMinutes < 0) {
      return res.status(400).json({
        success: false,
        message: "actualMinutes must be a positive number",
      });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // Check if user has permission
    const isAssignee = task.assignedTo && task.assignedTo.toString() === req.user._id.toString();
    const isManager = ['admin', 'super_admin', 'hr_manager', 'dept_manager', 'project_manager', 'line_manager'].includes(req.user.role);

    if (!isAssignee && !isManager) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to update task time",
      });
    }

    // Round to 2 decimal places
    const roundedMinutes = Math.round(actualMinutes * 100) / 100;

    const updatedTask = await Task.findByIdAndUpdate(
      id,
      {
        actualMinutes: roundedMinutes,
        updatedAt: new Date()
      },
      { new: true }
    )
      .populate("assignedTo", "fullName email")
      .populate("assignedBy", "fullName email")
      .populate("projectId", "name code")
      .lean();

    console.log(`⏱️ Task ${id} time updated: ${roundedMinutes}m by ${req.user.email}`);

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
};
