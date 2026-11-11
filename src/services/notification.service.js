const { sendEmail } = require("../config/email.config");
const EmailTemplates = require("./emailTemplates.service");
const { Task } = require("../models/Task.model");
const { User } = require("../models/User.model");
const { Project } = require("../models/Project.model");
const cron = require("node-cron");
const {
  createNotification,
} = require("../controllers/notification.controller");

class NotificationService {
  // Send task assigned notification
  static async sendTaskAssigned(taskId) {
    try {
      const task = await Task.findById(taskId)
        .populate("assignedTo", "fullName email")
        .populate("assignedBy", "fullName email")
        .populate("projectId", "name code");

      if (!task || !task.assignedTo?.email) return false;

      // Send email
      const template = EmailTemplates.taskAssigned(
        task,
        task.assignedTo,
        task.assignedBy,
      );
      await sendEmail(
        task.assignedTo.email,
        `New Task Assigned: ${task.title}`,
        template,
      );

      // Create database notification for assignee
      await createNotification({
        userId: task.assignedTo._id,
        title: "New Task Assigned",
        message: `You have been assigned a new task: "${task.title}"`,
        type: "info",
        category: "task",
        taskId: task._id,
        taskTitle: task.title,
        actionUrl: `/tasks/${task._id}`,
        metadata: {
          assignedBy: task.assignedBy.fullName,
          projectName: task.projectId?.name,
          deadline: task.deadline,
          priority: task.priority,
        },
      });

      // Create notification for assigner (optional)
      if (task.assignedBy._id.toString() !== task.assignedTo._id.toString()) {
        await createNotification({
          userId: task.assignedBy._id,
          title: "Task Created",
          message: `Task "${task.title}" has been assigned to ${task.assignedTo.fullName}`,
          type: "success",
          category: "task",
          taskId: task._id,
          taskTitle: task.title,
          actionUrl: `/tasks/${task._id}`,
        });
      }

      return true;
    } catch (error) {
      console.error("Error sending task assigned notification:", error);
      return false;
    }
  }

  // Send task status update notification
  static async sendTaskStatusUpdate(taskId, oldStatus, newStatus, updatedById) {
    try {
      const task = await Task.findById(taskId)
        .populate("assignedTo", "fullName email")
        .populate("assignedBy", "fullName email");

      if (!task) return false;

      const updatedBy =
        await User.findById(updatedById).select("fullName email");

      // Create notification for assignee
      await createNotification({
        userId: task.assignedTo._id,
        title: `Task Status Updated: ${task.title}`,
        message: `Task status changed from ${oldStatus.replace(/_/g, " ")} to ${newStatus.replace(/_/g, " ")} by ${updatedBy.fullName}`,
        type:
          newStatus === "completed"
            ? "success"
            : newStatus === "rejected"
              ? "error"
              : "info",
        category: "task",
        taskId: task._id,
        taskTitle: task.title,
        actionUrl: `/tasks/${task._id}`,
        metadata: {
          oldStatus,
          newStatus,
          updatedBy: updatedBy.fullName,
        },
      });

      return true;
    } catch (error) {
      console.error("Error sending status update:", error);
      return false;
    }
  }

  // Send task submitted for review notification (to managers)
  static async sendTaskSubmitted(taskId, submitterId) {
    try {
      const task = await Task.findById(taskId)
        .populate("assignedTo", "fullName email")
        .populate("assignedBy", "fullName email")
        .populate("projectId", "name code");

      if (!task) return false;

      const submitter =
        await User.findById(submitterId).select("fullName email");
      const reviewer = task.assignedBy;

      if (!reviewer?.email) return false;

      // Send email to reviewer
      const template = EmailTemplates.taskSubmitted(task, submitter, reviewer);
      await sendEmail(
        reviewer.email,
        `📤 Task Ready for Review: ${task.title}`,
        template,
      );

      // Create database notification for reviewer (manager)
      await createNotification({
        userId: reviewer._id,
        title: "Task Submitted for Review",
        message: `${submitter.fullName} has submitted task "${task.title}" for your review`,
        type: "warning",
        category: "approval",
        taskId: task._id,
        taskTitle: task.title,
        actionUrl: `/tasks/${task._id}`,
        metadata: {
          submitter: submitter.fullName,
          projectName: task.projectId?.name,
          priority: task.priority,
        },
      });

      // Also notify other managers (without projectManager population)
      // Just use the assignedBy as the reviewer, or fetch managers by role
      const managers = await User.find({
        role: {
          $in: [
            "admin",
            "super_admin",
            "dept_manager",
            "project_manager",
            "line_manager",
            "hr_manager",
          ],
        },
        _id: { $ne: reviewer._id }, // Don't duplicate
      }).select("_id fullName email");

      for (const manager of managers) {
        await createNotification({
          userId: manager._id,
          title: "Task Ready for Review",
          message: `${submitter.fullName} has submitted task "${task.title}" for review`,
          type: "info",
          category: "approval",
          taskId: task._id,
          taskTitle: task.title,
          actionUrl: `/tasks/${task._id}`,
        });
      }

      return true;
    } catch (error) {
      console.error("Error sending submitted notification:", error);
      return false;
    }
  }

  // Send task approved notification
  static async sendTaskApproved(taskId, approverId) {
    try {
      const task = await Task.findById(taskId)
        .populate("assignedTo", "fullName email")
        .populate("assignedBy", "fullName email");

      if (!task || !task.assignedTo?.email) return false;

      const approver = await User.findById(approverId).select("fullName email");

      // Send email to assignee
      const template = EmailTemplates.taskApproved(
        task,
        task.assignedTo,
        approver,
      );
      await sendEmail(
        task.assignedTo.email,
        `✅ Task Approved: ${task.title}`,
        template,
      );

      // Create database notification for assignee
      await createNotification({
        userId: task.assignedTo._id,
        title: "Task Approved",
        message: `Your task "${task.title}" has been approved by ${approver.fullName}`,
        type: "success",
        category: "task",
        taskId: task._id,
        taskTitle: task.title,
        actionUrl: `/tasks/${task._id}`,
        metadata: {
          approver: approver.fullName,
        },
      });

      // Notify manager that task is complete
      if (task.assignedBy._id.toString() !== task.assignedTo._id.toString()) {
        await createNotification({
          userId: task.assignedBy._id,
          title: "Task Completed",
          message: `Task "${task.title}" has been completed by ${task.assignedTo.fullName}`,
          type: "success",
          category: "task",
          taskId: task._id,
          taskTitle: task.title,
          actionUrl: `/tasks/${task._id}`,
        });
      }

      return true;
    } catch (error) {
      console.error("Error sending approved notification:", error);
      return false;
    }
  }

  // Send task rejected notification
  static async sendTaskRejected(taskId, reviewerId, reason) {
    try {
      const task = await Task.findById(taskId)
        .populate("assignedTo", "fullName email")
        .populate("assignedBy", "fullName email");

      if (!task || !task.assignedTo?.email) return false;

      const reviewer = await User.findById(reviewerId).select("fullName email");

      // Send email to assignee
      const template = EmailTemplates.taskRejected(
        task,
        task.assignedTo,
        reviewer,
        reason,
      );
      await sendEmail(
        task.assignedTo.email,
        `❌ Task Rejected: ${task.title}`,
        template,
      );

      // Create database notification for assignee
      await createNotification({
        userId: task.assignedTo._id,
        title: "Task Rejected",
        message: `Your task "${task.title}" was rejected by ${reviewer.fullName}. Reason: ${reason}`,
        type: "error",
        category: "task",
        taskId: task._id,
        taskTitle: task.title,
        actionUrl: `/tasks/${task._id}`,
        metadata: {
          reviewer: reviewer.fullName,
          reason: reason,
        },
      });

      return true;
    } catch (error) {
      console.error("Error sending rejected notification:", error);
      return false;
    }
  }

  // Send due soon reminder
  static async sendDueReminder(taskId, daysRemaining) {
    try {
      const task = await Task.findById(taskId).populate(
        "assignedTo",
        "fullName email",
      );

      if (!task || !task.assignedTo?.email) return false;

      // Send email
      const template = EmailTemplates.taskDueSoon(
        task,
        task.assignedTo,
        daysRemaining,
      );
      await sendEmail(
        task.assignedTo.email,
        `⚠️ Task Due Soon: ${task.title}`,
        template,
      );

      // Create database notification
      await createNotification({
        userId: task.assignedTo._id,
        title: "Task Due Soon",
        message: `Task "${task.title}" is due in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`,
        type: "warning",
        category: "reminder",
        taskId: task._id,
        taskTitle: task.title,
        actionUrl: `/tasks/${task._id}`,
        metadata: {
          deadline: task.deadline,
          daysRemaining,
        },
      });

      // Also notify manager
      if (
        task.assignedBy &&
        task.assignedBy._id.toString() !== task.assignedTo._id.toString()
      ) {
        await createNotification({
          userId: task.assignedBy._id,
          title: "Task Due Soon for Team Member",
          message: `Task "${task.title}" assigned to ${task.assignedTo.fullName} is due in ${daysRemaining} days`,
          type: "info",
          category: "reminder",
          taskId: task._id,
          taskTitle: task.title,
          actionUrl: `/tasks/${task._id}`,
        });
      }

      return true;
    } catch (error) {
      console.error("Error sending due reminder:", error);
      return false;
    }
  }

  // Send overdue notification
  static async sendOverdueNotification(taskId) {
    try {
      const task = await Task.findById(taskId).populate(
        "assignedTo",
        "fullName email",
      );

      if (!task || !task.assignedTo?.email) return false;

      // Send email
      const template = EmailTemplates.taskOverdue(task, task.assignedTo);
      await sendEmail(
        task.assignedTo.email,
        `⚠️ TASK OVERDUE: ${task.title}`,
        template,
      );

      // Create database notification for assignee
      await createNotification({
        userId: task.assignedTo._id,
        title: "Task Overdue",
        message: `Task "${task.title}" is overdue. Please update status or request extension.`,
        type: "error",
        category: "reminder",
        taskId: task._id,
        taskTitle: task.title,
        actionUrl: `/tasks/${task._id}`,
        metadata: {
          deadline: task.deadline,
          overdueDays: Math.ceil(
            (new Date() - new Date(task.deadline)) / (1000 * 60 * 60 * 24),
          ),
        },
      });

      // Notify manager
      if (
        task.assignedBy &&
        task.assignedBy._id.toString() !== task.assignedTo._id.toString()
      ) {
        await createNotification({
          userId: task.assignedBy._id,
          title: "Task Overdue - Team Member",
          message: `Task "${task.title}" assigned to ${task.assignedTo.fullName} is overdue`,
          type: "warning",
          category: "reminder",
          taskId: task._id,
          taskTitle: task.title,
          actionUrl: `/tasks/${task._id}`,
        });
      }

      return true;
    } catch (error) {
      console.error("Error sending overdue notification:", error);
      return false;
    }
  }

  // Send comment notification
  static async sendCommentNotification(taskId, comment, commenterId) {
    try {
      const task = await Task.findById(taskId).populate(
        "assignedTo",
        "fullName email",
      );

      if (!task || !task.assignedTo?.email) return false;

      const commenter =
        await User.findById(commenterId).select("fullName email");

      // Don't notify if commenting on own task
      if (commenterId.toString() === task.assignedTo._id.toString())
        return false;

      // Create database notification
      await createNotification({
        userId: task.assignedTo._id,
        title: "New Comment",
        message: `${commenter.fullName} commented on task "${task.title}": "${comment.content.substring(0, 100)}${comment.content.length > 100 ? "..." : ""}"`,
        type: "info",
        category: "comment",
        taskId: task._id,
        taskTitle: task.title,
        actionUrl: `/tasks/${task._id}`,
        metadata: {
          commenter: commenter.fullName,
          commentId: comment._id,
        },
      });

      return true;
    } catch (error) {
      console.error("Error sending comment notification:", error);
      return false;
    }
  }

  // Scheduled jobs
  static async checkDueSoonTasks() {
    try {
      const today = new Date();
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(today.getDate() + 3);

      const tasks = await Task.find({
        deadline: { $gte: today, $lte: threeDaysFromNow },
        status: { $nin: ["completed", "rejected"] },
      }).populate("assignedTo", "fullName email");

      for (const task of tasks) {
        const daysRemaining = Math.ceil(
          (new Date(task.deadline) - new Date()) / (1000 * 60 * 60 * 24),
        );
        await NotificationService.sendDueReminder(task._id, daysRemaining);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      console.log(`✅ Sent ${tasks.length} due soon reminders`);
    } catch (error) {
      console.error("Error in due soon check:", error);
    }
  }

  static async checkOverdueTasks() {
    try {
      const overdueTasks = await Task.find({
        deadline: { $lt: new Date() },
        status: { $nin: ["completed", "rejected", "overdue"] },
      }).populate("assignedTo", "fullName email");

      for (const task of overdueTasks) {
        task.status = "overdue";
        await task.save();
        await NotificationService.sendOverdueNotification(task._id);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      console.log(`✅ Marked ${overdueTasks.length} tasks as overdue`);
    } catch (error) {
      console.error("Error in overdue check:", error);
    }
  }
  static async sendFeedbackNotification(feedbackId, adminId, userName, category, subject) {
    try {
      const categoryLabels = {
        bug: "🐛 Bug Report",
        feature: "✨ Feature Request",
        improvement: "📈 Improvement",
        praise: "🌟 Praise",
        general: "📝 General",
        issue: "⚠️ Issue",
      };

      const categoryLabel = categoryLabels[category] || category;

      await createNotification({
        userId: adminId,
        title: "📝 New Feedback Received",
        message: `${userName} submitted ${categoryLabel}: "${subject.substring(0, 80)}${subject.length > 80 ? '...' : ''}"`,
        type: "info",
        category: "feedback",
        feedbackId: feedbackId,
        actionUrl: `/feedback/${feedbackId}`,
        metadata: {
          userName,
          category,
          subject,
          feedbackId,
        },
      });

      console.log(`✅ Feedback notification sent to admin: ${adminId}`);
      return true;
    } catch (error) {
      console.error("Failed to send feedback notification:", error);
      return false;
    }
  }

  /**
   * Send notification to user about feedback status update
   */
  static async sendFeedbackStatusUpdate(feedbackId, userId, oldStatus, newStatus) {
    try {
      await createNotification({
        userId,
        title: "📋 Feedback Status Updated",
        message: `Your feedback status has been updated from "${oldStatus}" to "${newStatus}"`,
        type: "info",
        category: "feedback",
        feedbackId: feedbackId,
        actionUrl: `/feedback`,
        metadata: {
          oldStatus,
          newStatus,
          feedbackId,
        },
      });

      console.log(`✅ Status update notification sent to user: ${userId}`);
      return true;
    } catch (error) {
      console.error("Failed to send status update notification:", error);
      return false;
    }
  }

  /**
   * Send notification to user about admin reply to feedback
   */
  static async sendFeedbackReply(feedbackId, userId, adminName, message) {
    try {
      const shortMessage = message.substring(0, 100);
      const truncated = message.length > 100 ? '...' : '';

      await createNotification({
        userId,
        title: "💬 New Reply to Your Feedback",
        message: `${adminName} replied to your feedback: "${shortMessage}${truncated}"`,
        type: "info",
        category: "feedback",
        feedbackId: feedbackId,
        actionUrl: `/feedback`,
        metadata: {
          adminName,
          message,
          feedbackId,
        },
      });

      console.log(`✅ Reply notification sent to user: ${userId}`);
      return true;
    } catch (error) {
      console.error("Failed to send reply notification:", error);
      return false;
    }
  }

  /**
   * Send notification to admins about high priority feedback
   */
  static async sendFeedbackAlert(feedbackId, adminId, userName, priority, subject) {
    try {
      const priorityEmojis = {
        low: "🟢",
        medium: "🟡",
        high: "🟠",
        critical: "🔴",
      };

      const emoji = priorityEmojis[priority] || "📝";

      await createNotification({
        userId: adminId,
        title: `${emoji} ${priority.toUpperCase()} Priority Feedback`,
        message: `${userName} submitted ${priority} priority feedback: "${subject.substring(0, 60)}${subject.length > 60 ? '...' : ''}"`,
        type: priority === "critical" || priority === "high" ? "warning" : "info",
        category: "feedback",
        feedbackId: feedbackId,
        actionUrl: `/feedback/${feedbackId}`,
        metadata: {
          userName,
          priority,
          subject,
          feedbackId,
        },
      });

      console.log(`✅ Alert notification sent to admin: ${adminId}`);
      return true;
    } catch (error) {
      console.error("Failed to send feedback alert:", error);
      return false;
    }
  }
}


// Scheduled jobs
const startScheduledJobs = () => {
  // Check for due soon tasks - runs every day at 9 AM
  cron.schedule("0 9 * * *", () => {
    console.log("🔍 Checking for tasks due soon...");
    NotificationService.checkDueSoonTasks();
  });

  // Check for overdue tasks - runs every 6 hours
  cron.schedule("0 */6 * * *", () => {
    console.log("🔍 Checking for overdue tasks...");
    NotificationService.checkOverdueTasks();
  });

  console.log("✅ Scheduled notification jobs started");
};

module.exports = { NotificationService, startScheduledJobs };
