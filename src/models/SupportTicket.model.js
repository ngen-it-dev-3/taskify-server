// models/SupportTicket.model.js
const mongoose = require("mongoose");

const ticketMessageSchema = new mongoose.Schema({
  message: {
    type: String,
    required: true,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  userName: {
    type: String,
    required: true,
  },
  userEmail: {
    type: String,
    required: true,
  },
  attachments: [{
    name: String,
    size: Number,
    url: String,
  }],
  readAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const supportTicketSchema = new mongoose.Schema({
  ticketNumber: {
    type: String,
    unique: true,
    sparse: true, // ✅ Allow null values
  },
  subject: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    enum: ["technical", "billing", "account", "feature", "other"],
    default: "other",
  },
  priority: {
    type: String,
    enum: ["low", "medium", "high", "urgent"],
    default: "medium",
  },
  status: {
    type: String,
    enum: ["open", "in_progress", "waiting", "resolved", "closed"],
    default: "open",
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  messages: [ticketMessageSchema],
  attachments: [{
    name: String,
    size: Number,
    url: String,
  }],
  resolvedAt: Date,
  closedAt: Date,
  rating: {
    type: Number,
    min: 1,
    max: 5,
  },
  feedback: String,
  metadata: {
    userAgent: String,
    ip: String,
  },
}, {
  timestamps: true,
});

// Generate ticket number before validating and saving
supportTicketSchema.pre("validate", async function(next) {
  if (!this.ticketNumber) {
    try {
      const count = await this.constructor.countDocuments();
      this.ticketNumber = `TICKET-${String(count + 1).padStart(5, "0")}`;
      next();
    } catch (error) {
      next(error);
    }
  } else {
    next();
  }
});

// Indexes
supportTicketSchema.index({ ticketNumber: 1 });
supportTicketSchema.index({ createdBy: 1, createdAt: -1 });
supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ priority: 1, createdAt: -1 });

// Static methods
supportTicketSchema.statics.getStats = async function(userId) {
  const match = userId ? { createdBy: userId } : {};
  
  const [
    total,
    open,
    inProgress,
    waiting,
    resolved,
    closed,
    avgResponseTime,
    avgResolutionTime,
    satisfactionRate,
  ] = await Promise.all([
    this.countDocuments(match),
    this.countDocuments({ ...match, status: "open" }),
    this.countDocuments({ ...match, status: "in_progress" }),
    this.countDocuments({ ...match, status: "waiting" }),
    this.countDocuments({ ...match, status: "resolved" }),
    this.countDocuments({ ...match, status: "closed" }),
    this.aggregate([
      { $match: match },
      { $unwind: "$messages" },
      { $group: { _id: null, avg: { $avg: { $subtract: ["$messages.createdAt", "$createdAt"] } } } },
    ]),
    this.aggregate([
      { $match: { ...match, resolvedAt: { $exists: true } } },
      { $group: { _id: null, avg: { $avg: { $subtract: ["$resolvedAt", "$createdAt"] } } } },
    ]),
    this.aggregate([
      { $match: { ...match, rating: { $exists: true } } },
      { $group: { _id: null, avg: { $avg: "$rating" } } },
    ]),
  ]);

  return {
    total: total || 0,
    open: open || 0,
    inProgress: inProgress || 0,
    waiting: waiting || 0,
    resolved: resolved || 0,
    closed: closed || 0,
    averageResponseTime: Math.round((avgResponseTime[0]?.avg || 0) / (1000 * 60 * 60) * 10) / 10,
    averageResolutionTime: Math.round((avgResolutionTime[0]?.avg || 0) / (1000 * 60 * 60) * 10) / 10,
    satisfactionRate: Math.round((satisfactionRate[0]?.avg || 0) * 20) || 0,
  };
};

const SupportTicket = mongoose.model("SupportTicket", supportTicketSchema);

module.exports = { SupportTicket };