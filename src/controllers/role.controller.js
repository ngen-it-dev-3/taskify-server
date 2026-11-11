// src/controllers/role.controller.js
const { Role } = require("../models/Role.model");
const { User } = require("../models/User.model");

// ============================================================
// ROLE CRUD OPERATIONS
// ============================================================

// Get all roles
const getRoles = async (req, res) => {
  try {
    const roles = await Role.find({ isActive: true }).sort({
      level: -1,
      createdAt: -1,
    });

    const rolesWithCount = await Promise.all(
      roles.map(async (role) => {
        const userCount = await User.countDocuments({
          $or: [{ role: role.code.toLowerCase() }, { roles: role._id }],
        });
        return {
          ...role.toObject(),
          userCount,
        };
      }),
    );

    res.json({
      success: true,
      data: rolesWithCount,
      count: rolesWithCount.length,
    });
  } catch (error) {
    console.error("Get roles error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
};

// Get single role
const getRoleById = async (req, res) => {
  try {
    const { id } = req.params;
    const role = await Role.findById(id);

    if (!role) {
      return res
        .status(404)
        .json({ success: false, message: "Role not found" });
    }

    const userCount = await User.countDocuments({
      $or: [{ role: role.code.toLowerCase() }, { roles: role._id }],
    });

    res.json({
      success: true,
      data: { ...role.toObject(), userCount },
    });
  } catch (error) {
    console.error("Get role error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
};

// Create role
const createRole = async (req, res) => {
  try {
    const { name, code, description, level, permissions } = req.body;

    const existingRole = await Role.findOne({
      $or: [{ name }, { code: code.toUpperCase() }],
    });

    if (existingRole) {
      return res.status(400).json({
        success: false,
        message: "Role with this name or code already exists",
      });
    }

    const role = await Role.create({
      name,
      code: code.toUpperCase(),
      description,
      level: level || 50,
      permissions: permissions || [],
      isSystemRole: false,
      isPermanent: false,
      canEdit: true,
      canDelete: true,
      createdBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: "Role created successfully",
      data: role,
    });
  } catch (error) {
    console.error("Create role error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
};

// Update role
const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const existingRole = await Role.findById(id);
    if (!existingRole) {
      return res
        .status(404)
        .json({ success: false, message: "Role not found" });
    }

    // Check if role is permanent and cannot be edited
    if (existingRole.isPermanent && !existingRole.canEdit) {
      return res.status(403).json({
        success: false,
        message: "This is a permanent system role and cannot be modified",
      });
    }

    // Prevent editing system role name and code
    if (existingRole.isSystemRole) {
      delete updates.name;
      delete updates.code;
      delete updates.isSystemRole;
      delete updates.isPermanent;
    }

    const role = await Role.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    );

    res.json({
      success: true,
      message: "Role updated successfully",
      data: role,
    });
  } catch (error) {
    console.error("Update role error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
};

// Delete role
const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;

    const role = await Role.findById(id);
    if (!role) {
      return res
        .status(404)
        .json({ success: false, message: "Role not found" });
    }

    // Prevent deleting permanent system roles
    if (role.isPermanent) {
      return res.status(403).json({
        success: false,
        message: "This is a permanent system role and cannot be deleted",
      });
    }

    // Prevent deleting system roles
    if (role.isSystemRole) {
      return res.status(403).json({
        success: false,
        message: "System roles cannot be deleted",
      });
    }

    // Check if any users have this role
    const userCount = await User.countDocuments({
      $or: [{ role: role.code.toLowerCase() }, { roles: role._id }],
    });

    if (userCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role. ${userCount} users are currently assigned to this role. Please reassign them first.`,
      });
    }

    await Role.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Role deleted successfully",
    });
  } catch (error) {
    console.error("Delete role error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
};

// ============================================================
// USER ROLE MANAGEMENT
// ============================================================

// src/controllers/role.controller.js - Update the assignRolesToUser function

// Assign multiple roles to a user
const assignRolesToUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { roleIds, primaryRoleId } = req.body;

    console.log("Assign roles request:", { userId, roleIds, primaryRoleId });

    if (!roleIds || !Array.isArray(roleIds) || roleIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one role ID",
      });
    }

    // Validate that all roles exist
    const roles = await Role.find({
      _id: { $in: roleIds },
      isActive: true,
    });

    if (roles.length !== roleIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more roles not found",
      });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get the role codes
    const roleCodes = roles.map((r) => r.code.toLowerCase());

    // Update user's roles
    user.roles = roleIds;

    // Set primary role if provided, otherwise use first role
    if (primaryRoleId) {
      const primaryRoleExists = roleIds.includes(primaryRoleId);
      if (primaryRoleExists) {
        const primaryRole = await Role.findById(primaryRoleId);
        user.role = primaryRole.code.toLowerCase();
      } else {
        user.role = roleCodes[0];
      }
    } else {
      user.role = roleCodes[0];
    }

    await user.save();

    // Return updated user with populated roles
    const updatedUser = await User.findById(userId)
      .populate("roles", "name code level")
      .populate("department", "name code");

    res.json({
      success: true,
      message: `Roles assigned successfully to ${updatedUser.fullName}`,
      data: updatedUser,
    });
  } catch (error) {
    console.error("Assign roles error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};
// Remove a role from a user
const removeRoleFromUser = async (req, res) => {
  try {
    const { userId, roleId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }

    // Check if user has this role
    if (!user.roles || !user.roles.includes(roleId)) {
      return res.status(400).json({
        success: false,
        message: "User does not have this role",
      });
    }

    // Cannot remove if user only has one role (must have at least one role)
    if (user.roles.length <= 1) {
      return res.status(400).json({
        success: false,
        message:
          "User must have at least one role. Assign another role first before removing this one.",
      });
    }

    // Remove the role
    user.roles = user.roles.filter((id) => id.toString() !== roleId);

    // If this was the primary role, set a new primary role
    if (user.role === role.code.toLowerCase()) {
      if (user.roles.length > 0) {
        const primaryRole = await Role.findById(user.roles[0]);
        user.role = primaryRole.code.toLowerCase();
      }
    }

    await user.save();

    const updatedUser = await User.findById(userId).populate("roles");

    res.json({
      success: true,
      message: `Role "${role.name}" removed from ${user.fullName}`,
      data: updatedUser,
    });
  } catch (error) {
    console.error("Remove role error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// Get user roles
const getUserRoles = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).populate("roles");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const roles = user.roles || [];
    const primaryRole = user.role;

    res.json({
      success: true,
      data: {
        userId: user._id,
        fullName: user.fullName,
        email: user.email,
        roles: roles,
        primaryRole: primaryRole,
        roleCount: roles.length,
      },
    });
  } catch (error) {
    console.error("Get user roles error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// SEED & PERMANENT ROLES
// ============================================================

// Seed default roles (PERMANENT)
const seedRoles = async (req, res) => {
  try {
    const existingCount = await Role.countDocuments();

    const defaultRoles = [
      {
        name: "Super Admin",
        code: "SUPER_ADMIN",
        description:
          "Full system access with all permissions. This is a permanent system role.",
        level: 100,
        isSystemRole: true,
        isPermanent: true,
        canEdit: false,
        canDelete: false,
        permissions: ["*"],
      },
      {
        name: "Admin",
        code: "ADMIN",
        description:
          "Administrative access with limited system control. This is a permanent system role.",
        level: 90,
        isSystemRole: true,
        isPermanent: true,
        canEdit: false,
        canDelete: false,
        permissions: [
          "manage_users",
          "manage_departments",
          "view_reports",
          "manage_settings",
        ],
      },
      {
        name: "HR Manager",
        code: "HR_MANAGER",
        description:
          "Human resources management access. This is a permanent system role.",
        level: 80,
        isSystemRole: true,
        isPermanent: true,
        canEdit: false,
        canDelete: false,
        permissions: [
          "manage_employees",
          "manage_attendance",
          "manage_leaves",
          "view_reports",
        ],
      },
      {
        name: "Department Manager",
        code: "DEPT_MANAGER",
        description:
          "Department-level management access. This is a permanent system role.",
        level: 70,
        isSystemRole: true,
        isPermanent: true,
        canEdit: false,
        canDelete: false,
        permissions: [
          "manage_team_tasks",
          "approve_tasks",
          "view_team_reports",
          "manage_attendance",
        ],
      },
      {
        name: "Project Manager",
        code: "PROJECT_MANAGER",
        description:
          "Project-specific management access. This is a permanent system role.",
        level: 65,
        isSystemRole: true,
        isPermanent: true,
        canEdit: false,
        canDelete: false,
        permissions: [
          "manage_project_tasks",
          "assign_members",
          "view_project_reports",
          "approve_submissions",
        ],
      },
      {
        name: "Line Manager",
        code: "LINE_MANAGER",
        description: "Team management access. This is a permanent system role.",
        level: 60,
        isSystemRole: true,
        isPermanent: true,
        canEdit: false,
        canDelete: false,
        permissions: [
          "assign_tasks",
          "review_submissions",
          "provide_feedback",
          "approve_time_off",
        ],
      },
      {
        name: "Employee",
        code: "EMPLOYEE",
        description: "Basic user access. This is a permanent system role.",
        level: 10,
        isSystemRole: true,
        isPermanent: true,
        canEdit: false,
        canDelete: false,
        permissions: [
          "view_own_tasks",
          "update_own_tasks",
          "submit_evidence",
          "request_leave",
        ],
      },
    ];

    if (existingCount === 0) {
      await Role.insertMany(defaultRoles);
      return res.json({
        success: true,
        message: `${defaultRoles.length} permanent system roles seeded successfully`,
        data: defaultRoles,
      });
    }

    // Update existing roles to be permanent if they are system roles
    for (const defaultRole of defaultRoles) {
      await Role.findOneAndUpdate(
        { code: defaultRole.code },
        {
          $setOnInsert: defaultRole,
          $set: {
            isPermanent: true,
            canEdit: false,
            canDelete: false,
          },
        },
        { upsert: true, new: true },
      );
    }

    res.json({
      success: true,
      message: "System roles verified and set as permanent",
    });
  } catch (error) {
    console.error("Seed roles error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
};

// Get permanent roles info
const getPermanentRoles = async (req, res) => {
  try {
    const permanentRoles = await Role.find({
      isPermanent: true,
      isActive: true,
    })
      .select("name code description level isSystemRole")
      .sort({ level: -1 });

    res.json({
      success: true,
      data: permanentRoles,
      count: permanentRoles.length,
      message:
        "These are permanent system roles that cannot be deleted or modified",
    });
  } catch (error) {
    console.error("Get permanent roles error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  seedRoles,
  getPermanentRoles,
  assignRolesToUser,
  removeRoleFromUser,
  getUserRoles,
};
