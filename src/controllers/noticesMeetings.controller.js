const Notice = require("../models/Notice");
const Meeting = require("../models/Meeting");

const MANAGER_ROLES = new Set([
  "super_admin",
  "admin",
  "hr_manager",
  "hr",
  "manager",
  "md",
]);

const hasManagerAccess = (user) => {
  const role = String(user?.role || "")
    .toLowerCase()
    .replace(/\s+/g, "_");
  return MANAGER_ROLES.has(role);
};

// ==========================================
// NOTICES HANDLERS
// ==========================================

exports.getNotices = async (req, res) => {
  try {
    const { filter = "all", search = "" } = req.query;
    const normalizedFilter = String(filter).toLowerCase().trim();

    const query = {};

    if (normalizedFilter === "archive" || normalizedFilter === "archived") {
      query.isArchived = true;
    } else {
      query.isArchived = false;
      if (normalizedFilter === "hr" || normalizedFilter === "hr_notice") {
        query.sourceType = "HR";
      } else if (
        normalizedFilter === "management" ||
        normalizedFilter === "management_notice"
      ) {
        query.sourceType = "Management";
      } else if (
        normalizedFilter === "supervisor" ||
        normalizedFilter === "supervisor_notice"
      ) {
        query.sourceType = "Supervisor";
      }
    }

    if (String(search).trim()) {
      const regex = new RegExp(String(search).trim(), "i");
      query.$or = [
        { title: regex },
        { description: regex },
        { audience: regex },
        { department: regex },
      ];
    }

    const notices = await Notice.find(query)
      .populate("postedBy", "fullName email role")
      .populate("targetUser", "fullName email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: notices,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch notices",
    });
  }
};

exports.createNotice = async (req, res) => {
  try {
    const {
      title,
      description,
      sourceType = "HR",
      badgeType = "Notice",
      audience = "All Staff",
      department = "All",
      targetUser = null,
      postedByLabel,
      expiresAt = null,
    } = req.body;

    if (!String(title || "").trim() || !String(description || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "Title and description are required",
      });
    }

    const notice = await Notice.create({
      title: String(title).trim(),
      description: String(description).trim(),
      sourceType,
      badgeType,
      audience: String(audience || "All Staff").trim(),
      department: String(department || "All").trim(),
      targetUser: targetUser || null,
      postedBy: req.user._id,
      postedByLabel:
        String(postedByLabel || "").trim() ||
        (sourceType === "Supervisor"
          ? `Supervisor — ${req.user.fullName || "Team"}`
          : sourceType),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    return res.status(201).json({
      success: true,
      message: "Notice posted successfully",
      data: notice,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to post notice",
    });
  }
};

exports.updateNotice = async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({
        success: false,
        message: "Notice not found",
      });
    }

    const isOwner = String(notice.postedBy) === String(req.user._id);
    if (!isOwner && !hasManagerAccess(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this notice",
      });
    }

    const updatableFields = [
      "title",
      "description",
      "sourceType",
      "badgeType",
      "audience",
      "department",
      "targetUser",
      "postedByLabel",
      "expiresAt",
    ];

    for (const field of updatableFields) {
      if (req.body[field] !== undefined) {
        notice[field] = req.body[field];
      }
    }

    await notice.save();

    return res.status(200).json({
      success: true,
      message: "Notice updated successfully",
      data: notice,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update notice",
    });
  }
};

exports.toggleArchiveNotice = async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({
        success: false,
        message: "Notice not found",
      });
    }

    const nextArchived =
      typeof req.body?.isArchived === "boolean"
        ? req.body.isArchived
        : !notice.isArchived;

    notice.isArchived = nextArchived;
    notice.archivedAt = nextArchived ? new Date() : null;
    await notice.save();

    return res.status(200).json({
      success: true,
      message: nextArchived ? "Notice moved to archive" : "Notice restored",
      data: notice,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update archive status",
    });
  }
};

exports.deleteNotice = async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({
        success: false,
        message: "Notice not found",
      });
    }

    const isOwner = String(notice.postedBy) === String(req.user._id);
    if (!isOwner && !hasManagerAccess(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this notice",
      });
    }

    await notice.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Notice deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete notice",
    });
  }
};

// ==========================================
// MEETINGS HANDLERS
// ==========================================

exports.getMeetings = async (req, res) => {
  try {
    const { range = "all", search = "" } = req.query;
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0
    );
    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    );
    const next7Days = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

    const query = {};
    const normalizedRange = String(range).toLowerCase().trim();

    if (normalizedRange === "today") {
      query.scheduledDate = { $gte: startOfToday, $lte: endOfToday };
    } else if (normalizedRange === "weekly" || normalizedRange === "week") {
      query.scheduledDate = { $gte: startOfToday, $lte: next7Days };
    } else if (normalizedRange === "monthly" || normalizedRange === "month") {
      query.scheduledDate = { $gte: startOfMonth, $lte: endOfMonth };
    }

    if (String(search).trim()) {
      const regex = new RegExp(String(search).trim(), "i");
      query.$or = [
        { title: regex },
        { withAttendees: regex },
        { requestedByName: regex },
        { venue: regex },
      ];
    }

    const meetings = await Meeting.find(query)
      .populate("requestedBy", "fullName email role")
      .populate("reviewedBy", "fullName email role")
      .sort({ scheduledDate: 1, createdAt: -1 });

    const allForStats = await Meeting.find({});
    const upcomingCount = allForStats.filter(
      (m) =>
        m.scheduledDate &&
        new Date(m.scheduledDate) >= startOfToday &&
        new Date(m.scheduledDate) <= next7Days &&
        m.status !== "Declined"
    ).length;

    const pendingRequestsCount = allForStats.filter(
      (m) => m.status === "Pending Approval"
    ).length;

    const todayCount = allForStats.filter(
      (m) =>
        m.scheduledDate &&
        new Date(m.scheduledDate) >= startOfToday &&
        new Date(m.scheduledDate) <= endOfToday &&
        m.status !== "Declined"
    ).length;

    const activeVideoLinksCount = allForStats.filter(
      (m) =>
        m.type === "Video Call" &&
        Boolean(m.meetingLink) &&
        m.status === "Confirmed"
    ).length;

    return res.status(200).json({
      success: true,
      stats: {
        upcoming7Days: upcomingCount,
        pendingRequests: pendingRequestsCount,
        today: todayCount,
        activeVideoLinks: activeVideoLinksCount,
      },
      data: meetings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch meetings",
    });
  }
};

exports.createMeeting = async (req, res) => {
  try {
    const {
      title,
      withAttendees,
      type = "Video Call",
      venue = "",
      meetingLink = "",
      notes = "",
      scheduledDate = null,
      timeSlotLabel = "",
      preferredDateText = "",
      directSchedule = false,
    } = req.body;

    if (!String(title || "").trim() || !String(withAttendees || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "Meeting title/purpose and attendees are required",
      });
    }

    const canDirectlyConfirm = Boolean(directSchedule && hasManagerAccess(req.user));
    const parsedDate = scheduledDate ? new Date(scheduledDate) : null;
    const validDate =
      parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;

    const meeting = await Meeting.create({
      title: String(title).trim(),
      withAttendees: String(withAttendees).trim(),
      type,
      venue: type === "In-Person" ? String(venue || "").trim() : String(venue || "").trim(),
      meetingLink:
        type === "Video Call"
          ? String(meetingLink || "").trim() ||
            (canDirectlyConfirm
              ? `https://meet.jit.si/orvix-${Date.now()}`
              : "")
          : "",
      notes: String(notes || "").trim(),
      scheduledDate: validDate,
      timeSlotLabel: String(timeSlotLabel || "").trim(),
      preferredDateText: String(preferredDateText || "").trim(),
      status: canDirectlyConfirm ? "Confirmed" : "Pending Approval",
      requestedBy: req.user._id,
      requestedByName: req.user.fullName || req.user.email || "Employee",
      reviewedBy: canDirectlyConfirm ? req.user._id : null,
      reviewedAt: canDirectlyConfirm ? new Date() : null,
    });

    return res.status(201).json({
      success: true,
      message: canDirectlyConfirm
        ? "Meeting scheduled and confirmed"
        : "Meeting request submitted for HR/Admin review",
      data: meeting,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create meeting",
    });
  }
};

exports.updateMeetingStatus = async (req, res) => {
  try {
    const { status, scheduledDate, timeSlotLabel, meetingLink, venue } = req.body;

    if (!hasManagerAccess(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Only HR, Admin, or Management can approve or decline meetings",
      });
    }

    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    if (status && ["Pending Approval", "Confirmed", "Declined", "Completed"].includes(status)) {
      meeting.status = status;
    }

    if (scheduledDate) {
      const parsed = new Date(scheduledDate);
      if (!Number.isNaN(parsed.getTime())) {
        meeting.scheduledDate = parsed;
      }
    }

    if (typeof timeSlotLabel === "string") {
      meeting.timeSlotLabel = timeSlotLabel.trim();
    }

    if (typeof venue === "string") {
      meeting.venue = venue.trim();
    }

    if (typeof meetingLink === "string" && meetingLink.trim()) {
      meeting.meetingLink = meetingLink.trim();
    } else if (
      meeting.status === "Confirmed" &&
      meeting.type === "Video Call" &&
      !meeting.meetingLink
    ) {
      meeting.meetingLink = `https://meet.jit.si/orvix-${meeting._id}`;
    }

    meeting.reviewedBy = req.user._id;
    meeting.reviewedAt = new Date();
    await meeting.save();

    return res.status(200).json({
      success: true,
      message: `Meeting marked as ${meeting.status}`,
      data: meeting,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update meeting status",
    });
  }
};

exports.deleteMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    const isOwner = String(meeting.requestedBy) === String(req.user._id);
    if (!isOwner && !hasManagerAccess(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this meeting",
      });
    }

    await meeting.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Meeting deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete meeting",
    });
  }
};