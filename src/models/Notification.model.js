// models/Notification.model.js
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["info", "success", "warning", "error", "mention", "channel_invite"],
      default: "info",
    },
    category: {
      type: String,
      enum: ["task", "comment", "approval", "system", "reminder", "channel", "mention", "expense"],
      default: "system",
      index: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
    },
    taskTitle: {
      type: String,
    },
    userIdRelated: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    userEmail: String,
    userFullName: String,
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Channel",
    },
    channelName: {
      type: String,
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    actionUrl: String,
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    readAt: Date,
  },
  {
    timestamps: true,
  }
);

// Indexes
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ userId: 1, category: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1, category: 1 });
notificationSchema.index({ channelId: 1 });

// Static method to create channel invite notification
notificationSchema.statics.createChannelInvite = async function (data) {
  try {
    const notification = new this({
      userId: data.userId,
      title: data.title || `Invited to #${data.channelName}`,
      message: data.message || `${data.invitedBy} invited you to join #${data.channelName}`,
      type: "channel_invite",
      category: "channel",
      channelId: data.channelId,
      channelName: data.channelName,
      userIdRelated: data.invitedByUserId,
      userFullName: data.invitedBy,
      actionUrl: data.actionUrl || `/team-chat?channel=${data.channelId}`,
      metadata: {
        channelId: data.channelId,
        channelName: data.channelName,
        invitedBy: data.invitedBy,
        invitedByUserId: data.invitedByUserId,
      },
    });
    await notification.save();
    return notification;
  } catch (error) {
    console.error("Error creating channel invite notification:", error);
    return null;
  }
};

// Static method to create mention notification
notificationSchema.statics.createMention = async function (data) {
  try {
    const notification = new this({
      userId: data.userId,
      title: `Mentioned in #${data.channelName}`,
      message: `${data.mentionedBy} mentioned you: ${data.message?.substring(0, 100)}${data.message?.length > 100 ? '...' : ''}`,
      type: "mention",
      category: "mention",
      channelId: data.channelId,
      channelName: data.channelName,
      messageId: data.messageId,
      userIdRelated: data.mentionedByUserId,
      userFullName: data.mentionedBy,
      actionUrl: data.actionUrl || `/team-chat?channel=${data.channelId}&message=${data.messageId}`,
      metadata: {
        channelId: data.channelId,
        channelName: data.channelName,
        messageId: data.messageId,
        mentionedBy: data.mentionedBy,
        mentionedByUserId: data.mentionedByUserId,
        message: data.message,
      },
    });
    await notification.save();
    return notification;
  } catch (error) {
    console.error("Error creating mention notification:", error);
    return null;
  }
};

// Static method to create task notification
notificationSchema.statics.createTaskNotification = async function (data) {
  try {
    const notification = new this({
      userId: data.userId,
      title: data.title,
      message: data.message,
      type: data.type || "info",
      category: "task",
      taskId: data.taskId,
      taskTitle: data.taskTitle,
      userIdRelated: data.userIdRelated,
      userFullName: data.userFullName,
      actionUrl: data.actionUrl,
      metadata: data.metadata || {},
    });
    await notification.save();
    return notification;
  } catch (error) {
    console.error("Error creating task notification:", error);
    return null;
  }
};

module.exports = {
  Notification: mongoose.model("Notification", notificationSchema),
};