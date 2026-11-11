// src/models/TenderChatMessage.model.js
const mongoose = require("mongoose");

const AttachmentSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    url: { type: String, default: "" },
    size: { type: Number, default: 0 },
    mimeType: { type: String, default: "" },
    kind: {
      type: String,
      enum: ["image", "file", "audio", "video", ""],
      default: "",
    },
  },
  { _id: false },
);

const TenderChatMessageSchema = new mongoose.Schema(
  {
    tenderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tender",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    senderRole: {
      type: String,
      enum: ["user", "management"],
      default: "user",
      index: true,
    },
    senderName: { type: String, default: "" },
    senderPhoto: { type: String, default: "" },

    body: { type: String, default: "" },
    attachments: { type: [AttachmentSchema], default: [] },

    readByUser: { type: Boolean, default: false },
    readByMgmt: { type: Boolean, default: false },

    deleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

/* ============================================================
 * INDEXES — tuned for chat queries
 * ============================================================ */

// Message history for a tender (chronological)
TenderChatMessageSchema.index({ tenderId: 1, createdAt: 1 });

// Newest-first fetch (used by `listMessages` with reverse)
TenderChatMessageSchema.index({ tenderId: 1, createdAt: -1 });

// Inbox aggregation — match non-deleted, sort by createdAt
TenderChatMessageSchema.index({ deleted: 1, createdAt: -1 });

// Unread count for a viewer (used on every wizard mount)
TenderChatMessageSchema.index({
  tenderId: 1,
  senderRole: 1,
  readByMgmt: 1,
  deleted: 1,
});
TenderChatMessageSchema.index({
  tenderId: 1,
  senderRole: 1,
  readByUser: 1,
  deleted: 1,
});

module.exports =
  mongoose.models.TenderChatMessage ||
  mongoose.model("TenderChatMessage", TenderChatMessageSchema);