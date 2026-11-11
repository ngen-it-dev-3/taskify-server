const { Leave } = require("../models/Leave.model");
const { User } = require("../models/User.model");
const { Department } = require("../models/Department.model");
const mongoose = require("mongoose");

const createLeaveRequest = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      type,
      startDate,
      endDate,
      reason,
      isHalfDay,
      halfDayType,
      isPreviousDayOff,
      isNextDayOff,
      isGovernmentHoliday,
      holidayNote,
      substituteId,
      contactDuringLeave,
      emergencyContact,
      additionalDetails,
      signatureText,
      signature,
      departmentId,
      departmentName,
    } = req.body;

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      return res.status(400).json({
        success: false,
        message: "Start date cannot be after end date",
      });
    }

    // Calculate total days
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // Get user details
    const user = await User.findById(userId).populate("departmentId");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get substitute details if provided
    let substituteName = null;
    let substituteEmail = null;
    if (substituteId) {
      const substitute = await User.findById(substituteId);
      if (substitute) {
        substituteName = substitute.fullName;
        substituteEmail = substitute.email;
      }
    }

    // Use provided department or get from user
    const finalDepartmentId = departmentId || user.departmentId?._id || null;
    const finalDepartmentName =
      departmentName || user.departmentId?.name || "Unassigned";

    // Create leave object
    const leaveData = {
      employeeId: userId,
      employeeName: user.fullName,
      employeeEmail: user.email,
      employeeRole: user.role,
      employeeJoinDate: user.createdAt || new Date(),
      departmentId: finalDepartmentId,
      departmentName: finalDepartmentName,
      type,
      startDate: start,
      endDate: end,
      totalDays: diffDays,
      isHalfDay: isHalfDay || false,
      halfDayType: halfDayType || null,
      isPreviousDayOff: isPreviousDayOff || false,
      isNextDayOff: isNextDayOff || false,
      isGovernmentHoliday: isGovernmentHoliday || false,
      holidayNote: holidayNote || "",
      substituteId: substituteId || null,
      substituteName,
      substituteEmail,
      contactDuringLeave: contactDuringLeave || "",
      emergencyContact: emergencyContact || {
        name: "",
        phone: "",
        relation: "",
      },
      reason: reason,
      additionalDetails: additionalDetails || "",
      signatureText: signatureText || "",
      signature: signature || null,
      signedAt: signature ? new Date() : null,
    };

    const leave = new Leave(leaveData);
    await leave.save();

    // ============ SEND NOTIFICATIONS ============
    try {
      // Get HR managers and admins
      const approvers = await User.find({
        role: { $in: ["super_admin", "admin", "hr_manager"] },
        isActive: true,
      }).select("_id fullName email");

      // Send notifications
      await LeaveNotificationService.sendLeaveApplied(leave, user, approvers);
    } catch (notifError) {
      console.error("Notification error:", notifError);
      // Don't fail the request if notification fails
    }

    res.status(201).json({
      success: true,
      message: "Leave request submitted successfully",
      data: leave,
    });
  } catch (error) {
    console.error("Create leave request error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create leave request",
    });
  }
};
// Get my leave requests
const getMyLeaves = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, type, startDate, endDate } = req.query;

    const query = { employeeId: userId };

    if (status) query.status = status;
    if (type) query.type = type;
    if (startDate) query.startDate = { $gte: new Date(startDate) };
    if (endDate) query.endDate = { $lte: new Date(endDate) };

    const leaves = await Leave.find(query)
      .sort({ createdAt: -1 })
      .populate("approvedBy", "fullName email");

    res.json({
      success: true,
      data: leaves,
    });
  } catch (error) {
    console.error("Get my leaves error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch leave requests",
    });
  }
};

// Get all leave requests (Admin/HR)
const getAllLeaves = async (req, res) => {
  try {
    const { status, type, departmentId, startDate, endDate, search } =
      req.query;

    const query = {};

    if (status) query.status = status;
    if (type) query.type = type;
    if (departmentId) query.departmentId = departmentId;
    if (startDate) query.startDate = { $gte: new Date(startDate) };
    if (endDate) query.endDate = { $lte: new Date(endDate) };
    if (search) {
      query.$or = [
        { employeeName: { $regex: search, $options: "i" } },
        { employeeEmail: { $regex: search, $options: "i" } },
        { departmentName: { $regex: search, $options: "i" } },
      ];
    }

    const leaves = await Leave.find(query)
      .sort({ createdAt: -1 })
      .populate("employeeId", "fullName email employeeId")
      .populate("approvedBy", "fullName email");

    res.json({
      success: true,
      data: leaves,
    });
  } catch (error) {
    console.error("Get all leaves error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch leave requests",
    });
  }
};

// Get leave statistics
const getLeaveStats = async (req, res) => {
  try {
    const userId = req.user._id;

    const allLeaves = await Leave.find({ employeeId: userId });

    const stats = {
      total: allLeaves.length,
      pending: allLeaves.filter((l) => l.status === "pending").length,
      approved: allLeaves.filter((l) => l.status === "approved").length,
      rejected: allLeaves.filter((l) => l.status === "rejected").length,
      cancelled: allLeaves.filter((l) => l.status === "cancelled").length,
      byType: {
        casual: allLeaves.filter((l) => l.type === "casual").length,
        earned: allLeaves.filter((l) => l.type === "earned").length,
        sick: allLeaves.filter((l) => l.type === "sick").length,
        maternity: allLeaves.filter((l) => l.type === "maternity").length,
        paternity: allLeaves.filter((l) => l.type === "paternity").length,
        unpaid: allLeaves.filter((l) => l.type === "unpaid").length,
        other: allLeaves.filter((l) => l.type === "other").length,
      },
      totalDays: allLeaves.reduce((sum, l) => sum + l.totalDays, 0),
      approvedDays: allLeaves
        .filter((l) => l.status === "approved")
        .reduce((sum, l) => sum + l.totalDays, 0),
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Get leave stats error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch leave statistics",
    });
  }
};

// Get admin leave statistics
const getAdminLeaveStats = async (req, res) => {
  try {
    const { departmentId, startDate, endDate } = req.query;

    const query = {};
    if (departmentId) query.departmentId = departmentId;
    if (startDate) query.startDate = { $gte: new Date(startDate) };
    if (endDate) query.endDate = { $lte: new Date(endDate) };

    const allLeaves = await Leave.find(query);

    const stats = {
      total: allLeaves.length,
      pending: allLeaves.filter((l) => l.status === "pending").length,
      approved: allLeaves.filter((l) => l.status === "approved").length,
      rejected: allLeaves.filter((l) => l.status === "rejected").length,
      cancelled: allLeaves.filter((l) => l.status === "cancelled").length,
      byType: {
        casual: allLeaves.filter((l) => l.type === "casual").length,
        earned: allLeaves.filter((l) => l.type === "earned").length,
        sick: allLeaves.filter((l) => l.type === "sick").length,
        maternity: allLeaves.filter((l) => l.type === "maternity").length,
        paternity: allLeaves.filter((l) => l.type === "paternity").length,
        unpaid: allLeaves.filter((l) => l.type === "unpaid").length,
        other: allLeaves.filter((l) => l.type === "other").length,
      },
      byDepartment: {},
      totalDays: allLeaves.reduce((sum, l) => sum + l.totalDays, 0),
      approvedDays: allLeaves
        .filter((l) => l.status === "approved")
        .reduce((sum, l) => sum + l.totalDays, 0),
    };

    // Group by department
    const deptMap = new Map();
    for (const leave of allLeaves) {
      const deptName = leave.departmentName || "Unassigned";
      if (!deptMap.has(deptName)) {
        deptMap.set(deptName, {
          total: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
        });
      }
      const dept = deptMap.get(deptName);
      dept.total++;
      if (leave.status === "pending") dept.pending++;
      else if (leave.status === "approved") dept.approved++;
      else if (leave.status === "rejected") dept.rejected++;
    }
    stats.byDepartment = Object.fromEntries(deptMap);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Get admin leave stats error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch leave statistics",
    });
  }
};

// Update leave status (Approve/Reject)
const updateLeaveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    if (!["approved", "rejected", "cancelled"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const leave = await Leave.findById(id);
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Leave request not found",
      });
    }

    // Store old status for notification
    const oldStatus = leave.status;

    leave.status = status;
    if (status === "approved" || status === "rejected") {
      leave.approvedBy = req.user._id;
      leave.approvedByName = req.user.fullName;
      leave.approvedAt = new Date();
    }
    if (status === "rejected") {
      leave.rejectionReason = rejectionReason || "No reason provided";
    }

    await leave.save();

    // ============ SEND NOTIFICATIONS ============
    try {
      const employee = await User.findById(leave.employeeId).select(
        "_id fullName email",
      );
      const approver = await User.findById(req.user._id).select(
        "_id fullName email",
      );

      if (status === "approved") {
        await LeaveNotificationService.sendLeaveApproved(
          leave,
          employee,
          approver,
        );
      } else if (status === "rejected") {
        await LeaveNotificationService.sendLeaveRejected(
          leave,
          employee,
          approver,
          rejectionReason || "No reason provided",
        );
      }
    } catch (notifError) {
      console.error("Notification error:", notifError);
      // Don't fail the request if notification fails
    }

    res.json({
      success: true,
      message: `Leave request ${status}`,
      data: leave,
    });
  } catch (error) {
    console.error("Update leave status error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update leave status",
    });
  }
};

// Delete leave request (Employee can delete pending requests)
const deleteLeaveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const leave = await Leave.findById(id);
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Leave request not found",
      });
    }

    // Only allow deletion of pending requests by the employee who created it
    if (
      leave.employeeId.toString() !== userId.toString() &&
      leave.status !== "pending"
    ) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own pending leave requests",
      });
    }

    await leave.deleteOne();

    // ============ SEND CANCELLATION NOTIFICATION ============
    try {
      const employee = await User.findById(userId).select("_id fullName email");
      await LeaveNotificationService.sendLeaveCancelled(leave, employee);
    } catch (notifError) {
      console.error("Notification error:", notifError);
      // Don't fail the request if notification fails
    }

    res.json({
      success: true,
      message: "Leave request deleted successfully",
    });
  } catch (error) {
    console.error("Delete leave request error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete leave request",
    });
  }
};
// Get leave balances (for an employee)
const getLeaveBalances = async (req, res) => {
  try {
    const userId = req.params.userId || req.user._id;

    // Get all approved leaves
    const approvedLeaves = await Leave.find({
      employeeId: userId,
      status: "approved",
    });

    // Calculate used days by type
    const used = {
      casual: 0,
      earned: 0,
      sick: 0,
      maternity: 0,
      paternity: 0,
      unpaid: 0,
      other: 0,
    };

    for (const leave of approvedLeaves) {
      used[leave.type] = (used[leave.type] || 0) + leave.totalDays;
    }

    // Define entitlements (you can make these configurable)
    const entitlements = {
      casual: 12,
      earned: 15,
      sick: 10,
      maternity: 90,
      paternity: 5,
      unpaid: 0,
      other: 0,
    };

    const balances = {
      used,
      entitlements,
      remaining: {
        casual: entitlements.casual - used.casual,
        earned: entitlements.earned - used.earned,
        sick: entitlements.sick - used.sick,
        maternity: entitlements.maternity - used.maternity,
        paternity: entitlements.paternity - used.paternity,
        unpaid: 0,
        other: 0,
      },
    };

    res.json({
      success: true,
      data: balances,
    });
  } catch (error) {
    console.error("Get leave balances error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch leave balances",
    });
  }
};

// Get all users for substitute selection
const getAvailableSubstitutes = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get users from same department or all users
    const user = await User.findById(userId);
    const query = {
      _id: { $ne: userId },
      isActive: true,
    };

    if (user.departmentId) {
      query.departmentId = user.departmentId;
    }

    const substitutes = await User.find(query)
      .select("_id fullName email role departmentId")
      .populate("departmentId", "name");

    res.json({
      success: true,
      data: substitutes,
    });
  } catch (error) {
    console.error("Get substitutes error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch substitutes",
    });
  }
};

// Upload signature
const uploadSignature = async (req, res) => {
  try {
    const { leaveId } = req.params;
    const { signature, signatureText } = req.body;

    const leave = await Leave.findById(leaveId);
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Leave request not found",
      });
    }

    if (signature) {
      leave.signature = signature;
    }
    if (signatureText) {
      leave.signatureText = signatureText;
    }
    leave.signedAt = new Date();

    await leave.save();

    res.json({
      success: true,
      message: "Signature saved successfully",
      data: leave,
    });
  } catch (error) {
    console.error("Upload signature error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to upload signature",
    });
  }
};
module.exports = {
  createLeaveRequest,
  getMyLeaves,
  getAllLeaves,
  getLeaveStats,
  getAdminLeaveStats,
  updateLeaveStatus,
  deleteLeaveRequest,
  getLeaveBalances,
  getAvailableSubstitutes,
  uploadSignature,
};
