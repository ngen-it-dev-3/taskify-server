const { Resource } = require("../models/Resource.model");
const { Project } = require("../models/Project.model");
const { User } = require("../models/User.model");

// Get all resources
const getResources = async (req, res) => {
  try {
    const { type, status, search } = req.query;
    let query = { isActive: true };

    if (type) query.type = type;
    if (status) query.status = status;
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const resources = await Resource.find(query)
      .populate("assignedTo", "fullName email")
      .populate("projectId", "name code")
      .populate("createdBy", "fullName email")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: resources,
      count: resources.length,
    });
  } catch (error) {
    console.error("Get resources error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get single resource
const getResourceById = async (req, res) => {
  try {
    const { id } = req.params;
    const resource = await Resource.findById(id)
      .populate("assignedTo", "fullName email")
      .populate("projectId", "name code")
      .populate("createdBy", "fullName email");

    if (!resource) {
      return res
        .status(404)
        .json({ success: false, message: "Resource not found" });
    }

    res.json({ success: true, data: resource });
  } catch (error) {
    console.error("Get resource error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Create resource
const createResource = async (req, res) => {
  try {
    const {
      name,
      type,
      assignedTo,
      projectId,
      startDate,
      endDate,
      status,
      utilization,
    } = req.body;

    const resource = await Resource.create({
      name,
      type,
      assignedTo: assignedTo || null,
      projectId,
      startDate,
      endDate,
      status: status || "available",
      utilization: utilization || 0,
      createdBy: req.user._id,
    });

    const populatedResource = await Resource.findById(resource._id)
      .populate("assignedTo", "fullName email")
      .populate("projectId", "name code");

    res.status(201).json({
      success: true,
      message: "Resource allocated successfully",
      data: populatedResource,
    });
  } catch (error) {
    console.error("Create resource error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Update resource
const updateResource = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const resource = await Resource.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    )
      .populate("assignedTo", "fullName email")
      .populate("projectId", "name code");

    if (!resource) {
      return res
        .status(404)
        .json({ success: false, message: "Resource not found" });
    }

    res.json({
      success: true,
      message: "Resource updated successfully",
      data: resource,
    });
  } catch (error) {
    console.error("Update resource error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Delete resource
const deleteResource = async (req, res) => {
  try {
    const { id } = req.params;
    const resource = await Resource.findByIdAndUpdate(id, { isActive: false });

    if (!resource) {
      return res
        .status(404)
        .json({ success: false, message: "Resource not found" });
    }

    res.json({ success: true, message: "Resource deleted successfully" });
  } catch (error) {
    console.error("Delete resource error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Seed resources
const seedResources = async (req, res) => {
  try {
    const existingCount = await Resource.countDocuments();
    if (existingCount > 0) {
      return res.json({ success: true, message: "Resources already seeded" });
    }

    // Get first project and user for demo
    const firstProject = await Project.findOne();
    const firstUser = await User.findOne();

    if (!firstProject) {
      return res
        .status(400)
        .json({
          success: false,
          message: "No projects found. Please create a project first.",
        });
    }

    const resources = [
      {
        name: "John Smith (Senior Developer)",
        type: "human",
        assignedTo: firstUser?._id,
        projectId: firstProject._id,
        startDate: new Date(),
        endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        status: "in_use",
        utilization: 85,
        createdBy: req.user._id,
      },
      {
        name: "AWS Cloud Server",
        type: "equipment",
        assignedTo: null,
        projectId: firstProject._id,
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: "in_use",
        utilization: 60,
        createdBy: req.user._id,
      },
      {
        name: "Figma Design License",
        type: "software",
        assignedTo: firstUser?._id,
        projectId: firstProject._id,
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: "in_use",
        utilization: 45,
        createdBy: req.user._id,
      },
    ];

    await Resource.insertMany(resources);

    res.json({
      success: true,
      message: `${resources.length} resources seeded successfully`,
    });
  } catch (error) {
    console.error("Seed resources error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
};

module.exports = {
  getResources,
  getResourceById,
  createResource,
  updateResource,
  deleteResource,
  seedResources,
};
