const { Comment } = require("../models/Comment.model");
const { Task } = require("../models/Task.model");
const { User } = require("../models/User.model");
const mongoose = require("mongoose");
const { createNotification } = require("./notification.controller");
const { sendEmail } = require("../config/email.config");

// Email template for comment notification
const getCommentEmailTemplate = (
  task,
  comment,
  commenter,
  recipient,
  isReply = false,
) => {
  const title = isReply
    ? "💬 New Reply to Your Comment"
    : "💬 New Comment on Task";
  const description = isReply
    ? `${commenter.fullName} replied to your comment on task "${task.title}"`
    : `${commenter.fullName} added a comment to task "${task.title}"`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .comment-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
        .task-info { background: #e9ecef; padding: 10px 15px; border-radius: 5px; margin: 10px 0; font-size: 14px; }
        .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; text-align: center; font-size: 12px; color: #6c757d; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${title}</h1>
      </div>
      <div class="content">
        <p>Hello <strong>${recipient.fullName}</strong>,</p>
        <p>${description}</p>
        
        <div class="task-info">
          <strong>Task:</strong> ${task.title}<br>
          <strong>Project:</strong> ${task.projectId?.name || "N/A"}<br>
          <strong>Status:</strong> ${task.status.replace(/_/g, " ").toUpperCase()}
        </div>
        
        <div class="comment-box">
          <p style="font-style: italic; margin: 0;">"${comment.content}"</p>
          <p style="margin-top: 10px; font-size: 12px; color: #666;">— ${commenter.fullName}</p>
        </div>
        
        <a href="${process.env.FRONTEND_URL}/tasks/${task._id}" class="button">View Task & Reply →</a>
        
        <div class="footer">
          <p>You're receiving this because you're assigned to this task or have commented on it.</p>
          <p>To unsubscribe from notifications, update your profile settings.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Get all comments for a task (with nested replies)
const getTaskComments = async (req, res) => {
  try {
    const { id: taskId } = req.params;

    // First, verify task exists
    const task = await Task.findById(taskId);
    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    // Get all comments for this task
    const allComments = await Comment.find({ taskId })
      .populate("author", "fullName email avatar")
      .sort({ createdAt: 1 });

    // Build nested comment structure
    const commentMap = {};
    const rootComments = [];

    allComments.forEach((comment) => {
      const commentObj = comment.toObject();
      commentMap[commentObj._id.toString()] = commentObj;
      commentMap[commentObj._id.toString()].replies = [];
    });

    allComments.forEach((comment) => {
      const commentObj = comment.toObject();
      if (commentObj.parentCommentId) {
        const parentId = commentObj.parentCommentId.toString();
        if (commentMap[parentId]) {
          commentMap[parentId].replies.push(
            commentMap[commentObj._id.toString()],
          );
        } else {
          rootComments.push(commentMap[commentObj._id.toString()]);
        }
      } else {
        rootComments.push(commentMap[commentObj._id.toString()]);
      }
    });

    res.json({
      success: true,
      data: rootComments,
      count: rootComments.length,
    });
  } catch (error) {
    console.error("Get task comments error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
};

// Send comment notifications to all relevant users
const sendCommentNotifications = async (
  task,
  comment,
  commenter,
  parentComment = null,
) => {
  try {
    const recipients = new Set(); // Use Set to avoid duplicates

    // 1. Notify task assignee - ensure we're using the ID string
    if (
      task.assignedTo &&
      task.assignedTo.toString() !== commenter._id.toString()
    ) {
      const assigneeId = task.assignedTo._id || task.assignedTo;
      recipients.add(assigneeId.toString());
    }

    // 2. Notify task creator (assignedBy)
    if (
      task.assignedBy &&
      task.assignedBy.toString() !== commenter._id.toString()
    ) {
      const creatorId = task.assignedBy._id || task.assignedBy;
      recipients.add(creatorId.toString());
    }

    // 3. If this is a reply, notify the parent comment author
    if (
      parentComment &&
      parentComment.author &&
      parentComment.author.toString() !== commenter._id.toString()
    ) {
      const parentAuthorId = parentComment.author._id || parentComment.author;
      recipients.add(parentAuthorId.toString());
    }

    // 4. Get all users who have commented on this task (excluding current commenter)
    const previousCommenters = await Comment.find({
      taskId: task._id,
      author: { $ne: commenter._id },
    }).distinct("author");

    previousCommenters.forEach((commenterId) => {
      if (commenterId && commenterId.toString() !== commenter._id.toString()) {
        recipients.add(commenterId.toString());
      }
    });

    // Convert Set to Array of valid ObjectIds
    const recipientIds = Array.from(recipients).filter(
      (id) => id && id.length === 24,
    );

    if (recipientIds.length === 0) {
      console.log("No recipients to notify for comment");
      return true;
    }

    // Get user details for all recipients
    const recipientUsers = await User.find({
      _id: { $in: recipientIds },
      isActive: true,
    }).select("_id fullName email");

    console.log(
      `📧 Sending comment notifications to ${recipientUsers.length} recipients`,
    );

    // Send notifications to each recipient
    for (const recipient of recipientUsers) {
      // Skip if recipient is the commenter
      if (recipient._id.toString() === commenter._id.toString()) {
        continue;
      }

      // Create in-app notification
      await createNotification({
        userId: recipient._id,
        title: parentComment
          ? "New Reply to Your Comment"
          : "New Comment on Task",
        message: parentComment
          ? `${commenter.fullName} replied to your comment on "${task.title}"`
          : `${commenter.fullName} commented on "${task.title}"`,
        type: "info",
        category: "comment",
        taskId: task._id,
        taskTitle: task.title,
        actionUrl: `/tasks/${task._id}`,
        metadata: {
          commentId: comment._id,
          commentContent: comment.content.substring(0, 100),
          commenter: commenter.fullName,
          isReply: !!parentComment,
        },
      });

      // Send email notification
      const emailTemplate = getCommentEmailTemplate(
        task,
        comment,
        commenter,
        recipient,
        !!parentComment,
      );
      await sendEmail(
        recipient.email,
        parentComment
          ? `💬 New Reply: ${task.title}`
          : `💬 New Comment: ${task.title}`,
        emailTemplate,
      );

      console.log(`📧 Comment notification sent to ${recipient.email}`);
    }

    console.log(
      `✅ Sent comment notifications to ${recipientUsers.length} recipients`,
    );
    return true;
  } catch (error) {
    console.error("Error sending comment notifications:", error);
    return false;
  }
};

// Add a comment to a task
const addComment = async (req, res) => {
  try {
    const { id: taskId } = req.params;
    const { content, parentCommentId } = req.body;

    if (!content || !content.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Comment content is required" });
    }

    // Verify task exists and get full details
    const task = await Task.findById(taskId)
      .populate("assignedTo", "fullName email")
      .populate("assignedBy", "fullName email")
      .populate("projectId", "name code");

    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    // Get commenter details
    const commenter = await User.findById(req.user._id).select(
      "fullName email",
    );

    if (!commenter) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Check if this is a reply
    let parentComment = null;
    if (parentCommentId) {
      parentComment = await Comment.findById(parentCommentId).populate(
        "author",
        "fullName email",
      );
      if (!parentComment) {
        return res
          .status(404)
          .json({ success: false, message: "Parent comment not found" });
      }
    }

    // Create the comment
    const comment = await Comment.create({
      taskId,
      content: content.trim(),
      author: req.user._id,
      parentCommentId: parentCommentId || null,
    });

    // Increment task's comment count
    await Task.findByIdAndUpdate(taskId, {
      $inc: { commentsCount: 1 },
    });

    const populatedComment = await Comment.findById(comment._id).populate(
      "author",
      "fullName email avatar",
    );

    // Send notifications (email + in-app)
    await sendCommentNotifications(
      task,
      populatedComment,
      commenter,
      parentComment,
    );

    res.status(201).json({
      success: true,
      message: "Comment added successfully and notifications sent",
      data: populatedComment,
    });
  } catch (error) {
    console.error("Add comment error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
};

// Update a comment
const updateComment = async (req, res) => {
  try {
    const { id: taskId, commentId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Comment content is required" });
    }

    const comment = await Comment.findOne({ _id: commentId, taskId });

    if (!comment) {
      return res
        .status(404)
        .json({ success: false, message: "Comment not found" });
    }

    // Check if user is the author or has admin role
    if (
      comment.author.toString() !== req.user._id.toString() &&
      !["admin", "super_admin"].includes(req.user.role)
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized to edit this comment" });
    }

    comment.content = content.trim();
    comment.isEdited = true;
    comment.editedAt = new Date();
    await comment.save();

    const updatedComment = await Comment.findById(commentId).populate(
      "author",
      "fullName email avatar",
    );

    res.json({
      success: true,
      message: "Comment updated successfully",
      data: updatedComment,
    });
  } catch (error) {
    console.error("Update comment error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
};

// Delete a comment
const deleteComment = async (req, res) => {
  try {
    const { id: taskId, commentId } = req.params;

    const comment = await Comment.findOne({ _id: commentId, taskId });

    if (!comment) {
      return res
        .status(404)
        .json({ success: false, message: "Comment not found" });
    }

    // Check if user is the author or has admin role
    if (
      comment.author.toString() !== req.user._id.toString() &&
      !["admin", "super_admin", "dept_manager"].includes(req.user.role)
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to delete this comment",
      });
    }

    // Count how many comments will be deleted (including replies)
    const replyCount = await Comment.countDocuments({
      parentCommentId: commentId,
    });

    // Delete all replies to this comment
    await Comment.deleteMany({ parentCommentId: commentId });
    await comment.deleteOne();

    // Update task's comment count
    await Task.findByIdAndUpdate(taskId, {
      $inc: { commentsCount: -(1 + replyCount) },
    });

    res.json({
      success: true,
      message: "Comment and its replies deleted successfully",
    });
  } catch (error) {
    console.error("Delete comment error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
};

// Like/unlike a comment
const toggleCommentLike = async (req, res) => {
  try {
    const { id: taskId, commentId } = req.params;
    const userId = req.user._id;

    const comment = await Comment.findOne({ _id: commentId, taskId });

    if (!comment) {
      return res
        .status(404)
        .json({ success: false, message: "Comment not found" });
    }

    const likeIndex = comment.likes.findIndex(
      (id) => id.toString() === userId.toString(),
    );

    if (likeIndex === -1) {
      comment.likes.push(userId);
    } else {
      comment.likes.splice(likeIndex, 1);
    }

    await comment.save();

    res.json({
      success: true,
      message: likeIndex === -1 ? "Comment liked" : "Comment unliked",
      data: { likesCount: comment.likes.length, isLiked: likeIndex === -1 },
    });
  } catch (error) {
    console.error("Toggle comment like error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
};

module.exports = {
  getTaskComments,
  addComment,
  updateComment,
  deleteComment,
  toggleCommentLike,
};
