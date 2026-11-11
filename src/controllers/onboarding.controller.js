const { User } = require("../models/User.model");
const { Department } = require("../models/Department.model");

/**
 * Get onboarding status for current user
 */
exports.getOnboardingStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "onboardingCompleted onboardingStep",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: {
        onboardingCompleted: user.onboardingCompleted || false,
        onboardingStep: user.onboardingStep || 1,
      },
    });
  } catch (error) {
    console.error("Error getting onboarding status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get onboarding status",
    });
  }
};

/**
 * Complete onboarding process
 */
exports.completeOnboarding = async (req, res) => {
  try {
    const {
      fullName,
      phoneNumber,
      location,
      departmentId,
      position,
      employeeId,
      bio,
      dailyHoursTarget,
      workSettings,
      notificationPreferences,
      profilePhoto,
      onboardingCompleted,
      firstLogin,
    } = req.body;

    console.log("📝 Onboarding Data Received:", {
      fullName,
      phoneNumber,
      location,
      departmentId,
      position,
      employeeId,
      bio: bio ? bio.substring(0, 50) + "..." : null,
      hasPhoto: !!profilePhoto,
      photoLength: profilePhoto?.length || 0,
    });

    // Find user
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log("👤 User before update:", {
      id: user._id,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      location: user.location,
      bio: user.bio,
      position: user.position,
      employeeId: user.employeeId,
      departmentId: user.departmentId,
      hasPhoto: !!user.profilePhoto,
    });

    // ✅ UPDATE ALL FIELDS - Map correctly to schema
    user.fullName = fullName || user.fullName;
    user.phoneNumber = phoneNumber || user.phoneNumber || "";
    user.location = location || user.location || "";
    user.position = position || user.position || "";
    user.employeeId = employeeId || user.employeeId || "";
    user.bio = bio || user.bio || "";

    // Handle department - ensure it's a valid ObjectId or null
    if (departmentId) {
      user.departmentId = departmentId;
    }

    // Update daily hours target
    if (dailyHoursTarget) {
      user.dailyHoursTarget = dailyHoursTarget;
    }

    // ✅ Update workSettings
    if (workSettings) {
      user.workSettings = {
        dailyHoursTarget:
          workSettings.dailyHoursTarget ||
          user.workSettings?.dailyHoursTarget ||
          8,
        weeklyHoursTarget:
          workSettings.weeklyHoursTarget ||
          user.workSettings?.weeklyHoursTarget ||
          40,
        startTime:
          workSettings.startTime || user.workSettings?.startTime || "09:00",
        endTime: workSettings.endTime || user.workSettings?.endTime || "18:00",
        breakDuration:
          workSettings.breakDuration || user.workSettings?.breakDuration || 60,
        workDays: workSettings.workDays ||
          user.workSettings?.workDays || [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
          ],
        timezone:
          workSettings.timezone || user.workSettings?.timezone || "UTC+06:00",
        overtimeThreshold:
          workSettings.overtimeThreshold ||
          user.workSettings?.overtimeThreshold ||
          2,
      };
    }

    // ✅ Update notificationPreferences
    if (notificationPreferences) {
      user.notificationPreferences = {
        email:
          notificationPreferences.email !== undefined
            ? notificationPreferences.email
            : true,
        push:
          notificationPreferences.push !== undefined
            ? notificationPreferences.push
            : true,
        desktop:
          notificationPreferences.desktop !== undefined
            ? notificationPreferences.desktop
            : false,
        taskReminder:
          notificationPreferences.taskReminder !== undefined
            ? notificationPreferences.taskReminder
            : true,
        taskReminderTime: notificationPreferences.taskReminderTime || "09:00",
        deadlineAlert:
          notificationPreferences.deadlineAlert !== undefined
            ? notificationPreferences.deadlineAlert
            : true,
        leaveApprovals:
          notificationPreferences.leaveApprovals !== undefined
            ? notificationPreferences.leaveApprovals
            : true,
        teamUpdate:
          notificationPreferences.teamUpdate !== undefined
            ? notificationPreferences.teamUpdate
            : true,
        dailyDigest:
          notificationPreferences.dailyDigest !== undefined
            ? notificationPreferences.dailyDigest
            : true,
        weeklyReport:
          notificationPreferences.weeklyReport !== undefined
            ? notificationPreferences.weeklyReport
            : true,
        mentionNotifications:
          notificationPreferences.mentionNotifications !== undefined
            ? notificationPreferences.mentionNotifications
            : true,
        commentNotifications:
          notificationPreferences.commentNotifications !== undefined
            ? notificationPreferences.commentNotifications
            : true,
      };
    }

    // ✅ Update profile photo if provided
    if (profilePhoto && profilePhoto.length > 100) {
      let photoData = profilePhoto;
      if (!photoData.startsWith("data:image")) {
        photoData = `data:image/jpeg;base64,${photoData}`;
      }
      user.profilePhoto = photoData;
      console.log("✅ Profile photo saved, length:", photoData.length);
    }

    // ✅ Mark onboarding as completed
    user.onboardingCompleted =
      onboardingCompleted !== undefined ? onboardingCompleted : true;
    user.firstLogin = firstLogin !== undefined ? firstLogin : false;
    user.onboardingStep = 3;

    // ✅ Save the user - IMPORTANT: use markModified for nested objects
    if (workSettings) {
      user.markModified("workSettings");
    }
    if (notificationPreferences) {
      user.markModified("notificationPreferences");
    }

    await user.save();

    console.log("✅ User after update:", {
      id: user._id,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      location: user.location,
      bio: user.bio,
      position: user.position,
      employeeId: user.employeeId,
      departmentId: user.departmentId,
      hasPhoto: !!user.profilePhoto,
      onboardingCompleted: user.onboardingCompleted,
    });

    // ✅ Return updated user
    const updatedUser = await User.findById(user._id)
      .select("-password -resetPasswordToken -resetPasswordExpires")
      .populate("departmentId", "name code");

    res.json({
      success: true,
      message: "Onboarding completed successfully",
      data: {
        onboardingCompleted: user.onboardingCompleted,
        user: updatedUser,
      },
    });
  } catch (error) {
    console.error("❌ Error completing onboarding:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to complete onboarding",
    });
  }
};

/**
 * Skip onboarding (for testing purposes)
 */
exports.skipOnboarding = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.onboardingCompleted = true;
    user.firstLogin = false;
    user.onboardingStep = 3;
    await user.save();

    res.json({
      success: true,
      message: "Onboarding skipped successfully",
    });
  } catch (error) {
    console.error("Error skipping onboarding:", error);
    res.status(500).json({
      success: false,
      message: "Failed to skip onboarding",
    });
  }
};
