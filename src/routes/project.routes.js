// routes/project.routes.js
const express = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const {
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
} = require("../controllers/project.controller");
const { Project } = require("../models/Project.model");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// In your project routes
router.get("/my", authenticate, async (req, res) => {
  try {
    const userId = req.user._id;

    // Find projects where user is a team member, manager, or creator
    const projects = await Project.find({
      $or: [
        { "teamMembers.userId": userId },
        { managerId: userId },
        { createdBy: userId }
      ],
      isActive: true,
      status: { $ne: "archived" }
    })
      .populate("departmentId", "name code")
      .populate("managerId", "fullName email role")
      .populate("createdBy", "fullName email")
      .populate("teamMembers.userId", "fullName email")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: projects,
      count: projects.length
    });
  } catch (error) {
    console.error("Error fetching user projects:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch projects"
    });
  }
});
// Project routes
router.get("/", getProjects);
router.get("/templates", getProjectTemplates);
router.get("/resources", getProjectResources);
router.get("/:id", getProjectById);


// Create and update
router.post("/", createProject);
router.put("/:id", updateProject);

// Progress update
router.patch("/:id/progress", updateProjectProgress);

// Archive/Unarchive
router.patch("/:id/archive", archiveProject);
router.patch("/:id/unarchive", unarchiveProject);

// Dashboard routes
router.get("/:id/burndown", getProjectBurndown);
router.get("/:id/task-stats", getProjectTaskStats);
router.get("/:id/activities", getProjectActivities);
router.get("/:id/team-performance", getTeamPerformance);

// Delete (soft delete)
router.delete("/:id", deleteProject);
router.get("/:id/contributors", getProjectContributors);

// Team management routes
router.post("/:id/team/add", addTeamMembers);
router.post("/:id/team/remove", removeTeamMembers);


module.exports = router;
