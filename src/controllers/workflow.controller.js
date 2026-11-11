const { Workflow } = require("../models/workflow.model"); 
const { User } = require("../models/User.model"); 

// Get all workflows
const getWorkflows = async (req, res) => {
  try {
    const { status, category, search } = req.query;
    let query = { isActive: true };

    if (status) query.status = status;
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const workflows = await Workflow.find(query)
      .populate("createdBy", "fullName email")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: workflows,
      count: workflows.length,
    });
  } catch (error) {
    console.error("Get workflows error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get single workflow
const getWorkflowById = async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = await Workflow.findById(id).populate(
      "createdBy",
      "fullName email",
    );

    if (!workflow) {
      return res
        .status(404)
        .json({ success: false, message: "Workflow not found" });
    }

    res.json({ success: true, data: workflow });
  } catch (error) {
    console.error("Get workflow error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Create workflow
const createWorkflow = async (req, res) => {
  try {
    const { name, description, trigger, actions, category, priority } =
      req.body;

    const workflow = await Workflow.create({
      name,
      description,
      trigger,
      actions,
      category: category || "automation",
      priority: priority || "normal",
      status: "draft",
      createdBy: req.user._id,
    });

    const populatedWorkflow = await Workflow.findById(workflow._id).populate(
      "createdBy",
      "fullName email",
    );

    res.status(201).json({
      success: true,
      message: "Workflow created successfully",
      data: populatedWorkflow,
    });
  } catch (error) {
    console.error("Create workflow error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Update workflow
const updateWorkflow = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const workflow = await Workflow.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    ).populate("createdBy", "fullName email");

    if (!workflow) {
      return res
        .status(404)
        .json({ success: false, message: "Workflow not found" });
    }

    res.json({
      success: true,
      message: "Workflow updated successfully",
      data: workflow,
    });
  } catch (error) {
    console.error("Update workflow error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Delete workflow
const deleteWorkflow = async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = await Workflow.findByIdAndUpdate(id, { isActive: false });

    if (!workflow) {
      return res
        .status(404)
        .json({ success: false, message: "Workflow not found" });
    }

    res.json({ success: true, message: "Workflow deleted successfully" });
  } catch (error) {
    console.error("Delete workflow error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Toggle workflow status (activate/deactivate)
const toggleWorkflowStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = await Workflow.findById(id);

    if (!workflow) {
      return res
        .status(404)
        .json({ success: false, message: "Workflow not found" });
    }

    const newStatus = workflow.status === "active" ? "inactive" : "active";
    workflow.status = newStatus;
    await workflow.save();

    res.json({
      success: true,
      message: `Workflow ${newStatus === "active" ? "activated" : "deactivated"} successfully`,
      data: workflow,
    });
  } catch (error) {
    console.error("Toggle workflow error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Duplicate workflow
const duplicateWorkflow = async (req, res) => {
  try {
    const { id } = req.params;
    const originalWorkflow = await Workflow.findById(id);

    if (!originalWorkflow) {
      return res
        .status(404)
        .json({ success: false, message: "Workflow not found" });
    }

    const duplicatedWorkflow = await Workflow.create({
      name: `${originalWorkflow.name} (Copy)`,
      description: originalWorkflow.description,
      trigger: originalWorkflow.trigger,
      actions: originalWorkflow.actions,
      category: originalWorkflow.category,
      priority: originalWorkflow.priority,
      status: "draft",
      createdBy: req.user._id,
    });

    const populatedWorkflow = await Workflow.findById(
      duplicatedWorkflow._id,
    ).populate("createdBy", "fullName email");

    res.status(201).json({
      success: true,
      message: "Workflow duplicated successfully",
      data: populatedWorkflow,
    });
  } catch (error) {
    console.error("Duplicate workflow error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Execute workflow (simulate execution)
const executeWorkflow = async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = await Workflow.findById(id);

    if (!workflow) {
      return res
        .status(404)
        .json({ success: false, message: "Workflow not found" });
    }

    // Increment execution count
    workflow.executionCount += 1;
    workflow.lastExecuted = new Date();
    await workflow.save();

    res.json({
      success: true,
      message: "Workflow executed successfully",
      data: workflow,
    });
  } catch (error) {
    console.error("Execute workflow error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Seed initial workflows
const seedWorkflows = async (req, res) => {
  try {
    const existingCount = await Workflow.countDocuments();
    if (existingCount > 0) {
      return res.json({ success: true, message: "Workflows already seeded" });
    }

    const workflows = [
      {
        name: "Task Assignment Notification",
        description: "Send email notification when a new task is assigned",
        trigger: { type: "task_created", condition: "assigned_to != null" },
        actions: [
          { type: "send_email", config: { template: "task_assigned" } },
        ],
        category: "notification",
        priority: "high",
        status: "active",
        createdBy: req.user._id,
      },
      {
        name: "Deadline Reminder",
        description: "Send reminder 24 hours before task deadline",
        trigger: {
          type: "deadline_approaching",
          condition: "hours_left <= 24",
        },
        actions: [
          {
            type: "send_notification",
            config: { message: "Task deadline approaching!" },
          },
        ],
        category: "automation",
        priority: "high",
        status: "active",
        createdBy: req.user._id,
      },
      {
        name: "Task Approval Flow",
        description: "Route completed tasks to manager for approval",
        trigger: {
          type: "task_completed",
          condition: "approval_required = true",
        },
        actions: [
          { type: "assign_task", config: { to: "manager", action: "review" } },
        ],
        category: "approval",
        priority: "normal",
        status: "active",
        createdBy: req.user._id,
      },
      {
        name: "Welcome Email",
        description: "Send welcome email to new team members",
        trigger: { type: "user_joined", condition: "role = employee" },
        actions: [{ type: "send_email", config: { template: "welcome" } }],
        category: "notification",
        priority: "low",
        status: "inactive",
        createdBy: req.user._id,
      },
    ];

    await Workflow.insertMany(workflows);

    res.json({
      success: true,
      message: `${workflows.length} workflows seeded successfully`,
    });
  } catch (error) {
    console.error("Seed workflows error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getWorkflows,
  getWorkflowById,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  toggleWorkflowStatus,
  duplicateWorkflow,
  executeWorkflow,
  seedWorkflows,
};
