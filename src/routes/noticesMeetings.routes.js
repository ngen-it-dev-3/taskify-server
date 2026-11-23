const express = require("express");
const router = express.Router();
const {
    getNotices,
    createNotice,
    updateNotice,
    toggleArchiveNotice,
    deleteNotice,
    getMeetings,
    createMeeting,
    updateMeetingStatus,
    deleteMeeting,
} = require("../controllers/noticesMeetings.controller");

const { authenticate, requireMinRole } = require("../middleware/auth.middleware");

// All notices & meetings endpoints require valid JWT authentication
router.use(authenticate);

// Notices
router.get("/notices", getNotices);
router.post("/notices", createNotice);
router.patch("/notices/:id", updateNotice);
router.patch("/notices/:id/archive", toggleArchiveNotice);
router.delete("/notices/:id", deleteNotice);

// Meetings
router.get("/meetings", getMeetings);
router.post("/meetings", createMeeting);
router.patch("/meetings/:id/status", requireMinRole("hr_manager"), updateMeetingStatus);
router.delete("/meetings/:id", deleteMeeting);

module.exports = router;