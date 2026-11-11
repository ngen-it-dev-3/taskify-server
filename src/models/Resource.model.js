const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['human', 'equipment', 'software', 'material'],
      required: true
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['available', 'in_use', 'maintenance', 'retired'],
      default: 'available'
    },
    utilization: { type: Number, default: 0, min: 0, max: 100 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

resourceSchema.index({ name: 1 });
resourceSchema.index({ type: 1 });
resourceSchema.index({ status: 1 });
resourceSchema.index({ projectId: 1 });

module.exports = { Resource: mongoose.model('Resource', resourceSchema) };