const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  estimatedHours: { type: Number, default: 1 },
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
});

const templateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String },
    category: {
      type: String,
      enum: ['Development', 'Marketing', 'Product', 'Design', 'HR', 'Finance'],
      default: 'Development'
    },
    estimatedDuration: { type: Number, default: 30 }, // days
    taskCount: { type: Number, default: 10 },
    usageCount: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
    tasks: [taskSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

templateSchema.index({ name: 1 });
templateSchema.index({ category: 1 });
templateSchema.index({ isFeatured: 1 });

module.exports = { Template: mongoose.model('Template', templateSchema) };