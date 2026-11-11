// src/controllers/workload.controller.js

const { User } = require("../models/User.model");
const { Task } = require("../models/Task.model");

// Get workload capacity for all users
const getWorkloadCapacity = async (req, res) => {
  try {
    // Get all active users with their department populated
    const users = await User.find({ isActive: true })
      .populate('department', 'name code')
      .populate('roles', 'name code level')
      .select('-password');

    // Get ALL tasks grouped by assignedTo (including completed)
    const allTaskCounts = await Task.aggregate([
      {
        $match: {
          assignedTo: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$assignedTo',
          totalTasks: { $sum: 1 },
          completedTasks: {
            $sum: {
              $cond: [
                { $in: ['$status', ['completed', 'done', 'closed']] },
                1,
                0
              ]
            }
          },
          activeTasks: {
            $sum: {
              $cond: [
                { $in: ['$status', ['pending', 'in_progress', 'assigned', 'todo']] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    // Get active tasks for workload calculation
    const activeTaskCounts = await Task.aggregate([
      {
        $match: {
          status: { $in: ['pending', 'in_progress', 'assigned', 'todo'] },
          assignedTo: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$assignedTo',
          taskCount: { $sum: 1 }
        }
      }
    ]);

    // Create maps
    const taskCountMap = {};
    const completedTaskMap = {};
    const allTaskMap = {};

    allTaskCounts.forEach(item => {
      allTaskMap[item._id?.toString()] = item.totalTasks || 0;
      completedTaskMap[item._id?.toString()] = item.completedTasks || 0;
    });

    activeTaskCounts.forEach(item => {
      taskCountMap[item._id?.toString()] = item.taskCount;
    });

    // Calculate workload for each user
    const workloadData = users.map(user => {
      const userId = user._id?.toString();
      const activeTaskCount = taskCountMap[userId] || 0;
      const totalTaskCount = allTaskMap[userId] || 0;
      const completedTaskCount = completedTaskMap[userId] || 0;

      // Get role level based on primary role
      const roleLevelMap = {
        super_admin: 100,
        admin: 90,
        hr_manager: 80,
        dept_manager: 70,
        project_manager: 65,
        line_manager: 60,
        employee: 50,
      };

      let roleLevel = 50;
      if (user.roles && user.roles.length > 0) {
        const maxLevel = Math.max(...user.roles.map(r => roleLevelMap[r.code?.toLowerCase()] || 0));
        roleLevel = maxLevel || 50;
      } else if (user.role) {
        roleLevel = roleLevelMap[user.role] || 50;
      }

      // Calculate workload based on active tasks
      const estimatedHoursPerTask = 8;
      const activeHours = activeTaskCount * estimatedHoursPerTask;
      const monthlyCapacity = roleLevel * 0.8;
      const capacityPercentage = monthlyCapacity > 0
        ? Math.min(Math.round((activeHours / monthlyCapacity) * 100), 150)
        : 0;

      // Determine status color
      const statusColor = capacityPercentage > 90 ? 'red'
        : capacityPercentage > 70 ? 'amber'
          : 'green';

      // Get task breakdown
      const pendingTasks = totalTaskCount - activeTaskCount - completedTaskCount;

      return {
        user: {
          _id: user._id,
          fullName: user.fullName || 'No Name',
          email: user.email || 'No Email',
          role: user.role || 'employee',
          department: user.department || null,
          employeeId: user.employeeId || user.employeeID || '',
        },
        workload: {
          capacityPercentage,
          statusColor,
          activeHours,
          taskCount: totalTaskCount, // Now shows ALL tasks
          completedTaskCount: completedTaskCount,
          activeTaskCount: activeTaskCount,
          monthlyCapacity: Math.round(monthlyCapacity),
        },
        breakdown: {
          taskBreakdown: {
            pending: pendingTasks,
            inProgress: activeTaskCount,
            submitted: completedTaskCount,
          },
          priorityDistribution: {
            low: 0,
            normal: 0,
            high: 0,
            urgent: 0,
          },
          upcomingDeadlines: [],
        },
        projects: 0,
      };
    });

    // Calculate aggregates
    const totalMembers = workloadData.length;
    const totalActiveHours = workloadData.reduce((sum, m) => sum + m.workload.activeHours, 0);
    const totalTasks = workloadData.reduce((sum, m) => sum + m.workload.taskCount, 0);
    const avgUtilization = totalMembers > 0
      ? Math.round(workloadData.reduce((sum, m) => sum + m.workload.capacityPercentage, 0) / totalMembers)
      : 0;

    const utilizationDistribution = {
      green: workloadData.filter(m => m.workload.capacityPercentage <= 70).length,
      amber: workloadData.filter(m => m.workload.capacityPercentage > 70 && m.workload.capacityPercentage <= 90).length,
      red: workloadData.filter(m => m.workload.capacityPercentage > 90).length,
    };

    // Sort by capacity percentage (highest first)
    workloadData.sort((a, b) => b.workload.capacityPercentage - a.workload.capacityPercentage);

    res.json({
      success: true,
      data: workloadData,
      aggregates: {
        totalMembers,
        totalActiveHours,
        totalTasks,
        averageUtilization: avgUtilization,
        utilizationDistribution,
      },
      count: workloadData.length,
    });
  } catch (error) {
    console.error('Get workload capacity error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
};

// Get workload for a specific user
const getUserWorkload = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .populate('department', 'name code')
      .populate('roles', 'name code level')
      .select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Get ALL tasks for this user
    const allTasks = await Task.find({ assignedTo: userId });
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(t =>
      ['completed', 'done', 'closed'].includes(t.status)
    ).length;
    const activeTasks = allTasks.filter(t =>
      ['pending', 'in_progress', 'assigned', 'todo'].includes(t.status)
    ).length;

    // Calculate workload based on role
    const roleLevelMap = {
      super_admin: 100,
      admin: 90,
      hr_manager: 80,
      dept_manager: 70,
      project_manager: 65,
      line_manager: 60,
      employee: 50,
    };

    let roleLevel = 50;
    if (user.roles && user.roles.length > 0) {
      const maxLevel = Math.max(...user.roles.map(r => roleLevelMap[r.code?.toLowerCase()] || 0));
      roleLevel = maxLevel || 50;
    } else if (user.role) {
      roleLevel = roleLevelMap[user.role] || 50;
    }

    const estimatedHoursPerTask = 8;
    const activeHours = activeTasks * estimatedHoursPerTask;
    const monthlyCapacity = roleLevel * 0.8;
    const capacityPercentage = monthlyCapacity > 0
      ? Math.min(Math.round((activeHours / monthlyCapacity) * 100), 150)
      : 0;

    const statusColor = capacityPercentage > 90 ? 'red'
      : capacityPercentage > 70 ? 'amber'
        : 'green';

    // Get task breakdown by priority
    const priorityDistribution = {
      low: allTasks.filter(t => t.priority === 'low' || t.priority === 'Low').length,
      normal: allTasks.filter(t => t.priority === 'normal' || t.priority === 'Normal' || t.priority === 'medium' || t.priority === 'Medium').length,
      high: allTasks.filter(t => t.priority === 'high' || t.priority === 'High').length,
      urgent: allTasks.filter(t => t.priority === 'urgent' || t.priority === 'Urgent').length,
    };

    // Get upcoming deadlines (tasks due in next 7 days)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const upcomingDeadlines = allTasks
      .filter(t => t.deadline && new Date(t.deadline) <= sevenDaysFromNow && new Date(t.deadline) >= new Date())
      .map(t => ({
        _id: t._id,
        title: t.title,
        deadline: t.deadline,
        estimatedHours: t.estimatedHours || 0,
        priority: t.priority || 'normal',
        project: t.projectId?.toString() || '',
      }))
      .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
      .slice(0, 5);

    res.json({
      success: true,
      data: {
        user: {
          _id: user._id,
          fullName: user.fullName,
          email: user.email,
          department: user.department,
          employeeId: user.employeeId || user.employeeID || '',
          role: user.role,
        },
        workload: {
          capacityPercentage,
          statusColor,
          activeHours,
          taskCount: totalTasks,
          completedTaskCount: completedTasks,
          activeTaskCount: activeTasks,
          monthlyCapacity: Math.round(monthlyCapacity),
          roleLevel,
        },
        breakdown: {
          taskBreakdown: {
            pending: totalTasks - activeTasks - completedTasks,
            inProgress: activeTasks,
            submitted: completedTasks,
          },
          priorityDistribution,
          upcomingDeadlines,
        },
        projects: 0,
      }
    });
  } catch (error) {
    console.error('Get user workload error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
};

// Get workload summary for dashboard
const getWorkloadSummary = async (req, res) => {
  try {
    const users = await User.find({ isActive: true })
      .populate('department', 'name code')
      .select('_id fullName email role department');

    // Get ALL task counts
    const allTaskCounts = await Task.aggregate([
      {
        $match: {
          assignedTo: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$assignedTo',
          total: { $sum: 1 },
          completed: {
            $sum: {
              $cond: [
                { $in: ['$status', ['completed', 'done', 'closed']] },
                1,
                0
              ]
            }
          },
          active: {
            $sum: {
              $cond: [
                { $in: ['$status', ['pending', 'in_progress', 'assigned', 'todo']] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const taskMap = {};
    allTaskCounts.forEach(item => {
      taskMap[item._id.toString()] = {
        total: item.total,
        completed: item.completed,
        active: item.active,
      };
    });

    let totalActiveHours = 0;
    let totalCapacity = 0;
    let overloadedCount = 0;
    let nearCapacityCount = 0;
    let totalTasks = 0;
    let totalCompletedTasks = 0;

    const userWorkloads = users.map(user => {
      const userTasks = taskMap[user._id.toString()] || { total: 0, completed: 0, active: 0 };
      const taskCount = userTasks.total;
      const completedCount = userTasks.completed;
      const activeCount = userTasks.active;

      totalTasks += taskCount;
      totalCompletedTasks += completedCount;

      const roleLevelMap = {
        super_admin: 100,
        admin: 90,
        hr_manager: 80,
        dept_manager: 70,
        project_manager: 65,
        line_manager: 60,
        employee: 50,
      };

      const roleLevel = roleLevelMap[user.role] || 50;
      const activeHours = activeCount * 8;
      const monthlyCapacity = roleLevel * 0.8;
      const capacityPercentage = monthlyCapacity > 0
        ? Math.min(Math.round((activeHours / monthlyCapacity) * 100), 150)
        : 0;

      totalActiveHours += activeHours;
      totalCapacity += monthlyCapacity;

      if (capacityPercentage > 90) overloadedCount++;
      else if (capacityPercentage > 70) nearCapacityCount++;

      return {
        userId: user._id,
        fullName: user.fullName,
        department: user.department?.name || 'No Department',
        taskCount,
        completedCount,
        activeCount,
        capacityPercentage,
        statusColor: capacityPercentage > 90 ? 'red' : capacityPercentage > 70 ? 'amber' : 'green',
      };
    });

    res.json({
      success: true,
      data: {
        summary: {
          totalUsers: users.length,
          totalTasks,
          totalCompletedTasks,
          totalActiveTasks: totalTasks - totalCompletedTasks,
          totalActiveHours,
          totalCapacity: Math.round(totalCapacity),
          averageCapacity: users.length > 0 ? Math.round((totalActiveHours / totalCapacity) * 100) : 0,
          overloadedCount,
          nearCapacityCount,
          healthyCount: users.length - overloadedCount - nearCapacityCount,
        },
        users: userWorkloads,
      }
    });
  } catch (error) {
    console.error('Get workload summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
};

module.exports = {
  getWorkloadCapacity,
  getUserWorkload,
  getWorkloadSummary,
};