const { Template } = require("../models/Template.model");
const { Project } = require("../models/Project.model");

// Get all templates
const getTemplates = async (req, res) => {
  try {
    const { category, featured, search } = req.query;
    let query = { isActive: true };

    if (category) query.category = category;
    if (featured === "true") query.isFeatured = true;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const templates = await Template.find(query)
      .populate("createdBy", "fullName email")
      .sort({ isFeatured: -1, createdAt: -1 });

    res.json({
      success: true,
      data: templates,
      count: templates.length,
    });
  } catch (error) {
    console.error("Get templates error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get single template
const getTemplateById = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await Template.findById(id).populate(
      "createdBy",
      "fullName email",
    );

    if (!template) {
      return res
        .status(404)
        .json({ success: false, message: "Template not found" });
    }

    res.json({ success: true, data: template });
  } catch (error) {
    console.error("Get template error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Create template
const createTemplate = async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      estimatedDuration,
      taskCount,
      isFeatured,
      tasks,
    } = req.body;

    const template = await Template.create({
      name,
      description,
      category: category || "Development",
      estimatedDuration: estimatedDuration || 30,
      taskCount: taskCount || 10,
      isFeatured: isFeatured || false,
      tasks: tasks || [],
      createdBy: req.user._id,
    });

    const populatedTemplate = await Template.findById(template._id).populate(
      "createdBy",
      "fullName email",
    );

    res.status(201).json({
      success: true,
      message: "Template created successfully",
      data: populatedTemplate,
    });
  } catch (error) {
    console.error("Create template error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Update template
const updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const template = await Template.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    ).populate("createdBy", "fullName email");

    if (!template) {
      return res
        .status(404)
        .json({ success: false, message: "Template not found" });
    }

    res.json({
      success: true,
      message: "Template updated successfully",
      data: template,
    });
  } catch (error) {
    console.error("Update template error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Delete template
const deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await Template.findByIdAndUpdate(id, { isActive: false });

    if (!template) {
      return res
        .status(404)
        .json({ success: false, message: "Template not found" });
    }

    res.json({ success: true, message: "Template deleted successfully" });
  } catch (error) {
    console.error("Delete template error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Apply template to create a project
const applyTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await Template.findById(id);

    if (!template) {
      return res
        .status(404)
        .json({ success: false, message: "Template not found" });
    }

    // Increment usage count
    template.usageCount += 1;
    await template.save();

    // Create a new project based on template
    const project = await Project.create({
      name: `${template.name} - ${new Date().toLocaleDateString()}`,
      code: `${template.category.substring(0, 3).toUpperCase()}-${Date.now()}`,
      description: template.description,
      status: "planning",
      priority: "normal",
      startDate: new Date(),
      endDate: new Date(
        Date.now() + template.estimatedDuration * 24 * 60 * 60 * 1000,
      ),
      createdBy: req.user._id,
    });

    res.json({
      success: true,
      message: "Template applied successfully",
      data: { project, template },
    });
  } catch (error) {
    console.error("Apply template error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Seed initial templates
const seedTemplates = async (req, res) => {
  try {
    const existingCount = await Template.countDocuments();
    if (existingCount > 0) {
      return res.json({ success: true, message: "Templates already seeded" });
    }

    const templates = [
      {
        name: "Software Development Project",
        description:
          "Complete software development lifecycle template including requirements, design, development, testing, and deployment phases.",
        category: "Development",
        estimatedDuration: 90,
        taskCount: 25,
        isFeatured: true,
        createdBy: req.user._id,
      },
      {
        name: "Marketing Campaign",
        description:
          "Template for planning and executing marketing campaigns including strategy, content creation, and analytics.",
        category: "Marketing",
        estimatedDuration: 30,
        taskCount: 15,
        isFeatured: true,
        createdBy: req.user._id,
      },
      {
        name: "Product Launch",
        description:
          "Complete product launch template covering pre-launch, launch day activities, and post-launch support.",
        category: "Product",
        estimatedDuration: 45,
        taskCount: 32,
        isFeatured: false,
        createdBy: req.user._id,
      },
      {
        name: "Design System",
        description: "Create a comprehensive design system for your products.",
        category: "Design",
        estimatedDuration: 60,
        taskCount: 20,
        isFeatured: false,
        createdBy: req.user._id,
      },
      {
        name: "HR Recruitment Drive",
        description: "End-to-end recruitment process template.",
        category: "HR",
        estimatedDuration: 45,
        taskCount: 18,
        isFeatured: false,
        createdBy: req.user._id,
      },
      {
        name: "Financial Audit",
        description: "Complete financial audit process template.",
        category: "Finance",
        estimatedDuration: 30,
        taskCount: 12,
        isFeatured: false,
        createdBy: req.user._id,
      },
    ];

    await Template.insertMany(templates);

    res.json({
      success: true,
      message: `${templates.length} templates seeded successfully`,
    });
  } catch (error) {
    console.error("Seed templates error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  applyTemplate,
  seedTemplates,
};
