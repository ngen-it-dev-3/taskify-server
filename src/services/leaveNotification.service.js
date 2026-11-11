const { sendEmail } = require("../../config/email.config");
const {
  createNotification,
} = require("../controllers/notification.controller");
const EmailTemplates = require("./emailTemplates.service");
const { User } = require("../models/User.model");

class LeaveNotificationService {
  // Send leave application notification
  static async sendLeaveApplied(leave, employee, approvers) {
    try {
      // Send email to employee (confirmation)
      const employeeTemplate = EmailTemplates.leaveApplied(
        leave,
        employee,
        "employee",
      );
      await sendEmail(
        employee.email,
        `📋 Leave Request Submitted: ${leave.type.charAt(0).toUpperCase() + leave.type.slice(1)} Leave`,
        employeeTemplate,
      );

      // Create notification for employee
      await createNotification({
        userId: employee._id,
        title: "Leave Request Submitted",
        message: `Your ${leave.type} leave request from ${new Date(leave.startDate).toLocaleDateString()} to ${new Date(leave.endDate).toLocaleDateString()} has been submitted successfully.`,
        type: "info",
        category: "system",
        actionUrl: `/leaves`,
        metadata: {
          leaveId: leave._id,
          leaveType: leave.type,
          totalDays: leave.totalDays,
          startDate: leave.startDate,
          endDate: leave.endDate,
        },
      });

      // Send email to HR/Managers
      for (const approver of approvers) {
        const approverTemplate = EmailTemplates.leaveApplied(
          leave,
          approver,
          "approver",
        );
        await sendEmail(
          approver.email,
          `👤 New Leave Request: ${employee.fullName} - ${leave.type.charAt(0).toUpperCase() + leave.type.slice(1)} Leave`,
          approverTemplate,
        );

        // Create notification for approvers
        await createNotification({
          userId: approver._id,
          title: "New Leave Request",
          message: `${employee.fullName} has requested ${leave.totalDays} day(s) of ${leave.type} leave from ${new Date(leave.startDate).toLocaleDateString()} to ${new Date(leave.endDate).toLocaleDateString()}.`,
          type: "warning",
          category: "approval",
          actionUrl: `/reports/leaves`,
          metadata: {
            leaveId: leave._id,
            employeeName: employee.fullName,
            leaveType: leave.type,
            totalDays: leave.totalDays,
            startDate: leave.startDate,
            endDate: leave.endDate,
          },
        });
      }

      // Notify substitute if assigned
      if (leave.substituteId) {
        const substitute = await User.findById(leave.substituteId);
        if (substitute) {
          const substituteTemplate = EmailTemplates.leaveApplied(
            leave,
            substitute,
            "substitute",
          );
          await sendEmail(
            substitute.email,
            `🔄 You've Been Assigned as Substitute for ${employee.fullName}`,
            substituteTemplate,
          );

          await createNotification({
            userId: substitute._id,
            title: "Assigned as Substitute",
            message: `You have been assigned as substitute for ${employee.fullName} during their leave from ${new Date(leave.startDate).toLocaleDateString()} to ${new Date(leave.endDate).toLocaleDateString()}.`,
            type: "info",
            category: "system",
            actionUrl: `/leaves`,
            metadata: {
              leaveId: leave._id,
              employeeName: employee.fullName,
              startDate: leave.startDate,
              endDate: leave.endDate,
            },
          });
        }
      }

      return true;
    } catch (error) {
      console.error("Error sending leave applied notification:", error);
      return false;
    }
  }

  // Send leave approval notification
  static async sendLeaveApproved(leave, employee, approver) {
    try {
      // Send email to employee
      const employeeTemplate = EmailTemplates.leaveApproved(
        leave,
        employee,
        approver,
      );
      await sendEmail(
        employee.email,
        `✅ Leave Approved: ${leave.type.charAt(0).toUpperCase() + leave.type.slice(1)} Leave`,
        employeeTemplate,
      );

      // Create notification for employee
      await createNotification({
        userId: employee._id,
        title: "Leave Request Approved",
        message: `Your ${leave.type} leave request from ${new Date(leave.startDate).toLocaleDateString()} to ${new Date(leave.endDate).toLocaleDateString()} has been approved by ${approver.fullName}.`,
        type: "success",
        category: "approval",
        actionUrl: `/leaves`,
        metadata: {
          leaveId: leave._id,
          approvedBy: approver.fullName,
          approvedAt: new Date(),
        },
      });

      // Notify substitute if assigned
      if (leave.substituteId) {
        const substitute = await User.findById(leave.substituteId);
        if (substitute) {
          await createNotification({
            userId: substitute._id,
            title: "Leave Approved - You're the Substitute",
            message: `${employee.fullName}'s leave has been approved. You are assigned as substitute from ${new Date(leave.startDate).toLocaleDateString()} to ${new Date(leave.endDate).toLocaleDateString()}.`,
            type: "success",
            category: "system",
            actionUrl: `/leaves`,
            metadata: {
              leaveId: leave._id,
              employeeName: employee.fullName,
              startDate: leave.startDate,
              endDate: leave.endDate,
            },
          });
        }
      }

      return true;
    } catch (error) {
      console.error("Error sending leave approved notification:", error);
      return false;
    }
  }

  // Send leave rejection notification
  static async sendLeaveRejected(leave, employee, approver, reason) {
    try {
      // Send email to employee
      const employeeTemplate = EmailTemplates.leaveRejected(
        leave,
        employee,
        approver,
        reason,
      );
      await sendEmail(
        employee.email,
        `❌ Leave Rejected: ${leave.type.charAt(0).toUpperCase() + leave.type.slice(1)} Leave`,
        employeeTemplate,
      );

      // Create notification for employee
      await createNotification({
        userId: employee._id,
        title: "Leave Request Rejected",
        message: `Your ${leave.type} leave request from ${new Date(leave.startDate).toLocaleDateString()} to ${new Date(leave.endDate).toLocaleDateString()} has been rejected. Reason: ${reason}`,
        type: "error",
        category: "approval",
        actionUrl: `/leaves`,
        metadata: {
          leaveId: leave._id,
          rejectedBy: approver.fullName,
          reason: reason,
          rejectedAt: new Date(),
        },
      });

      return true;
    } catch (error) {
      console.error("Error sending leave rejected notification:", error);
      return false;
    }
  }

  // Send leave cancellation notification
  static async sendLeaveCancelled(leave, employee) {
    try {
      // Send email to employee
      const employeeTemplate = EmailTemplates.leaveCancelled(leave, employee);
      await sendEmail(
        employee.email,
        `🔄 Leave Cancelled: ${leave.type.charAt(0).toUpperCase() + leave.type.slice(1)} Leave`,
        employeeTemplate,
      );

      // Create notification for employee
      await createNotification({
        userId: employee._id,
        title: "Leave Request Cancelled",
        message: `Your ${leave.type} leave request from ${new Date(leave.startDate).toLocaleDateString()} to ${new Date(leave.endDate).toLocaleDateString()} has been cancelled.`,
        type: "info",
        category: "system",
        actionUrl: `/leaves`,
        metadata: {
          leaveId: leave._id,
          cancelledAt: new Date(),
        },
      });

      return true;
    } catch (error) {
      console.error("Error sending leave cancelled notification:", error);
      return false;
    }
  }
}

module.exports = { LeaveNotificationService };
