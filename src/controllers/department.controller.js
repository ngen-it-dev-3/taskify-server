// controllers/department.controller.js
const { Department } = require("../models/Department.model");
const { User } = require("../models/User.model");

// Get all departments
const getAllDepartments = async (req, res) => {
  try {
    const departments = await Department.find({ isActive: true })
      .populate("headOfDepartment", "fullName email employeeId role")
      .sort({ name: 1 });

    // Update employee count for each department
    const updatedDepartments = await Promise.all(
      departments.map(async (dept) => {
        await dept.updateEmployeeCount();
        return dept;
      }),
    );

    // Transform data to match frontend expectations
    const transformed = updatedDepartments.map((dept) => ({
      ...dept.toObject(),
      budget: {
        allocated: dept.budget || 0,
        spent: 0,
      },
      assets: {
        total: 0,
        value: 0,
      },
      settings: dept.settings || {
        workStartTime: "09:00",
        workEndTime: "18:00",
        allowRemoteCheckIn: true,
      },
    }));

    res.json({ success: true, data: transformed, count: transformed.length });
  } catch (error) {
    console.error("Get departments error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get single department by ID
const getDepartmentById = async (req, res) => {
  try {
    const { id } = req.params;

    const department = await Department.findById(id).populate(
      "headOfDepartment",
      "fullName email employeeId role",
    );

    if (!department) {
      return res
        .status(404)
        .json({ success: false, message: "Department not found" });
    }

    // Update employee count
    await department.updateEmployeeCount();

    // Transform data
    const transformed = {
      ...department.toObject(),
      budget: {
        allocated: department.budget || 0,
        spent: 0,
      },
      assets: {
        total: 0,
        value: 0,
      },
      settings: department.settings || {
        workStartTime: "09:00",
        workEndTime: "18:00",
        allowRemoteCheckIn: true,
      },
    };

    res.json({ success: true, data: transformed });
  } catch (error) {
    console.error("Get department error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Create department
const createDepartment = async (req, res) => {
  try {
    const {
      name,
      code,
      description,
      headOfDepartment,
      settings,
      budget,
      location,
      establishedDate,
    } = req.body;

    const existingDept = await Department.findOne({
      $or: [{ name }, { code }],
    });
    if (existingDept) {
      return res
        .status(400)
        .json({ success: false, message: "Department already exists" });
    }

    const department = await Department.create({
      name,
      code: code.toUpperCase(),
      description: description || "",
      headOfDepartment: headOfDepartment || null,
      settings: settings || {
        workStartTime: "09:00",
        workEndTime: "18:00",
        allowRemoteCheckIn: true,
      },
      budget: budget || 0,
      location: location || "",
      establishedDate: establishedDate || new Date(),
      employeeCount: 0,
    });

    // If head of department is set, update user role
    if (headOfDepartment) {
      await User.findByIdAndUpdate(headOfDepartment, {
        role: "dept_manager",
        departmentId: department._id,
      });
    }

    // Update employee count
    await department.updateEmployeeCount();

    const populatedDepartment = await Department.findById(
      department._id,
    ).populate("headOfDepartment", "fullName email employeeId role");

    // Transform response
    const transformed = {
      ...populatedDepartment.toObject(),
      budget: {
        allocated: populatedDepartment.budget || 0,
        spent: 0,
      },
      assets: {
        total: 0,
        value: 0,
      },
      settings: populatedDepartment.settings || {
        workStartTime: "09:00",
        workEndTime: "18:00",
        allowRemoteCheckIn: true,
      },
    };

    res.status(201).json({
      success: true,
      message: "Department created successfully",
      data: transformed,
    });
  } catch (error) {
    console.error("Create department error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
};

// Update department
const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates.parentDepartment;
    delete updates.assets;
    delete updates.employeeCount;
    delete updates.budget; // Handle budget separately

    const department = await Department.findByIdAndUpdate(
      id,
      {
        ...updates,
        updatedAt: new Date(),
        ...(updates.budgetAllocated !== undefined && {
          budget: updates.budgetAllocated,
        }),
      },
      { new: true, runValidators: true },
    ).populate("headOfDepartment", "fullName email employeeId role");

    if (!department) {
      return res
        .status(404)
        .json({ success: false, message: "Department not found" });
    }

    // Update employee count
    await department.updateEmployeeCount();

    // Transform response
    const transformed = {
      ...department.toObject(),
      budget: {
        allocated: department.budget || 0,
        spent: 0,
      },
      assets: {
        total: 0,
        value: 0,
      },
      settings: department.settings || {
        workStartTime: "09:00",
        workEndTime: "18:00",
        allowRemoteCheckIn: true,
      },
    };

    res.json({
      success: true,
      message: "Department updated successfully",
      data: transformed,
    });
  } catch (error) {
    console.error("Update department error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Delete department
const deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if department has employees
    const employeeCount = await User.countDocuments({
      departmentId: id,
      isActive: true,
    });
    if (employeeCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete department with ${employeeCount} active employees. Reassign or deactivate them first.`,
      });
    }

    const department = await Department.findByIdAndDelete(id);
    if (!department) {
      return res
        .status(404)
        .json({ success: false, message: "Department not found" });
    }

    res.json({
      success: true,
      message: "Department deleted successfully",
    });
  } catch (error) {
    console.error("Delete department error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get department employees
const getDepartmentEmployees = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, isActive } = req.query;

    const query = { departmentId: id };
    if (role) query.role = role;
    if (isActive !== undefined) query.isActive = isActive === "true";

    const employees = await User.find(query)
      .select("-password")
      .populate("managerId", "fullName email employeeId")
      .sort({ fullName: 1 });

    res.json({
      success: true,
      data: employees,
      count: employees.length,
    });
  } catch (error) {
    console.error("Get department employees error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Update department employee count (manual trigger)
const updateDepartmentEmployeeCount = async (req, res) => {
  try {
    const { id } = req.params;
    const department = await Department.findById(id);
    if (!department) {
      return res
        .status(404)
        .json({ success: false, message: "Department not found" });
    }

    const count = await department.updateEmployeeCount();

    res.json({
      success: true,
      message: "Employee count updated",
      data: { employeeCount: count },
    });
  } catch (error) {
    console.error("Update count error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Recount all departments
const recountAllDepartments = async (req, res) => {
  try {
    const updated = await Department.recountAll();

    res.json({
      success: true,
      message: `Recounted ${updated} departments`,
      data: { updated },
    });
  } catch (error) {
    console.error("Recount all error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getAllDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getDepartmentEmployees,
  updateDepartmentEmployeeCount,
  recountAllDepartments,
};
