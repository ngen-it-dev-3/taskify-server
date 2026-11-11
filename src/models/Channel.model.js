// models/Channel.model.js
const mongoose = require("mongoose");

const channelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["channel", "project", "direct"],
      default: "channel",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    topic: {
      type: String,
      trim: true,
      default: "",
    },
    // ============================================================
    // 🔥 AVATAR - Base64 Image Support
    // ============================================================
    avatar: {
      type: String,
      default: null,
      validate: {
        validator: function (v) {
          if (!v) return true;
          // Validate base64 image format
          return /^data:image\/(jpeg|png|gif|webp|svg\+xml);base64,/.test(v);
        },
        message: 'Avatar must be a valid base64 encoded image'
      }
    },
    iconType: {
      type: String,
      enum: ["building", "laptop", "briefcase", "receipt", "box", "file"],
      default: "building",
    },
    iconBg: {
      type: String,
      default: "#4F46E5",
    },
    members: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        role: {
          type: String,
          enum: ["member", "admin", "moderator"],
          default: "member",
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    unreadCount: {
      type: Number,
      default: 0,
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    // ============================================================
    // 🔥 PINNED FILES - Full Schema
    // ============================================================
    pinnedFiles: [
      {
        name: {
          type: String,
          required: true,
        },
        url: {
          type: String,
          required: true,
        },
        size: {
          type: Number,
          default: 0,
        },
        type: {
          type: String,
          enum: ["image", "file", "message", "pdf", "spreadsheet", "document"],
          default: "file",
        },
        messageId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Message",
          default: null,
        },
        uploadedBy: {
          _id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
          },
          fullName: {
            type: String,
            required: true,
          },
          avatar: {
            type: String,
            default: null,
          },
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    // ============================================================
    // 🔥 LINKED TASKS - Full Schema (UPDATED)
    // ============================================================
    linkedTasks: [
      {
        taskId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Task",
          required: true,
        },
        title: {
          type: String,
          required: true,
        },
        status: {
          type: String,
          enum: ["pending", "in-progress", "in_progress", "completed", "cancelled", "overdue", "blocked", "todo", "doing", "done"],
          default: "pending",
        },
        priority: {
          type: String,
          enum: ["low", "medium", "high", "urgent", "critical"],
          default: "medium",
        },
        progress: {
          type: Number,
          min: 0,
          max: 100,
          default: 0,
        },
        assignedTo: {
          _id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          fullName: {
            type: String,
          },
          avatar: {
            type: String,
            default: null,
          },
        },
        linkedBy: {
          _id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          fullName: {
            type: String,
          },
        },
        linkedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// ============================================================
// INDEXES
// ============================================================
channelSchema.index({ name: 1, type: 1 });
channelSchema.index({ "members.userId": 1 });
channelSchema.index({ createdBy: 1 });
channelSchema.index({ isArchived: 1 });
channelSchema.index({ updatedAt: -1 });
channelSchema.index({ "pinnedFiles.uploadedAt": -1 });
channelSchema.index({ "linkedTasks.taskId": 1 });

// ============================================================
// VIRTUALS
// ============================================================
// Member count
channelSchema.virtual("memberCount").get(function () {
  return this.members.length;
});

// Online members count
channelSchema.virtual("onlineCount").get(function () {
  return this.members.filter((m) => m.userId?.onlineStatus === "online").length;
});

// Pinned files count
channelSchema.virtual("pinnedCount").get(function () {
  return this.pinnedFiles.length;
});

// Linked tasks count
channelSchema.virtual("tasksCount").get(function () {
  return this.linkedTasks.length;
});

// ============================================================
// METHODS
// ============================================================
// Add pinned file
channelSchema.methods.addPinnedFile = function (fileData) {
  this.pinnedFiles.push(fileData);
  return this.save();
};

// Remove pinned file
channelSchema.methods.removePinnedFile = function (fileId) {
  this.pinnedFiles = this.pinnedFiles.filter(
    (f) => f._id.toString() !== fileId
  );
  return this.save();
};

// Add linked task
channelSchema.methods.addLinkedTask = function (taskData) {
  this.linkedTasks.push(taskData);
  return this.save();
};

// Remove linked task
channelSchema.methods.removeLinkedTask = function (taskId) {
  this.linkedTasks = this.linkedTasks.filter(
    (t) => t.taskId.toString() !== taskId
  );
  return this.save();
};

// ============================================================
// STATICS
// ============================================================
// Find channels by member
channelSchema.statics.findByMember = function (userId) {
  return this.find({
    "members.userId": userId,
    isArchived: false,
  }).sort({ updatedAt: -1 });
};

// Find pinned files in channel
channelSchema.statics.findPinnedFiles = function (channelId, limit = 10) {
  return this.findById(channelId)
    .select("pinnedFiles")
    .then((channel) => {
      if (!channel) return [];
      return channel.pinnedFiles.slice(0, limit);
    });
};

// ============================================================
// MIDDLEWARE
// ============================================================
// Update updatedAt on save
channelSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// Ensure virtuals are included in JSON output
channelSchema.set("toJSON", { virtuals: true });
channelSchema.set("toObject", { virtuals: true });

const Channel = mongoose.model("Channel", channelSchema);

module.exports = { Channel };