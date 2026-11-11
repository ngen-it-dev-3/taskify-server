// controllers/message.controller.js
const path = require("path"); // ✅ IMPORTANT: Add this at the top
const { Message } = require("../models/Message.model");
const { Channel } = require("../models/Channel.model");
const { User } = require("../models/User.model");
const { Task } = require("../models/Task.model");
const { Notification } = require("../models/Notification.model");
const { getFileType, getFileIcon } = require("../middleware/upload.middleware");

// ============================================================
// SEND MESSAGE - WITH FILE UPLOAD SUPPORT
// ============================================================
const sendMessage = async (req, res) => {
  try {
    const { channelId } = req.params;
    const { content, type, linkedTaskId, replyTo, mentions } = req.body;
    const userId = req.user._id;

    // Check if channel exists
    const channel = await Channel.findById(channelId).select("members");
    if (!channel) {
      return res.status(404).json({
        success: false,
        message: "Channel not found",
      });
    }

    // Check if user is a member
    const isMember = channel.members.some(
      (m) => m.userId.toString() === userId.toString()
    );
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this channel",
      });
    }

    // Process attachments from uploaded files
    let attachments = [];
    let messageType = type || "text";

    if (req.files && req.files.length > 0) {
      console.log("📎 Processing files:", req.files.map(f => ({
        name: f.originalname,
        destination: f.destination,
        filename: f.filename,
        size: f.size,
        mimetype: f.mimetype
      })));

      // Process each uploaded file
      attachments = req.files.map((file) => {
        const fileType = getFileType(file.mimetype);

        // ✅ FIX: Get the subdirectory name correctly from the destination path
        // file.destination: E:\...\uploads\chat\images
        // path.basename(file.destination) => "images"
        const subDir = path.basename(file.destination);

        // ✅ Build the URL correctly
        const url = `/uploads/chat/${subDir}/${file.filename}`;

        console.log(`📎 File URL: ${url}`);

        return {
          name: file.originalname,
          url: url,
          size: file.size,
          mimeType: file.mimetype,
          type: fileType,
        };
      });

      // If there are files, set message type to file (or image if all are images)
      const allImages = attachments.every(a => a.type === "image");
      messageType = allImages ? "image" : "file";
    }

    // Process mentions
    let processedMentions = [];
    if (mentions && Array.isArray(mentions)) {
      processedMentions = mentions.map((mention) => ({
        userId: mention.userId || mention,
        name: mention.name || "Unknown",
      }));
    }

    // Create message
    const message = new Message({
      channelId,
      senderId: userId,
      content: content || "",
      type: messageType,
      attachments: attachments,
      linkedTaskId: linkedTaskId || null,
      replyTo: replyTo || null,
      mentions: processedMentions,
    });

    await message.save();
    console.log("✅ Message saved with attachments:", attachments.length);

    // Populate sender details
    const populatedMessage = await Message.findById(message._id)
      .populate("senderId", "fullName email avatar")
      .populate({
        path: "replyTo",
        populate: {
          path: "senderId",
          select: "fullName email avatar",
        },
      })
      .populate("mentions.userId", "fullName email");

    // Update channel lastMessage
    Channel.findByIdAndUpdate(channelId, {
      lastMessage: message._id,
      updatedAt: new Date(),
    }).exec();

    // Broadcast socket event
    const io = req.app.get("io");
    if (io) {
      const channelIdStr = channelId.toString();
      const payload = {
        message: populatedMessage,
        channelId: channelIdStr,
        userId: userId.toString(),
      };

      io.to(channelIdStr).to(`channel-${channelIdStr}`).emit("message:new", payload);
      console.log("📤 Socket event emitted: message:new");
    }

    return res.status(201).json({
      success: true,
      data: populatedMessage,
      message: "Message sent successfully",
    });
  } catch (error) {
    console.error("❌ Send message error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ============================================================
// GET CHANNEL MESSAGES
// ============================================================
const getChannelMessages = async (req, res) => {
  try {
    const { channelId } = req.params;
    const { limit = 50, skip = 0 } = req.query;
    const currentUserId = req.user._id;

    const channel = await Channel.findById(channelId).select("members").lean();
    if (!channel) {
      return res.status(404).json({ success: false, message: "Channel not found" });
    }

    const isMember = channel.members.some(
      (m) => m.userId.toString() === currentUserId.toString()
    );
    if (!isMember) {
      return res.status(403).json({ success: false, message: "You are not a member of this channel" });
    }

    const messages = await Message.find({ channelId })
      .populate("senderId", "fullName email avatar")
      .populate({
        path: "replyTo",
        populate: { path: "senderId", select: "fullName email avatar" },
      })
      .populate("mentions.userId", "fullName")
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .lean();

    // Mark messages as read in background
    Message.updateMany(
      {
        channelId,
        "readBy.userId": { $ne: currentUserId },
        senderId: { $ne: currentUserId },
      },
      {
        $push: {
          readBy: { userId: currentUserId, readAt: new Date() },
        },
      }
    ).exec();

    return res.status(200).json({
      success: true,
      data: messages.reverse(),
      count: messages.length,
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch messages", error: error.message });
  }
};

// ============================================================
// EDIT MESSAGE
// ============================================================
const editMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const currentUserId = req.user._id;

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message content is required",
      });
    }

    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    if (message.senderId.toString() !== currentUserId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You can only edit your own messages",
      });
    }

    message.content = content.trim();
    message.isEdited = true;
    await message.save();

    const populatedMessage = await Message.findById(message._id)
      .populate("senderId", "fullName email avatar")
      .populate("replyTo", "content senderId")
      .lean();

    const io = req.app.get("io");
    if (io) {
      const channelIdStr = message.channelId.toString();
      const payload = {
        channelId: channelIdStr,
        message: populatedMessage,
      };

      io.to(channelIdStr).to(`channel-${channelIdStr}`).emit("message:updated", payload);
    }

    return res.status(200).json({
      success: true,
      message: "Message updated successfully",
      data: populatedMessage,
    });
  } catch (error) {
    console.error("Error editing message:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to edit message",
      error: error.message,
    });
  }
};

// ============================================================
// DELETE MESSAGE
// ============================================================
const deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user._id;

    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    const channel = await Channel.findById(message.channelId).select("members").lean();
    const userMember = channel?.members.find(
      (m) => m.userId.toString() === currentUserId.toString()
    );

    const isAdmin = userMember?.role === "admin";
    const isSender = message.senderId.toString() === currentUserId.toString();

    if (!isSender && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own messages or be an admin",
      });
    }

    message.isDeleted = true;
    message.content = "";
    message.attachments = [];
    await message.save();

    const io = req.app.get("io");
    if (io) {
      const channelIdStr = message.channelId.toString();
      const payload = {
        channelId: channelIdStr,
        messageId: message._id.toString(),
      };

      io.to(channelIdStr).to(`channel-${channelIdStr}`).emit("message:deleted", payload);
    }

    return res.status(200).json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting message:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete message",
      error: error.message,
    });
  }
};

// ============================================================
// ADD REACTION
// ============================================================
const addReaction = async (req, res) => {
  try {
    const messageId = req.params.id || req.params.messageId;
    const { emoji } = req.body;
    const currentUserId = req.user._id;

    if (!emoji) {
      return res.status(400).json({ success: false, message: "Emoji is required" });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    // Check if user already has this exact reaction active
    const alreadyHasThisEmoji = message.reactions.some(
      (r) => r.emoji === emoji && r.userId.toString() === currentUserId.toString()
    );

    // Filter out ANY previous reaction from this user
    message.reactions = message.reactions.filter(
      (r) => r.userId.toString() !== currentUserId.toString()
    );

    // If clicking a different emoji, add the new one
    if (!alreadyHasThisEmoji) {
      message.reactions.push({
        emoji,
        userId: currentUserId,
      });
    }

    await message.save();

    const io = req.app.get("io");
    if (io) {
      const channelIdStr = message.channelId.toString();
      const payload = {
        channelId: channelIdStr,
        messageId: message._id.toString(),
        reactions: message.reactions,
      };

      io.to(channelIdStr).to(`channel-${channelIdStr}`).emit("message:reaction", payload);
    }

    return res.status(200).json({
      success: true,
      data: message.reactions,
    });
  } catch (error) {
    console.error("Error updating reaction:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update reaction",
      error: error.message,
    });
  }
};

// ============================================================
// REMOVE REACTION
// ============================================================
const removeReaction = async (req, res) => {
  try {
    const messageId = req.params.id || req.params.messageId;
    const { emoji } = req.body;
    const currentUserId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    message.reactions = message.reactions.filter((r) => {
      if (emoji) {
        return !(r.emoji === emoji && r.userId.toString() === currentUserId.toString());
      }
      return r.userId.toString() !== currentUserId.toString();
    });

    await message.save();

    const io = req.app.get("io");
    if (io) {
      const channelIdStr = message.channelId.toString();
      const payload = {
        channelId: channelIdStr,
        messageId: message._id.toString(),
        reactions: message.reactions,
      };

      io.to(channelIdStr).to(`channel-${channelIdStr}`).emit("message:reaction", payload);
    }

    return res.status(200).json({
      success: true,
      data: message.reactions,
    });
  } catch (error) {
    console.error("Error removing reaction:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove reaction",
    });
  }
};

// ============================================================
// MARK MESSAGES AS READ
// ============================================================
const markMessagesAsRead = async (req, res) => {
  try {
    const { channelId } = req.params;
    const currentUserId = req.user._id;

    await Message.updateMany(
      {
        channelId,
        "readBy.userId": { $ne: currentUserId },
        senderId: { $ne: currentUserId },
      },
      {
        $push: {
          readBy: {
            userId: currentUserId,
            readAt: new Date(),
          },
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: "Messages marked as read",
    });
  } catch (error) {
    console.error("Error marking messages as read:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to mark messages as read",
      error: error.message,
    });
  }
};

// ============================================================
// PIN MESSAGE
// ============================================================
const pinMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user._id;

    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    const channel = await Channel.findById(message.channelId);
    if (!channel) {
      return res.status(404).json({
        success: false,
        message: "Channel not found",
      });
    }

    const isMember = channel.members.some(
      (m) => m.userId.toString() === currentUserId.toString()
    );

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this channel",
      });
    }

    message.isPinned = !message.isPinned;
    await message.save();

    if (message.isPinned) {
      const exists = channel.pinnedFiles.some(
        (f) => f.messageId?.toString() === message._id.toString()
      );

      if (!exists) {
        await Channel.findByIdAndUpdate(message.channelId, {
          $push: {
            pinnedFiles: {
              name: message.content || "Pinned message",
              url: `/messages/${message._id}`,
              size: 0,
              type: "message",
              messageId: message._id,
              uploadedBy: {
                _id: currentUserId,
                fullName: req.user.fullName,
              },
              uploadedAt: new Date(),
            },
          },
        });
      }
    } else {
      await Channel.findByIdAndUpdate(message.channelId, {
        $pull: {
          pinnedFiles: {
            messageId: message._id,
          },
        },
      });
    }

    const populatedMessage = await Message.findById(message._id)
      .populate("senderId", "fullName email avatar")
      .populate("replyTo", "content senderId")
      .populate("mentions.userId", "fullName email")
      .lean();

    const io = req.app.get("io");
    if (io) {
      const channelIdStr = message.channelId.toString();
      io.to(channelIdStr).to(`channel-${channelIdStr}`).emit("message:updated", {
        channelId: channelIdStr,
        message: populatedMessage,
      });

      io.to(channelIdStr).to(`channel-${channelIdStr}`).emit("pinned:updated", {
        channelId: channelIdStr,
      });
    }

    return res.status(200).json({
      success: true,
      message: message.isPinned ? "Message pinned successfully" : "Message unpinned successfully",
      data: populatedMessage,
    });
  } catch (error) {
    console.error("❌ Error pinning message:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to pin message",
      error: error.message,
    });
  }
};

// ============================================================
// GET PINNED MESSAGES
// ============================================================
const getPinnedMessages = async (req, res) => {
  try {
    const { channelId } = req.params;
    const currentUserId = req.user._id;

    const channel = await Channel.findById(channelId).select("members").lean();
    if (!channel) {
      return res.status(404).json({
        success: false,
        message: "Channel not found",
      });
    }

    const isMember = channel.members.some(
      (m) => m.userId.toString() === currentUserId.toString()
    );

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this channel",
      });
    }

    const messages = await Message.find({
      channelId,
      isPinned: true,
    })
      .populate("senderId", "fullName email avatar")
      .populate({
        path: "replyTo",
        populate: {
          path: "senderId",
          select: "fullName email avatar",
        },
      })
      .populate("mentions.userId", "fullName")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: messages,
      count: messages.length,
    });
  } catch (error) {
    console.error("Error fetching pinned messages:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch pinned messages",
      error: error.message,
    });
  }
};

// ============================================================
// GET MESSAGE BY ID
// ============================================================
const getMessageById = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user._id;

    const message = await Message.findById(id)
      .populate("senderId", "fullName email avatar")
      .populate("replyTo", "content senderId")
      .populate("mentions.userId", "fullName email")
      .lean();

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    const channel = await Channel.findById(message.channelId).select("members").lean();
    if (!channel) {
      return res.status(404).json({
        success: false,
        message: "Channel not found",
      });
    }

    const isMember = channel.members.some(
      (m) => m.userId.toString() === currentUserId.toString()
    );

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this message",
      });
    }

    return res.status(200).json({
      success: true,
      data: message,
    });
  } catch (error) {
    console.error("Error fetching message:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch message",
      error: error.message,
    });
  }
};

module.exports = {
  sendMessage,
  getChannelMessages,
  editMessage,
  deleteMessage,
  addReaction,
  markMessagesAsRead,
  pinMessage,
  getPinnedMessages,
  getMessageById,
  removeReaction,
};