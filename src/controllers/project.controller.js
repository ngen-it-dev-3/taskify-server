// controllers/project.controller.js
const { Project } = require("../models/Project.model");
const { User } = require("../models/User.model");

// ============================================================
// GET ALL PROJECTS
// ============================================================
const getProjects = async (req, res) => {
  try {
    const { status, priority, departmentId, managerId, search } = req.query;

    // Build filter
    const filter = {};

    // 🔥 FIX: Only filter by isActive if NOT requesting archived
    if (status === 'archived') {
      // Show archived projects regardless of isActive
      filter.status = 'archived';
    } else {
      // For non-archived, only show active projects
      filter.isActive = true;
      if (status) filter.status = status;
    }

    if (priority) filter.priority = priority;
    if (departmentId) filter.departmentId = departmentId;
    if (managerId) filter.managerId = managerId;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const projects = await Project.find(filter)
      .populate('managerId', 'fullName email role')
      .populate('departmentId', 'name code')
      .populate('createdBy', 'fullName email')
      .populate('teamMembers.userId', 'fullName email role')
      .populate('archivedBy', 'fullName email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: projects
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch projects',
      error: error.message
    });
  }
};

// ============================================================
// GET PROJECT BY ID
// ============================================================
const getProjectById = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await Project.findById(id)
      .populate('managerId', 'fullName email role')
      .populate('departmentId', 'name code')
      .populate('createdBy', 'fullName email')
      .populate('teamMembers.userId', 'fullName email role') // Populate team members
      .populate('archivedBy', 'fullName email');

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    res.status(200).json({
      success: true,
      data: project
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project',
      error: error.message
    });
  }
};

// ============================================================
// CREATE PROJECT
// ============================================================
const createProject = async (req, res) => {
  try {
    const {
      name,
      code,
      description,
      departmentId,
      managerId,
      startDate,
      endDate,
      priority,
      budget,
    } = req.body;

    // Check if project code exists
    const existingProject = await Project.findOne({ code: code.toUpperCase() });
    if (existingProject) {
      return res
        .status(400)
        .json({ success: false, message: "Project code already exists" });
    }

    const project = await Project.create({
      name,
      code: code.toUpperCase(),
      description: description || "",
      departmentId: departmentId || null,
      managerId: managerId || null,
      createdBy: req.user._id,
      startDate,
      endDate,
      priority: priority || "normal",
      status: "active",
      budget: { allocated: budget || 0, spent: 0, currency: "USD" },
      progress: 0,
      tasksCount: 0,
      completedTasks: 0,
      isActive: true,
    });

    const populatedProject = await Project.findById(project._id)
      .populate("departmentId", "name code")
      .populate("managerId", "fullName email")
      .populate("createdBy", "fullName email");

    res.status(201).json({
      success: true,
      message: "Project created successfully",
      data: populatedProject,
    });
  } catch (error) {
    console.error("Create project error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
};

// ============================================================
// UPDATE PROJECT
// ============================================================
const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const project = await Project.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    )
      .populate("departmentId", "name code")
      .populate("managerId", "fullName email")
      .populate("createdBy", "fullName email");

    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    res.json({
      success: true,
      message: "Project updated successfully",
      data: project,
    });
  } catch (error) {
    console.error("Update project error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// DELETE PROJECT (Soft Delete)
// ============================================================
const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    const project = await Project.findByIdAndUpdate(id, { isActive: false });

    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    res.json({ success: true, message: "Project deleted successfully" });
  } catch (error) {
    console.error("Delete project error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// UPDATE PROJECT PROGRESS
// ============================================================
const updateProjectProgress = async (req, res) => {
  try {
    const { id } = req.params;
    const { progress, completedTasks, tasksCount } = req.body;

    const project = await Project.findByIdAndUpdate(
      id,
      { progress, completedTasks, tasksCount },
      { new: true },
    );

    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    if (progress === 100 && project.status !== "completed") {
      project.status = "completed";
      project.completedAt = new Date();
      await project.save();
    }

    res.json({
      success: true,
      message: "Project progress updated",
      data: project,
    });
  } catch (error) {
    console.error("Update progress error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// ARCHIVE PROJECT
// ============================================================
// ============================================================
// ARCHIVE PROJECT - FIXED
// ============================================================
const archiveProject = async (req, res) => {
  try {
    const projectId = req.params.id;

    // Get the project
    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found"
      });
    }

    // Check if already archived
    if (project.status === "archived") {
      return res.status(400).json({
        success: false,
        message: "Project is already archived"
      });
    }

    // 🔥 CRITICAL: Prepare update data - DO NOT set isActive to false
    const updateData = {
      status: "archived",
      archivedAt: new Date(),
      archivedBy: req.user._id,
      // 🔥 IMPORTANT: Keep isActive as true so it can be found
      isActive: true
    };

    // Ensure budget is an object
    if (project.budget === undefined || project.budget === null) {
      updateData.budget = { allocated: 0, spent: 0, currency: "USD" };
    } else if (typeof project.budget === 'number') {
      updateData.budget = {
        allocated: project.budget || 0,
        spent: 0,
        currency: "USD"
      };
    } else if (typeof project.budget === 'object' && project.budget !== null) {
      updateData.budget = {
        allocated: project.budget.allocated || 0,
        spent: project.budget.spent || 0,
        currency: project.budget.currency || "USD"
      };
    }

    // Use $set to update the document
    const updatedProject = await Project.findByIdAndUpdate(
      projectId,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate('managerId', 'fullName email role')
      .populate('departmentId', 'name code')
      .populate('createdBy', 'fullName email')
      .populate('teamMembers.userId', 'fullName email role')
      .populate('archivedBy', 'fullName email');

    if (!updatedProject) {
      return res.status(404).json({
        success: false,
        message: "Project not found after update"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Project archived successfully",
      data: updatedProject
    });

  } catch (error) {
    console.error("Error archiving project:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to archive project"
    });
  }
};

// ============================================================
// UNARCHIVE PROJECT
// ============================================================
const unarchiveProject = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await Project.findById(id);
    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    if (project.status !== "archived") {
      return res.status(400).json({
        success: false,
        message: "Project is not archived",
      });
    }

    project.status = "active";
    project.archivedAt = null;
    project.archivedBy = null;
    await project.save();

    const populatedProject = await Project.findById(project._id)
      .populate("departmentId", "name code")
      .populate("managerId", "fullName email")
      .populate("createdBy", "fullName email");

    res.json({
      success: true,
      message: "Project restored from archive",
      data: populatedProject,
    });
  } catch (error) {
    console.error("Unarchive project error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// GET PROJECT TEMPLATES (Mock Data)
// ============================================================
const getProjectTemplates = async (req, res) => {
  const templates = [
    {
      _id: "1",
      name: "Software Development Project",
      description: "Complete software development lifecycle template",
      category: "Development",
      estimatedDuration: 90,
      taskCount: 25,
      usageCount: 156,
      isFeatured: true,
    },
    {
      _id: "2",
      name: "Marketing Campaign",
      description: "Template for marketing campaigns",
      category: "Marketing",
      estimatedDuration: 30,
      taskCount: 15,
      usageCount: 89,
      isFeatured: true,
    },
    {
      _id: "3",
      name: "Product Launch",
      description: "Complete product launch template",
      category: "Product",
      estimatedDuration: 45,
      taskCount: 32,
      usageCount: 67,
      isFeatured: false,
    },
  ];

  res.json({ success: true, data: templates });
};

// ============================================================
// GET PROJECT RESOURCES (Mock Data)
// ============================================================
const getProjectResources = async (req, res) => {
  const resources = [
    {
      _id: "1",
      name: "John Smith",
      type: "human",
      assignedTo: { _id: "1", fullName: "John Smith" },
      projectId: { _id: "1", name: "Website Redesign" },
      startDate: "2024-01-01",
      endDate: "2024-06-30",
      status: "in_use",
      utilization: 85,
    },
    {
      _id: "2",
      name: "AWS Server",
      type: "equipment",
      assignedTo: null,
      projectId: { _id: "2", name: "Cloud Migration" },
      startDate: "2024-02-01",
      endDate: "2024-12-31",
      status: "in_use",
      utilization: 60,
    },
  ];

  res.json({ success: true, data: resources });
};

// ============================================================
// PROJECT DASHBOARD - BURNDOWN CHART
// ============================================================
const getProjectBurndown = async (req, res) => {
  try {
    const { id } = req.params;
    const { range = "month" } = req.query;

    const project = await Project.findById(id);
    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    // Get all tasks for this project - try to import Task dynamically
    let tasks = [];
    try {
      const { Task } = require("../models/Task.model");
      tasks = await Task.find({ projectId: id })
        .select("createdAt status deadline")
        .sort({ createdAt: 1 })
        .lean();
    } catch (error) {
      console.warn("Task model not found, using empty tasks array");
    }

    // Calculate date range
    const startDate = new Date(project.startDate);
    const endDate = new Date(project.endDate);
    const now = new Date();

    // Determine range
    let rangeStart = startDate;
    if (range === "week") {
      rangeStart = new Date(now);
      rangeStart.setDate(rangeStart.getDate() - 7);
    } else if (range === "month") {
      rangeStart = new Date(now);
      rangeStart.setMonth(rangeStart.getMonth() - 1);
    }

    // Generate dates for the range
    const dates = [];
    let currentDate = new Date(rangeStart);
    const endRange = range === "all" ? endDate : now;

    while (currentDate <= endRange) {
      dates.push({
        date: new Date(currentDate),
        dateStr: currentDate.toISOString().split("T")[0],
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // If no dates or no tasks, return empty data
    if (dates.length === 0 || tasks.length === 0) {
      return res.json({
        success: true,
        data: [],
      });
    }

    // Calculate total tasks
    const totalTasks = tasks.length;

    // Build burndown data
    const burndownData = dates.map(({ date, dateStr }, index) => {
      // Tasks completed up to this date
      const completedTasks = tasks.filter(
        (t) => t.status === "completed" && new Date(t.createdAt) <= date,
      ).length;

      // Tasks created up to this date
      const createdTasks = tasks.filter(
        (t) => new Date(t.createdAt) <= date,
      ).length;

      const remaining = Math.max(0, createdTasks - completedTasks);
      const idealRemaining = Math.max(
        0,
        totalTasks - (totalTasks / dates.length) * (index + 1),
      );

      return {
        date: dateStr,
        idealRemaining: Math.round(idealRemaining),
        actualRemaining: remaining,
        completed: completedTasks,
        total: totalTasks,
      };
    });

    res.json({
      success: true,
      data: burndownData,
    });
  } catch (error) {
    console.error("Get burndown error:", error);
    res.json({
      success: true,
      data: [],
    });
  }
};

// ============================================================
// PROJECT DASHBOARD - TASK STATISTICS
// ============================================================
const getProjectTaskStats = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await Project.findById(id);
    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    let tasks = [];
    try {
      const { Task } = require("../models/Task.model");
      tasks = await Task.find({ projectId: id })
        .populate("assignedTo", "fullName email")
        .lean();
    } catch (error) {
      console.warn("Task model not found, using empty tasks array");
    }

    // Calculate stats
    const stats = {
      total: tasks.length,
      completed: tasks.filter((t) => t.status === "completed").length,
      inProgress: tasks.filter((t) => t.status === "in_progress").length,
      pending: tasks.filter((t) => t.status === "pending").length,
      submitted: tasks.filter((t) => t.status === "submitted").length,
      overdue: tasks.filter((t) => t.status === "overdue").length,
      rejected: tasks.filter((t) => t.status === "rejected").length,
      byPriority: {
        low: tasks.filter((t) => t.priority === "low").length,
        normal: tasks.filter((t) => t.priority === "normal").length,
        high: tasks.filter((t) => t.priority === "high").length,
        urgent: tasks.filter((t) => t.priority === "urgent").length,
      },
      byAssignee: [],
    };

    // Group by assignee
    const assigneeMap = new Map();
    tasks.forEach((task) => {
      if (task.assignedTo) {
        const key = task.assignedTo._id.toString();
        if (!assigneeMap.has(key)) {
          assigneeMap.set(key, {
            userId: key,
            fullName: task.assignedTo.fullName,
            taskCount: 0,
            completedCount: 0,
            progress: 0,
          });
        }
        const data = assigneeMap.get(key);
        data.taskCount++;
        if (task.status === "completed") {
          data.completedCount++;
        }
      }
    });

    // Calculate progress for each assignee
    assigneeMap.forEach((data) => {
      data.progress =
        data.taskCount > 0
          ? Math.round((data.completedCount / data.taskCount) * 100)
          : 0;
      stats.byAssignee.push(data);
    });

    // Sort by task count descending
    stats.byAssignee.sort((a, b) => b.taskCount - a.taskCount);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Get task stats error:", error);
    res.json({
      success: true,
      data: {
        total: 0,
        completed: 0,
        inProgress: 0,
        pending: 0,
        submitted: 0,
        overdue: 0,
        rejected: 0,
        byPriority: { low: 0, normal: 0, high: 0, urgent: 0 },
        byAssignee: [],
      },
    });
  }
};

// ============================================================
// PROJECT DASHBOARD - ACTIVITIES
// ============================================================
const getProjectActivities = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 20 } = req.query;

    // Get project info for mock data
    const project = await Project.findById(id)
      .select("name createdAt updatedAt")
      .lean();

    // Return mock activities
    const activities = [
      {
        _id: "1",
        action: "created",
        description: `Project "${project?.name || "Unknown"}" was created`,
        userId: {
          _id: "system",
          fullName: "System",
          email: "system@example.com",
        },
        createdAt: project?.createdAt || new Date().toISOString(),
      },
      {
        _id: "2",
        action: "updated",
        description: "Project status is active",
        userId: {
          _id: "system",
          fullName: "System",
          email: "system@example.com",
        },
        createdAt: project?.updatedAt || new Date().toISOString(),
      },
    ];

    res.json({
      success: true,
      data: activities,
    });
  } catch (error) {
    console.error("Get activities error:", error);
    res.json({
      success: true,
      data: [
        {
          _id: "1",
          action: "created",
          description: "Project was created",
          userId: {
            _id: "system",
            fullName: "System",
            email: "system@example.com",
          },
          createdAt: new Date().toISOString(),
        },
      ],
    });
  }
};

// ============================================================
// PROJECT DASHBOARD - TEAM PERFORMANCE
// ============================================================
const getTeamPerformance = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await Project.findById(id)
      .populate("teamMembers.userId", "fullName email avatar")
      .lean();

    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    let tasks = [];
    try {
      const { Task } = require("../models/Task.model");
      tasks = await Task.find({ projectId: id })
        .populate("assignedTo", "fullName email")
        .lean();
    } catch (error) {
      console.warn("Task model not found, using empty tasks array");
    }

    // If no team members, return empty array
    if (!project.teamMembers || project.teamMembers.length === 0) {
      return res.json({
        success: true,
        data: [],
      });
    }

    const performance = project.teamMembers.map((member) => {
      const userId = member.userId._id.toString();
      const userTasks = tasks.filter(
        (t) => t.assignedTo && t.assignedTo._id.toString() === userId,
      );

      const completed = userTasks.filter(
        (t) => t.status === "completed",
      ).length;
      const total = userTasks.length;

      // Calculate average time for completed tasks
      let totalTime = 0;
      let completedTasks = 0;
      userTasks.forEach((task) => {
        if (task.status === "completed" && task.actualMinutes) {
          totalTime += task.actualMinutes / 60; // Convert to hours
          completedTasks++;
        }
      });

      return {
        userId: userId,
        fullName: member.userId.fullName,
        email: member.userId.email,
        avatar: member.userId.avatar,
        role: member.role,
        tasksAssigned: total,
        tasksCompleted: completed,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        averageTime:
          completedTasks > 0
            ? Math.round((totalTime / completedTasks) * 10) / 10
            : 0,
        taskBreakdown: {
          pending: userTasks.filter((t) => t.status === "pending").length,
          inProgress: userTasks.filter((t) => t.status === "in_progress")
            .length,
          submitted: userTasks.filter((t) => t.status === "submitted").length,
          completed: completed,
        },
      };
    });

    // Sort by completion rate descending
    performance.sort((a, b) => b.completionRate - a.completionRate);

    res.json({
      success: true,
      data: performance,
    });
  } catch (error) {
    console.error("Get team performance error:", error);
    res.json({
      success: true,
      data: [],
    });
  }
};
// Add this to controllers/project.controller.js

// ============================================================
// GET PROJECT CONTRIBUTORS FROM TASKS
// ============================================================
const getProjectContributors = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await Project.findById(id);
    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    // Get tasks for this project
    let tasks = [];
    try {
      const { Task } = require("../models/Task.model");
      tasks = await Task.find({ projectId: id })
        .populate("assignedTo", "fullName email avatar")
        .populate("createdBy", "fullName email")
        .lean();
    } catch (error) {
      console.warn("Task model not found or error:", error);
      return res.json({ success: true, data: [] });
    }

    if (!tasks || tasks.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Group tasks by assignee
    const contributorMap = new Map();

    tasks.forEach(task => {
      const user = task.assignedTo || task.createdBy;
      if (!user) return;

      const userId = user._id.toString();

      if (!contributorMap.has(userId)) {
        contributorMap.set(userId, {
          userId: userId,
          fullName: user.fullName || "Unknown",
          email: user.email || "",
          avatar: user.avatar || null,
          role: "Contributor",
          tasksCompleted: 0,
          totalTasks: 0,
          tasksAssigned: 0,
          completionRate: 0,
          hoursLogged: 0,
          estimatedHours: 0,
          hoursAccuracy: 0,
          onTimeTasks: 0,
          lateTasks: 0,
          onTimeRate: 0,
          avgTaskCompletionTime: 0,
          taskBreakdown: {
            pending: 0,
            inProgress: 0,
            submitted: 0,
            completed: 0,
            overdue: 0,
            rejected: 0
          },
          priorityBreakdown: {
            low: 0,
            normal: 0,
            high: 0,
            critical: 0
          }
        });
      }

      const contributor = contributorMap.get(userId);
      contributor.totalTasks++;
      contributor.tasksAssigned++;

      // Track status
      const status = task.status || "pending";
      if (status === "completed") {
        contributor.tasksCompleted++;
        contributor.taskBreakdown.completed++;

        if (task.dueDate && task.completedAt) {
          const isOnTime = new Date(task.completedAt) <= new Date(task.dueDate);
          if (isOnTime) {
            contributor.onTimeTasks++;
          } else {
            contributor.lateTasks++;
          }
        }
      } else if (status === "in_progress" || status === "in-progress") {
        contributor.taskBreakdown.inProgress++;
      } else if (status === "submitted" || status === "review") {
        contributor.taskBreakdown.submitted++;
      } else if (status === "pending" || status === "todo") {
        contributor.taskBreakdown.pending++;
      } else if (status === "overdue") {
        contributor.taskBreakdown.overdue++;
      } else if (status === "rejected") {
        contributor.taskBreakdown.rejected++;
      }

      // Track priority
      const priority = task.priority || "normal";
      if (priority === "low") contributor.priorityBreakdown.low++;
      else if (priority === "normal" || priority === "medium") contributor.priorityBreakdown.normal++;
      else if (priority === "high") contributor.priorityBreakdown.high++;
      else if (priority === "critical" || priority === "urgent") contributor.priorityBreakdown.critical++;

      // Track hours
      if (task.estimatedHours) {
        contributor.estimatedHours += task.estimatedHours;
      }
      if (task.actualHours) {
        contributor.hoursLogged += task.actualHours;
      }
    });

    // Calculate derived metrics
    const result = Array.from(contributorMap.values()).map(contrib => ({
      ...contrib,
      completionRate: contrib.totalTasks > 0
        ? Math.round((contrib.tasksCompleted / contrib.totalTasks) * 100)
        : 0,
      onTimeRate: contrib.tasksCompleted > 0
        ? Math.round((contrib.onTimeTasks / contrib.tasksCompleted) * 100)
        : 0,
      hoursAccuracy: contrib.estimatedHours > 0
        ? Math.round((contrib.hoursLogged / contrib.estimatedHours) * 100)
        : 0,
      avgTaskCompletionTime: 0,
    }));

    // Sort by tasks completed descending
    result.sort((a, b) => b.tasksCompleted - a.tasksCompleted);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error("Get contributors error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
// controllers/project.controller.js

// Add team members to project
const addTeamMembers = async (req, res) => {
  try {
    const { id } = req.params;
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide an array of user IDs"
      });
    }

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found"
      });
    }

    // Get existing team member IDs
    const existingMemberIds = project.teamMembers.map(
      member => member.userId.toString()
    );

    // Filter out users already in the team
    const newUserIds = userIds.filter(
      userId => !existingMemberIds.includes(userId)
    );

    if (newUserIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "All selected users are already team members"
      });
    }

    // Add new team members
    const newMembers = newUserIds.map(userId => ({
      userId: userId,
      role: "member",
      joinedAt: new Date()
    }));

    project.teamMembers.push(...newMembers);
    await project.save();

    // Populate the team members with user details
    const populatedProject = await Project.findById(id)
      .populate('managerId', 'fullName email role')
      .populate('departmentId', 'name code')
      .populate('createdBy', 'fullName email')
      .populate('teamMembers.userId', 'fullName email role') // Populate team members
      .populate('archivedBy', 'fullName email');

    res.status(200).json({
      success: true,
      message: `${newUserIds.length} team member(s) added successfully`,
      data: populatedProject
    });
  } catch (error) {
    console.error("Error adding team members:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add team members",
      error: error.message
    });
  }
};

// Remove team members from project
const removeTeamMembers = async (req, res) => {
  try {
    const { id } = req.params;
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide an array of user IDs"
      });
    }

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found"
      });
    }

    // Remove the specified users from teamMembers
    project.teamMembers = project.teamMembers.filter(
      member => !userIds.includes(member.userId.toString())
    );

    await project.save();

    // Populate the team members with user details
    const populatedProject = await Project.findById(id)
      .populate('managerId', 'fullName email role')
      .populate('departmentId', 'name code')
      .populate('createdBy', 'fullName email')
      .populate('teamMembers.userId', 'fullName email role') // Populate team members
      .populate('archivedBy', 'fullName email');

    res.status(200).json({
      success: true,
      message: `${userIds.length} team member(s) removed successfully`,
      data: populatedProject
    });
  } catch (error) {
    console.error("Error removing team members:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove team members",
      error: error.message
    });
  }
};

// ============================================================
// EXPORT ALL FUNCTIONS
// ============================================================
module.exports = {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  updateProjectProgress,
  getProjectTemplates,
  getProjectResources,
  getProjectBurndown,
  getProjectTaskStats,
  getProjectActivities,
  getTeamPerformance,
  archiveProject,
  unarchiveProject,
  getProjectContributors,
  addTeamMembers,
  removeTeamMembers,
};
