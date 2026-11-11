const { Task } = require("../models/Task.model");
const { User } = require("../models/User.model");
const { Review } = require("../models/Review.model");
const { Comment } = require("../models/Comment.model");
const mongoose = require("mongoose");

// Get performance metrics for logged-in user
const getPerformanceMetrics = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get user's tasks
    const tasks = await Task.find({ assignedTo: userId });
    const completedTasks = tasks.filter((t) => t.status === "completed");
    const onTimeTasks = tasks.filter(
      (t) =>
        t.status === "completed" &&
        new Date(t.deadline) >= new Date(t.updatedAt),
    );

    // Calculate metrics
    const productivity =
      tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0;

    // Get quality score from reviews
    const reviews = await Review.find({ reviewer: userId });
    const avgQuality =
      reviews.length > 0
        ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 20
        : 75;

    // Calculate efficiency (tasks per hour)
    const totalEstimatedHours = tasks.reduce(
      (sum, t) => sum + t.estimatedHours,
      0,
    );
    const efficiency =
      totalEstimatedHours > 0
        ? (completedTasks.length / totalEstimatedHours) * 100
        : 0;

    // On-time delivery rate
    const onTimeRate =
      completedTasks.length > 0
        ? (onTimeTasks.length / completedTasks.length) * 100
        : 0;

    const metrics = [
      {
        _id: "1",
        metric: "Productivity",
        value: Math.round(productivity),
        target: 80,
        progress: Math.round((productivity / 80) * 100),
        unit: "%",
        trend: productivity > 75 ? "up" : productivity > 65 ? "stable" : "down",
        percentageChange: Math.round(((productivity - 75) / 75) * 100),
      },
      {
        _id: "2",
        metric: "Quality",
        value: Math.round(avgQuality),
        target: 90,
        progress: Math.round((avgQuality / 90) * 100),
        unit: "%",
        trend: avgQuality > 85 ? "up" : avgQuality > 75 ? "stable" : "down",
        percentageChange: Math.round(((avgQuality - 85) / 85) * 100),
      },
      {
        _id: "3",
        metric: "Efficiency",
        value: Math.round(efficiency),
        target: 85,
        progress: Math.round((efficiency / 85) * 100),
        unit: "%",
        trend: efficiency > 70 ? "up" : efficiency > 50 ? "stable" : "down",
        percentageChange: Math.round(((efficiency - 70) / 70) * 100),
      },
      {
        _id: "4",
        metric: "On-Time Delivery",
        value: Math.round(onTimeRate),
        target: 85,
        progress: Math.round((onTimeRate / 85) * 100),
        unit: "%",
        trend: onTimeRate > 80 ? "up" : onTimeRate > 70 ? "stable" : "down",
        percentageChange: Math.round(((onTimeRate - 80) / 80) * 100),
      },
    ];

    res.json({ success: true, data: metrics });
  } catch (error) {
    console.error("Get performance metrics error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get task statistics
const getTaskStats = async (req, res) => {
  try {
    const userId = req.user._id;

    const tasks = await Task.find({ assignedTo: userId });

    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === "completed").length;
    const pending = tasks.filter((t) => t.status === "pending").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const submitted = tasks.filter((t) => t.status === "submitted").length;
    const overdue = tasks.filter((t) => t.status === "overdue").length;
    const rejected = tasks.filter((t) => t.status === "rejected").length;

    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    const onTimeTasks = tasks.filter(
      (t) =>
        t.status === "completed" &&
        new Date(t.deadline) >= new Date(t.updatedAt),
    ).length;
    const onTimeRate = completed > 0 ? (onTimeTasks / completed) * 100 : 0;

    // Calculate average completion time
    const completedTasks = tasks.filter((t) => t.status === "completed");
    let averageCompletionTime = 0;
    if (completedTasks.length > 0) {
      const totalTime = completedTasks.reduce((sum, t) => {
        const created = new Date(t.createdAt);
        const completed = new Date(t.updatedAt);
        const diffHours = (completed - created) / (1000 * 60 * 60);
        return sum + diffHours;
      }, 0);
      averageCompletionTime = totalTime / completedTasks.length;
    }

    // Calculate tasks by priority
    const tasksByPriority = {
      low: tasks.filter((t) => t.priority === "low").length,
      normal: tasks.filter((t) => t.priority === "normal").length,
      high: tasks.filter((t) => t.priority === "high").length,
      urgent: tasks.filter((t) => t.priority === "urgent").length,
    };

    const stats = {
      total,
      completed,
      pending,
      inProgress,
      submitted,
      overdue,
      rejected,
      completionRate: Math.round(completionRate * 10) / 10,
      onTimeRate: Math.round(onTimeRate * 10) / 10,
      averageCompletionTime: Math.round(averageCompletionTime * 10) / 10,
      tasksByPriority,
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Get task stats error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get productivity data
const getProductivityData = async (req, res) => {
  try {
    const userId = req.user._id;
    const { period = "month" } = req.query;

    let startDate = new Date();
    let days = 7;

    if (period === "week") {
      startDate.setDate(startDate.getDate() - 7);
      days = 7;
    } else if (period === "month") {
      startDate.setDate(startDate.getDate() - 30);
      days = 30;
    } else if (period === "year") {
      startDate.setDate(startDate.getDate() - 365);
      days = 365;
    }

    const tasks = await Task.find({
      assignedTo: userId,
      updatedAt: { $gte: startDate },
    });

    // Group by date
    const dateMap = new Map();
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split("T")[0];
      const dayName = dayNames[date.getDay()];
      dateMap.set(dateKey, {
        date: dayName,
        completed: 0,
        submitted: 0,
        hours: 0,
        tasksCreated: 0,
      });
    }

    for (const task of tasks) {
      const dateKey = task.updatedAt.toISOString().split("T")[0];
      if (dateMap.has(dateKey)) {
        const data = dateMap.get(dateKey);
        if (task.status === "completed") data.completed++;
        if (task.status === "submitted") data.submitted++;
        data.hours += task.estimatedHours || 0;
        dateMap.set(dateKey, data);
      }
    }

    // Count tasks created per day
    const createdTasks = await Task.find({
      assignedTo: userId,
      createdAt: { $gte: startDate },
    });

    for (const task of createdTasks) {
      const dateKey = task.createdAt.toISOString().split("T")[0];
      if (dateMap.has(dateKey)) {
        const data = dateMap.get(dateKey);
        data.tasksCreated++;
        dateMap.set(dateKey, data);
      }
    }

    const productivityData = Array.from(dateMap.values()).reverse();

    res.json({ success: true, data: productivityData });
  } catch (error) {
    console.error("Get productivity data error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get category performance
const getCategoryStats = async (req, res) => {
  try {
    const userId = req.user._id;

    const tasks = await Task.find({ assignedTo: userId }).populate(
      "projectId",
      "name code",
    );

    const categoryMap = new Map();

    for (const task of tasks) {
      const categoryName = task.projectId?.name || "Uncategorized";
      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, { completed: 0, total: 0 });
      }
      const cat = categoryMap.get(categoryName);
      cat.total++;
      if (task.status === "completed") cat.completed++;
      categoryMap.set(categoryName, cat);
    }

    const colors = [
      "#6366f1",
      "#10b981",
      "#f59e0b",
      "#ef4444",
      "#8b5cf6",
      "#06b6d4",
      "#ec4899",
    ];
    const categories = Array.from(categoryMap.entries()).map(
      ([name, data], index) => ({
        name,
        completed: data.completed,
        total: data.total,
        percentage: data.total > 0 ? (data.completed / data.total) * 100 : 0,
        color: colors[index % colors.length],
        trend:
          data.total > 5 && data.completed / data.total > 0.7 ? "up" : "stable",
      }),
    );

    res.json({ success: true, data: categories });
  } catch (error) {
    console.error("Get category stats error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get monthly statistics
const getMonthlyStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const { period = "month" } = req.query;

    let monthsToShow = 6;
    if (period === "year") {
      monthsToShow = 12;
    }

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsToShow);

    const tasks = await Task.find({
      assignedTo: userId,
      createdAt: { $gte: startDate },
    });

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const monthMap = new Map();

    for (let i = 0; i < monthsToShow; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      monthMap.set(monthKey, {
        month: `${monthNames[date.getMonth()]} ${date.getFullYear()}`,
        tasks: 0,
        completed: 0,
        totalHours: 0,
        tasksCreated: 0,
        tasksCompleted: 0,
      });
    }

    for (const task of tasks) {
      const monthKey = `${task.createdAt.getFullYear()}-${task.createdAt.getMonth()}`;
      if (monthMap.has(monthKey)) {
        const data = monthMap.get(monthKey);
        data.tasks++;
        if (task.status === "completed") {
          data.completed++;
          data.tasksCompleted++;
        }
        data.totalHours += task.estimatedHours || 0;
        data.tasksCreated++;
        monthMap.set(monthKey, data);
      }
    }

    const monthlyStats = Array.from(monthMap.values())
      .reverse()
      .map((data) => ({
        month: data.month,
        tasks: data.tasks,
        completionRate:
          data.tasks > 0 ? (data.completed / data.tasks) * 100 : 0,
        avgHours: data.tasks > 0 ? data.totalHours / data.tasks : 0,
        tasksCompleted: data.tasksCompleted,
        tasksCreated: data.tasksCreated,
      }));

    res.json({ success: true, data: monthlyStats });
  } catch (error) {
    console.error("Get monthly stats error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get yearly statistics (NEW)
const getYearlyStats = async (req, res) => {
  try {
    const userId = req.user._id;

    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 5); // Last 5 years

    const tasks = await Task.find({
      assignedTo: userId,
      createdAt: { $gte: startDate },
    });

    // Group by year
    const yearMap = new Map();

    for (const task of tasks) {
      const year = task.createdAt.getFullYear().toString();
      if (!yearMap.has(year)) {
        yearMap.set(year, {
          year: year,
          totalTasks: 0,
          completedTasks: 0,
          totalHours: 0,
          months: new Map(),
        });
      }

      const yearData = yearMap.get(year);
      yearData.totalTasks++;

      if (task.status === "completed") {
        yearData.completedTasks++;
      }

      yearData.totalHours += task.estimatedHours || 0;

      // Also track monthly data within the year
      const monthKey = `${task.createdAt.getMonth()}`;
      if (!yearData.months.has(monthKey)) {
        yearData.months.set(monthKey, {
          month: task.createdAt.toLocaleString("default", { month: "short" }),
          tasks: 0,
          completed: 0,
          hours: 0,
        });
      }
      const monthData = yearData.months.get(monthKey);
      monthData.tasks++;
      if (task.status === "completed") {
        monthData.completed++;
      }
      monthData.hours += task.estimatedHours || 0;
    }

    const yearlyStats = Array.from(yearMap.values()).map((yearData) => ({
      year: yearData.year,
      totalTasks: yearData.totalTasks,
      completionRate:
        yearData.totalTasks > 0
          ? (yearData.completedTasks / yearData.totalTasks) * 100
          : 0,
      totalHours: Math.round(yearData.totalHours),
      months: Array.from(yearData.months.values()),
    }));

    res.json({ success: true, data: yearlyStats });
  } catch (error) {
    console.error("Get yearly stats error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get achievements
const getAchievements = async (req, res) => {
  try {
    const userId = req.user._id;

    const tasks = await Task.find({ assignedTo: userId });
    const completedTasks = tasks.filter((t) => t.status === "completed");
    const onTimeTasks = tasks.filter(
      (t) =>
        t.status === "completed" &&
        new Date(t.deadline) >= new Date(t.updatedAt),
    );
    const reviews = await Review.find({ reviewer: userId });
    const comments = await Comment.find({ author: userId });

    const achievements = [];

    // Task Master Achievement
    if (completedTasks.length >= 50) {
      achievements.push({
        _id: "1",
        title: "Task Master",
        description: `Completed ${completedTasks.length} tasks`,
        icon: "🏆",
        earnedAt: new Date().toISOString(),
        points: 100,
        category: "productivity",
      });
    } else if (completedTasks.length >= 25) {
      achievements.push({
        _id: "1",
        title: "Task Master",
        description: `Completed ${completedTasks.length}/50 tasks`,
        icon: "🏆",
        earnedAt: new Date().toISOString(),
        points: 50,
        progress: (completedTasks.length / 50) * 100,
        category: "productivity",
      });
    }

    // Early Bird Achievement
    if (onTimeTasks.length >= 10) {
      achievements.push({
        _id: "2",
        title: "Early Bird",
        description: `Submitted ${onTimeTasks.length} tasks before deadline`,
        icon: "🐦",
        earnedAt: new Date().toISOString(),
        points: 75,
        category: "consistency",
      });
    }

    // Quality Champion
    let totalRating = 0;
    for (let i = 0; i < reviews.length; i++) {
      totalRating += reviews[i].rating;
    }
    const avgRating = reviews.length > 0 ? totalRating / reviews.length : 0;

    if (avgRating >= 4.5) {
      achievements.push({
        _id: "3",
        title: "Quality Champion",
        description: "Maintained 4.5+ star rating",
        icon: "⭐",
        earnedAt: new Date().toISOString(),
        points: 100,
        category: "quality",
      });
    }

    // Team Player
    if (comments.length >= 20) {
      achievements.push({
        _id: "4",
        title: "Team Player",
        description: `Added ${comments.length} comments`,
        icon: "💬",
        earnedAt: new Date().toISOString(),
        points: 50,
        category: "growth",
      });
    }

    // Consistent Performer
    if (tasks.length >= 30) {
      achievements.push({
        _id: "5",
        title: "Consistent Performer",
        description: `Completed ${tasks.length} tasks total`,
        icon: "🔥",
        earnedAt: new Date().toISOString(),
        points: 80,
        category: "consistency",
      });
    }

    // Add more achievements if needed
    if (achievements.length === 0) {
      // If no achievements, add a default one
      achievements.push({
        _id: "0",
        title: "Getting Started",
        description: "Complete your first task to earn achievements",
        icon: "🚀",
        earnedAt: new Date().toISOString(),
        points: 0,
        progress: 0,
        category: "growth",
      });
    }

    res.json({ success: true, data: achievements });
  } catch (error) {
    console.error("Get achievements error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get ratings
const getRatings = async (req, res) => {
  try {
    const userId = req.user._id;

    const reviews = await Review.find({ reviewer: userId }).populate(
      "reviewer",
      "fullName",
    );
    const total = reviews.length;

    const distribution = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    let sum = 0;
    const recentFeedback = [];

    for (let i = 0; i < reviews.length; i++) {
      const review = reviews[i];
      sum += review.rating;

      if (review.rating === 1) distribution[1]++;
      else if (review.rating === 2) distribution[2]++;
      else if (review.rating === 3) distribution[3]++;
      else if (review.rating === 4) distribution[4]++;
      else if (review.rating === 5) distribution[5]++;

      // Get recent feedback (last 5)
      if (i < 5) {
        recentFeedback.push({
          _id: review._id,
          rating: review.rating,
          comment: review.comment || "No comment provided",
          reviewer: review.reviewer?.fullName || "Anonymous",
          createdAt: review.createdAt,
        });
      }
    }

    const average = total > 0 ? sum / total : 0;

    res.json({
      success: true,
      data: {
        average: Math.round(average * 10) / 10,
        total: total,
        distribution: distribution,
        recentFeedback: recentFeedback,
      },
    });
  } catch (error) {
    console.error("Get ratings error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getPerformanceMetrics,
  getTaskStats,
  getProductivityData,
  getCategoryStats,
  getMonthlyStats,
  getYearlyStats, // Add the new function
  getAchievements,
  getRatings,
};
