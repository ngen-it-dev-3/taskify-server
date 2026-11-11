// models/AIChat.model.js
const mongoose = require("mongoose");

const aiChatSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: "New Conversation",
      trim: true,
    },
    messages: [
      {
        role: {
          type: String,
          enum: ["user", "assistant", "system"],
          required: true,
        },
        content: {
          type: String,
          required: true,
        },
        sources: [
          {
            title: String,
            url: String,
            snippet: String,
          },
        ],
        model: {
          type: String,
          default: "gemini-2.0-flash",
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    model: {
      type: String,
      default: "gemini-2.0-flash",
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

aiChatSchema.index({ userId: 1, updatedAt: -1 });
aiChatSchema.index({ userId: 1, isPinned: -1 });

module.exports = { AIChat: mongoose.model("AIChat", aiChatSchema) };
