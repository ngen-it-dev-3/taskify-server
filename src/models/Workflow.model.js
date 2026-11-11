const mongoose = require('mongoose');

const triggerSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['task_created', 'task_completed', 'deadline_approaching', 'status_changed', 'user_joined', 'custom'],
    required: true
  },
  condition: { type: String },
  customEvent: { type: String },
});

const actionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['send_email', 'send_notification', 'assign_task', 'update_status', 'webhook', 'create_task'],
    required: true
  },
  config: {
    template: { type: String },
    message: { type: String },
    to: { type: String },
    status: { type: String },
    url: { type: String },
    taskTemplate: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' }
  }
});

const workflowSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String },
    trigger: { type: triggerSchema, required: true },
    actions: [actionSchema],
    status: {
      type: String,
      enum: ['active', 'inactive', 'draft'],
      default: 'draft'
    },
    executionCount: { type: Number, default: 0 },
    lastExecuted: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: {
      type: String,
      enum: ['task', 'approval', 'notification', 'automation'],
      default: 'automation'
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high'],
      default: 'normal'
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

workflowSchema.index({ name: 1 });
workflowSchema.index({ status: 1 });
workflowSchema.index({ category: 1 });
workflowSchema.index({ createdBy: 1 });

module.exports = { Workflow: mongoose.model('Workflow', workflowSchema) };