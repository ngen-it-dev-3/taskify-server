// Email Templates Service
class EmailTemplates {
  static getBaseTemplate(content, title) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            line-height: 1.6;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
          }
          .email-container { max-width: 600px; margin: 0 auto; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center; }
          .header h1 { font-size: 28px; margin-bottom: 10px; }
          .content { padding: 40px 30px; background: #ffffff; }
          .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white !important; padding: 12px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
          .task-details { background: #f8f9fa; border-radius: 12px; padding: 20px; margin: 20px 0; border-left: 4px solid #667eea; }
          .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e9ecef; }
          .info-label { font-weight: 600; color: #4a5568; }
          .info-value { color: #2d3748; }
          .priority-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
          .priority-low { background: #d1fae5; color: #065f46; }
          .priority-normal { background: #dbeafe; color: #1e40af; }
          .priority-high { background: #fed7aa; color: #92400e; }
          .priority-urgent { background: #fee2e2; color: #991b1b; }
          .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
          .status-pending { background: #fef3c7; color: #92400e; }
          .status-in_progress { background: #dbeafe; color: #1e40af; }
          .status-submitted { background: #e9d5ff; color: #6b21a5; }
          .status-completed { background: #d1fae5; color: #065f46; }
          .status-overdue { background: #fee2e2; color: #991b1b; }
          .status-rejected { background: #fee2e2; color: #991b1b; }
          .footer { background: #f8f9fa; padding: 30px; text-align: center; font-size: 12px; color: #6c757d; border-top: 1px solid #e9ecef; }
          @media (max-width: 480px) { .content { padding: 20px; } .info-row { flex-direction: column; } }
        </style>
      </head>
      <body>
        <div class="email-container">${content}<div class="footer"><p>This is an automated notification from Task Management System.</p><p>© ${new Date().getFullYear()} Task Management System. All rights reserved.</p></div></div>
      </body>
      </html>
    `;
  }

  static taskAssigned(task, assignee, assigner) {
    const content = `
      <div class="header"><h1>📋 New Task Assigned</h1><p>You have been assigned a new task</p></div>
      <div class="content">
        <p>Hello <strong>${assignee.fullName}</strong>,</p>
        <p><strong>${assigner.fullName}</strong> has assigned a new task to you.</p>
        <div class="task-details">
          <h2 style="color: #667eea; margin-bottom: 15px;">${task.title}</h2>
          <p style="margin-bottom: 20px;">${task.description || "No description provided"}</p>
          <div class="info-row"><span class="info-label">Priority:</span><span class="info-value"><span class="priority-badge priority-${task.priority}">${task.priority.toUpperCase()}</span></span></div>
          <div class="info-row"><span class="info-label">Deadline:</span><span class="info-value">${new Date(task.deadline).toLocaleDateString()}</span></div>
          <div class="info-row"><span class="info-label">Estimated Hours:</span><span class="info-value">${task.estimatedHours} hours</span></div>
          ${task.projectId ? `<div class="info-row"><span class="info-label">Project:</span><span class="info-value">${task.projectId.name}</span></div>` : ""}
        </div>
        <div style="text-align: center;"><a href="${process.env.FRONTEND_URL}/tasks/${task._id}" class="button">View Task Details →</a></div>
      </div>
    `;
    return this.getBaseTemplate(content, `New Task: ${task.title}`);
  }

  static taskStatusUpdated(task, user, oldStatus, newStatus, updatedBy) {
    const content = `
      <div class="header"><h1>🔄 Task Status Updated</h1><p>Status has been changed</p></div>
      <div class="content">
        <p>Hello <strong>${user.fullName}</strong>,</p>
        <p>The status of task <strong>"${task.title}"</strong> has been updated by <strong>${updatedBy.fullName}</strong>.</p>
        <div class="task-details" style="text-align: center;">
          <div style="display: inline-block; padding: 10px 20px; background: #f8f9fa; border-radius: 8px;">
            <span class="status-badge status-${oldStatus}">${oldStatus.replace(/_/g, " ").toUpperCase()}</span>
            <span style="font-size: 20px; margin: 0 15px;">→</span>
            <span class="status-badge status-${newStatus}">${newStatus.replace(/_/g, " ").toUpperCase()}</span>
          </div>
        </div>
        ${newStatus === "completed" ? '<div style="background: #d1fae5; padding: 15px; border-radius: 8px; margin: 20px 0;"><p style="color: #065f46;">🎉 Congratulations on completing this task!</p></div>' : ""}
        ${newStatus === "rejected" ? '<div style="background: #fee2e2; padding: 15px; border-radius: 8px; margin: 20px 0;"><p style="color: #991b1b;">⚠️ Task rejected. Please review feedback.</p></div>' : ""}
        <div style="text-align: center;"><a href="${process.env.FRONTEND_URL}/tasks/${task._id}" class="button">View Task Details →</a></div>
      </div>
    `;
    return this.getBaseTemplate(
      content,
      `Task Status: ${newStatus.replace(/_/g, " ").toUpperCase()}`,
    );
  }

  static taskDueSoon(task, assignee, daysRemaining) {
    const content = `
      <div class="header" style="background: linear-gradient(135deg, #f59e0b 0%, #dc2626 100%);"><h1>⏰ Task Due Soon!</h1><p>Don't miss your deadline</p></div>
      <div class="content">
        <p>Hello <strong>${assignee.fullName}</strong>,</p>
        <div style="background: #fef3c7; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="font-size: 24px; font-weight: bold; margin-bottom: 10px; color: #f59e0b;">${daysRemaining} day(s) remaining</p>
          <p><strong>Task:</strong> ${task.title}</p>
          <p><strong>Due Date:</strong> ${new Date(task.deadline).toLocaleDateString()}</p>
        </div>
        <div style="text-align: center;"><a href="${process.env.FRONTEND_URL}/tasks/${task._id}" class="button">Update Task Status →</a></div>
      </div>
    `;
    return this.getBaseTemplate(content, `Due Soon: ${task.title}`);
  }

  static taskOverdue(task, assignee) {
    const content = `
      <div class="header" style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);"><h1>⚠️ Task Overdue</h1><p>Immediate attention required</p></div>
      <div class="content">
        <p>Hello <strong>${assignee.fullName}</strong>,</p>
        <div style="background: #fee2e2; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <p style="color: #991b1b; font-weight: bold;">⚠️ TASK IS OVERDUE!</p>
          <p>Task "${task.title}" deadline has passed.</p>
          <p><strong>Original Deadline:</strong> ${new Date(task.deadline).toLocaleDateString()}</p>
        </div>
        <div style="text-align: center;"><a href="${process.env.FRONTEND_URL}/tasks/${task._id}" class="button">Update Task Now →</a></div>
      </div>
    `;
    return this.getBaseTemplate(content, `OVERDUE: ${task.title}`);
  }

  static taskSubmitted(task, submitter, reviewer) {
    const content = `
      <div class="header" style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);"><h1>📤 Task Submitted for Review</h1><p>Ready for your approval</p></div>
      <div class="content">
        <p>Hello <strong>${reviewer.fullName}</strong>,</p>
        <p><strong>${submitter.fullName}</strong> has submitted task <strong>"${task.title}"</strong> for review.</p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${process.env.FRONTEND_URL}/tasks/${task._id}" class="button">Review Task →</a>
        </div>
      </div>
    `;
    return this.getBaseTemplate(content, `Review Required: ${task.title}`);
  }

  static taskApproved(task, assignee, approver) {
    const content = `
      <div class="header" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);"><h1>✅ Task Approved!</h1><p>Great work!</p></div>
      <div class="content">
        <p>Hello <strong>${assignee.fullName}</strong>,</p>
        <p><strong>${approver.fullName}</strong> has approved your task <strong>"${task.title}"</strong>.</p>
        <div style="background: #d1fae5; padding: 20px; border-radius: 12px; margin: 20px 0; text-align: center;">
          <p style="font-size: 48px;">🎉</p>
          <p style="color: #065f46;">Excellent work! Task completed successfully.</p>
        </div>
        <div style="text-align: center;"><a href="${process.env.FRONTEND_URL}/tasks/${task._id}" class="button">View Completed Task →</a></div>
      </div>
    `;
    return this.getBaseTemplate(content, `Task Approved: ${task.title}`);
  }

  static taskRejected(task, assignee, reviewer, reason) {
    const content = `
      <div class="header" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);"><h1>❌ Task Rejected</h1><p>Rework required</p></div>
      <div class="content">
        <p>Hello <strong>${assignee.fullName}</strong>,</p>
        <p><strong>${reviewer.fullName}</strong> has rejected your task <strong>"${task.title}"</strong>.</p>
        <div style="background: #fee2e2; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <p style="color: #991b1b; font-weight: bold;">📝 Feedback:</p>
          <p>${reason}</p>
        </div>
        <div style="text-align: center;"><a href="${process.env.FRONTEND_URL}/tasks/${task._id}" class="button">View Feedback & Rework →</a></div>
      </div>
    `;
    return this.getBaseTemplate(content, `Task Rejected: ${task.title}`);
  }
  static leaveApplied(leave, user, type) {
    const isEmployee = type === "employee";
    const isApprover = type === "approver";
    const isSubstitute = type === "substitute";

    let title, headerColor, icon, message;

    if (isEmployee) {
      title = "Leave Request Submitted";
      headerColor = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
      icon = "📋";
      message = "Your leave request has been submitted successfully";
    } else if (isApprover) {
      title = "New Leave Request";
      headerColor = "linear-gradient(135deg, #f59e0b 0%, #dc2626 100%)";
      icon = "👤";
      message = `${leave.employeeName} has requested leave`;
    } else if (isSubstitute) {
      title = "Assigned as Substitute";
      headerColor = "linear-gradient(135deg, #06b6d4 0%, #0284c7 100%)";
      icon = "🔄";
      message = `You've been assigned as substitute for ${leave.employeeName}`;
    }

    const content = `
    <div class="header" style="background: ${headerColor};">
      <h1>${icon} ${title}</h1>
      <p>${message}</p>
    </div>
    <div class="content">
      <p>Hello <strong>${user.fullName}</strong>,</p>
      ${isApprover ? `<p><strong>${leave.employeeName}</strong> (${leave.employeeEmail}) has submitted a leave request.</p>` : ""}
      ${isSubstitute ? `<p><strong>${leave.employeeName}</strong> has selected you as their substitute during their leave period.</p>` : ""}
      <div class="task-details">
        <h2 style="color: #667eea; margin-bottom: 15px;">Leave Details</h2>
        <div class="info-row"><span class="info-label">Leave Type:</span><span class="info-value">${leave.type.charAt(0).toUpperCase() + leave.type.slice(1)}</span></div>
        <div class="info-row"><span class="info-label">Start Date:</span><span class="info-value">${new Date(leave.startDate).toLocaleDateString()}</span></div>
        <div class="info-row"><span class="info-label">End Date:</span><span class="info-value">${new Date(leave.endDate).toLocaleDateString()}</span></div>
        <div class="info-row"><span class="info-label">Total Days:</span><span class="info-value">${leave.totalDays} day(s)</span></div>
        ${leave.isHalfDay ? `<div class="info-row"><span class="info-label">Half Day:</span><span class="info-value">Yes (${leave.halfDayType?.replace("_", " ") || "N/A"})</span></div>` : ""}
        <div class="info-row"><span class="info-label">Reason:</span><span class="info-value">${leave.reason}</span></div>
        ${leave.additionalDetails ? `<div class="info-row"><span class="info-label">Additional Details:</span><span class="info-value">${leave.additionalDetails}</span></div>` : ""}
        ${leave.substituteName ? `<div class="info-row"><span class="info-label">Substitute:</span><span class="info-value">${leave.substituteName} (${leave.substituteEmail})</span></div>` : ""}
      </div>
      <div style="text-align: center;">
        ${isEmployee ? `<a href="${process.env.FRONTEND_URL}/leaves" class="button">View My Leaves →</a>` : ""}
        ${isApprover ? `<a href="${process.env.FRONTEND_URL}/reports/leaves" class="button">Review Leave Requests →</a>` : ""}
        ${isSubstitute ? `<a href="${process.env.FRONTEND_URL}/leaves" class="button">View Details →</a>` : ""}
      </div>
    </div>
  `;
    return this.getBaseTemplate(content, title);
  }
  // Leave Approved Email Template
  static leaveApproved(leave, employee, approver) {
    const content = `
    <div class="header" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
      <h1>✅ Leave Approved</h1>
      <p>Your leave request has been approved</p>
    </div>
    <div class="content">
      <p>Hello <strong>${employee.fullName}</strong>,</p>
      <p>Your ${leave.type} leave request has been <strong>approved</strong> by <strong>${approver.fullName}</strong>.</p>
      <div class="task-details">
        <h2 style="color: #667eea; margin-bottom: 15px;">Leave Details</h2>
        <div class="info-row"><span class="info-label">Leave Type:</span><span class="info-value">${leave.type.charAt(0).toUpperCase() + leave.type.slice(1)}</span></div>
        <div class="info-row"><span class="info-label">Start Date:</span><span class="info-value">${new Date(leave.startDate).toLocaleDateString()}</span></div>
        <div class="info-row"><span class="info-label">End Date:</span><span class="info-value">${new Date(leave.endDate).toLocaleDateString()}</span></div>
        <div class="info-row"><span class="info-label">Total Days:</span><span class="info-value">${leave.totalDays} day(s)</span></div>
      </div>
      ${leave.substituteName ? `<div style="background: #dbeafe; padding: 15px; border-radius: 8px; margin: 20px 0;"><p style="color: #1e40af;">📌 <strong>${leave.substituteName}</strong> has been assigned as your substitute during this leave.</p></div>` : ""}
      <div style="text-align: center;"><a href="${process.env.FRONTEND_URL}/leaves" class="button">View My Leaves →</a></div>
    </div>
  `;
    return this.getBaseTemplate(content, "Leave Approved");
  }
  // Leave Rejected Email Template
  static leaveRejected(leave, employee, approver, reason) {
    const content = `
    <div class="header" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);">
      <h1>❌ Leave Rejected</h1>
      <p>Your leave request has been rejected</p>
    </div>
    <div class="content">
      <p>Hello <strong>${employee.fullName}</strong>,</p>
      <p>Your ${leave.type} leave request has been <strong>rejected</strong> by <strong>${approver.fullName}</strong>.</p>
      <div style="background: #fee2e2; padding: 20px; border-radius: 12px; margin: 20px 0;">
        <p style="color: #991b1b; font-weight: bold;">📝 Reason for Rejection:</p>
        <p>${reason}</p>
      </div>
      <div class="task-details">
        <h2 style="color: #667eea; margin-bottom: 15px;">Leave Details</h2>
        <div class="info-row"><span class="info-label">Leave Type:</span><span class="info-value">${leave.type.charAt(0).toUpperCase() + leave.type.slice(1)}</span></div>
        <div class="info-row"><span class="info-label">Start Date:</span><span class="info-value">${new Date(leave.startDate).toLocaleDateString()}</span></div>
        <div class="info-row"><span class="info-label">End Date:</span><span class="info-value">${new Date(leave.endDate).toLocaleDateString()}</span></div>
        <div class="info-row"><span class="info-label">Total Days:</span><span class="info-value">${leave.totalDays} day(s)</span></div>
      </div>
      <div style="text-align: center;"><a href="${process.env.FRONTEND_URL}/leaves" class="button">View My Leaves →</a></div>
    </div>
  `;
    return this.getBaseTemplate(content, "Leave Rejected");
  }
  // Leave Cancelled Email Template
  static leaveCancelled(leave, employee) {
    const content = `
    <div class="header" style="background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);">
      <h1>🔄 Leave Cancelled</h1>
      <p>Your leave request has been cancelled</p>
    </div>
    <div class="content">
      <p>Hello <strong>${employee.fullName}</strong>,</p>
      <p>Your ${leave.type} leave request has been <strong>cancelled</strong>.</p>
      <div class="task-details">
        <h2 style="color: #667eea; margin-bottom: 15px;">Leave Details</h2>
        <div class="info-row"><span class="info-label">Leave Type:</span><span class="info-value">${leave.type.charAt(0).toUpperCase() + leave.type.slice(1)}</span></div>
        <div class="info-row"><span class="info-label">Start Date:</span><span class="info-value">${new Date(leave.startDate).toLocaleDateString()}</span></div>
        <div class="info-row"><span class="info-label">End Date:</span><span class="info-value">${new Date(leave.endDate).toLocaleDateString()}</span></div>
        <div class="info-row"><span class="info-label">Total Days:</span><span class="info-value">${leave.totalDays} day(s)</span></div>
      </div>
      <div style="text-align: center;"><a href="${process.env.FRONTEND_URL}/leaves" class="button">View My Leaves →</a></div>
    </div>
  `;
    return this.getBaseTemplate(content, "Leave Cancelled");
  }
  // Leave Reminder Email Template
  static leaveReminder(leave, employee, daysUntil) {
    const content = `
    <div class="header" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
      <h1>📅 Leave Reminder</h1>
      <p>Your leave starts soon</p>
    </div>
    <div class="content">
      <p>Hello <strong>${employee.fullName}</strong>,</p>
      <div style="background: #fef3c7; padding: 20px; border-radius: 12px; margin: 20px 0; text-align: center;">
        <p style="font-size: 24px; font-weight: bold; color: #f59e0b;">${daysUntil} day(s) remaining</p>
        <p style="color: #92400e;">Your ${leave.type} leave starts on ${new Date(leave.startDate).toLocaleDateString()}</p>
      </div>
      <div class="task-details">
        <h2 style="color: #667eea; margin-bottom: 15px;">Leave Details</h2>
        <div class="info-row"><span class="info-label">Leave Type:</span><span class="info-value">${leave.type.charAt(0).toUpperCase() + leave.type.slice(1)}</span></div>
        <div class="info-row"><span class="info-label">Start Date:</span><span class="info-value">${new Date(leave.startDate).toLocaleDateString()}</span></div>
        <div class="info-row"><span class="info-label">End Date:</span><span class="info-value">${new Date(leave.endDate).toLocaleDateString()}</span></div>
        <div class="info-row"><span class="info-label">Total Days:</span><span class="info-value">${leave.totalDays} day(s)</span></div>
      </div>
      ${leave.substituteName ? `<div style="background: #dbeafe; padding: 15px; border-radius: 8px; margin: 20px 0;"><p style="color: #1e40af;">📌 <strong>${leave.substituteName}</strong> is assigned as your substitute.</p></div>` : ""}
      <div style="text-align: center;"><a href="${process.env.FRONTEND_URL}/leaves" class="button">View Leave Details →</a></div>
    </div>
  `;
    return this.getBaseTemplate(content, "Leave Reminder");
  }
}

module.exports = EmailTemplates;
