const Feedback = require("../models/Feedback.model");
const { User } = require("../models/User.model");
const { NotificationService } = require("../services/notification.service");

// ============================================================
// SUBMIT FEEDBACK
// ============================================================
const submitFeedback = async (req, res) => {
  try {
    const user = req.user;
    const {
      category,
      subject,
      message,
      priority = "medium",
      rating,
      pageUrl,
      tags = [],
    } = req.body;

    // Validation
    if (!category || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "Category, subject, and message are required",
      });
    }

    // Create feedback
    const feedback = await Feedback.create({
      user: user._id,
      category,
      subject: subject.trim(),
      message: message.trim(),
      priority,
      rating: rating || undefined,
      pageUrl: pageUrl || req.headers.referer || "",
      userAgent: req.headers["user-agent"] || "",
      ipAddress: req.ip || req.connection.remoteAddress,
      tags: tags || [],
      status: "pending",
    });

    // Populate user details
    const populatedFeedback = await Feedback.findById(feedback._id)
      .populate("user", "fullName email employeeId role")
      .lean();

    // Send notification to admins
    setImmediate(async () => {
      try {
        const admins = await User.find({
          role: { $in: ["super_admin", "admin", "hr_manager"] },
          isActive: true,
        }).select("_id fullName email");

        const notificationPromises = admins.map((admin) =>
          NotificationService.sendFeedbackNotification(
            feedback._id,
            admin._id,
            user.fullName,
            category,
            subject
          )
        );

        await Promise.all(notificationPromises);
        console.log(`📧 Notified ${admins.length} admins about feedback`);
      } catch (error) {
        console.error("Failed to send admin notifications:", error);
      }
    });

    res.status(201).json({
      success: true,
      message: "Thank you for your feedback! We'll review it shortly.",
      data: populatedFeedback,
    });
  } catch (error) {
    console.error("Submit feedback error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// GET USER'S FEEDBACK
// ============================================================
const getMyFeedback = async (req, res) => {
  try {
    const user = req.user;
    const { status, category, page = 1, limit = 10 } = req.query;

    const query = { user: user._id };
    if (status) query.status = status;
    if (category) query.category = category;

    const [feedback, total] = await Promise.all([
      Feedback.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .populate("assignedTo", "fullName email")
        .populate("adminReply.repliedBy", "fullName email")
        .lean(),
      Feedback.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: feedback,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get my feedback error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// GET ALL FEEDBACK (Admin only)
// ============================================================
const getAllFeedback = async (req, res) => {
  try {
    const {
      status,
      category,
      priority,
      search,
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;

    if (search) {
      query.$text = { $search: search };
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;

    const [feedback, total, stats] = await Promise.all([
      Feedback.find(query)
        .sort(sortOptions)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .populate("user", "fullName email employeeId role")
        .populate("assignedTo", "fullName email")
        .populate("adminReply.repliedBy", "fullName email")
        .lean(),
      Feedback.countDocuments(query),
      Feedback.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
            inProgress: { $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] } },
            resolved: { $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] } },
            closed: { $sum: { $cond: [{ $eq: ["$status", "closed"] }, 1, 0] } },
            duplicate: { $sum: { $cond: [{ $eq: ["$status", "duplicate"] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const statsData = stats[0] || {
      total: 0,
      pending: 0,
      inProgress: 0,
      resolved: 0,
      closed: 0,
      duplicate: 0,
    };

    res.json({
      success: true,
      data: feedback,
      stats: statsData,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get all feedback error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// GET FEEDBACK BY ID
// ============================================================
const getFeedbackById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const feedback = await Feedback.findById(id)
      .populate("user", "fullName email employeeId role")
      .populate("assignedTo", "fullName email")
      .populate("adminReply.repliedBy", "fullName email")
      .lean();

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: "Feedback not found",
      });
    }

    // Check permission
    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(user.role);
    const isOwner = feedback.user._id.toString() === user._id.toString();

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to view this feedback",
      });
    }

    res.json({
      success: true,
      data: feedback,
    });
  } catch (error) {
    console.error("Get feedback error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// UPDATE FEEDBACK STATUS (Admin only)
// ============================================================
const updateFeedbackStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, assignedTo, tags } = req.body;
    const user = req.user;

    const feedback = await Feedback.findById(id);
    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: "Feedback not found",
      });
    }

    const updateData = {};
    if (status) {
      updateData.status = status;
      if (status === "resolved") {
        updateData.resolvedAt = new Date();
      }
    }
    if (assignedTo) updateData.assignedTo = assignedTo;
    if (tags) updateData.tags = tags;

    const updatedFeedback = await Feedback.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    )
      .populate("user", "fullName email")
      .populate("assignedTo", "fullName email")
      .lean();

    // Notify user about status change
    setImmediate(async () => {
      try {
        await NotificationService.sendFeedbackStatusUpdate(
          feedback._id,
          feedback.user,
          status,
          updatedFeedback.status
        );
      } catch (error) {
        console.error("Failed to send status update notification:", error);
      }
    });

    res.json({
      success: true,
      message: "Feedback status updated successfully",
      data: updatedFeedback,
    });
  } catch (error) {
    console.error("Update feedback status error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// REPLY TO FEEDBACK (Admin only)
// ============================================================
const replyToFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { message, isPublic = true } = req.body;
    const user = req.user;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Reply message is required",
      });
    }

    const feedback = await Feedback.findById(id);
    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: "Feedback not found",
      });
    }

    const updatedFeedback = await Feedback.findByIdAndUpdate(
      id,
      {
        $set: {
          "adminReply.message": message.trim(),
          "adminReply.repliedBy": user._id,
          "adminReply.repliedAt": new Date(),
          "adminReply.isPublic": isPublic,
          status: "in_progress",
        },
      },
      { new: true }
    )
      .populate("user", "fullName email")
      .populate("adminReply.repliedBy", "fullName email")
      .lean();

    // Notify user about reply
    setImmediate(async () => {
      try {
        await NotificationService.sendFeedbackReply(
          feedback._id,
          feedback.user,
          user.fullName,
          message
        );
      } catch (error) {
        console.error("Failed to send reply notification:", error);
      }
    });

    res.json({
      success: true,
      message: "Reply sent successfully",
      data: updatedFeedback,
    });
  } catch (error) {
    console.error("Reply to feedback error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// VOTE ON FEEDBACK
// ============================================================
const voteFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const feedback = await Feedback.findById(id);
    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: "Feedback not found",
      });
    }

    // Can't vote on your own feedback
    if (feedback.user.toString() === user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot vote on your own feedback",
      });
    }

    const hasVoted = feedback.voters.includes(user._id);

    if (hasVoted) {
      // Remove vote
      await Feedback.findByIdAndUpdate(id, {
        $pull: { voters: user._id },
        $inc: { votes: -1 },
      });
    } else {
      // Add vote
      await Feedback.findByIdAndUpdate(id, {
        $push: { voters: user._id },
        $inc: { votes: 1 },
      });
    }

    const updatedFeedback = await Feedback.findById(id).lean();

    res.json({
      success: true,
      message: hasVoted ? "Vote removed" : "Vote added",
      data: {
        votes: updatedFeedback.votes,
        hasVoted: !hasVoted,
      },
    });
  } catch (error) {
    console.error("Vote feedback error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// DELETE FEEDBACK
// ============================================================
const deleteFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const feedback = await Feedback.findById(id);
    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: "Feedback not found",
      });
    }

    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(user.role);
    const isOwner = feedback.user.toString() === user._id.toString();

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to delete this feedback",
      });
    }

    await Feedback.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Feedback deleted successfully",
    });
  } catch (error) {
    console.error("Delete feedback error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// GET FEEDBACK STATISTICS
// ============================================================
const getFeedbackStatistics = async (req, res) => {
  try {
    const user = req.user;

    // Only admins can see full statistics
    const isAdmin = ["admin", "super_admin", "hr_manager"].includes(user.role);

    let query = {};
    if (!isAdmin) {
      query.user = user._id;
    }

    const [stats, categoryStats, priorityStats, recentActivity] = await Promise.all([
      Feedback.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
            inProgress: { $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] } },
            resolved: { $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] } },
            closed: { $sum: { $cond: [{ $eq: ["$status", "closed"] }, 1, 0] } },
            duplicate: { $sum: { $cond: [{ $eq: ["$status", "duplicate"] }, 1, 0] } },
            totalVotes: { $sum: "$votes" },
            avgRating: { $avg: "$rating" },
          },
        },
      ]),
      Feedback.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$category",
            count: { $sum: 1 },
          },
        },
      ]),
      Feedback.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$priority",
            count: { $sum: 1 },
          },
        },
      ]),
      Feedback.find(query)
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("user", "fullName email")
        .lean(),
    ]);

    const statsData = stats[0] || {
      total: 0,
      pending: 0,
      inProgress: 0,
      resolved: 0,
      closed: 0,
      duplicate: 0,
      totalVotes: 0,
      avgRating: 0,
    };

    res.json({
      success: true,
      data: {
        stats: statsData,
        byCategory: categoryStats,
        byPriority: priorityStats,
        recentActivity: recentActivity,
      },
    });
  } catch (error) {
    console.error("Get feedback statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// EXPORT CONTROLLERS
// ============================================================
module.exports = {
  submitFeedback,
  getMyFeedback,
  getAllFeedback,
  getFeedbackById,
  updateFeedbackStatus,
  replyToFeedback,
  voteFeedback,
  deleteFeedback,
  getFeedbackStatistics,
};