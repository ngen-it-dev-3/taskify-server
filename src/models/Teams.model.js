const mongoose = require('mongoose');

const TeamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Team name is required'],
      trim: true,
      unique: true,
      minlength: [2, 'Team name must be at least 2 characters'],
      maxlength: [50, 'Team name cannot exceed 50 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    department: {
      type: String,
      required: [true, 'Department is required'],
      trim: true,
    },
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Team lead is required'],
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    projects: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
      },
    ],
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    color: {
      type: String,
      default: '#6366f1',
    },
    icon: {
      type: String,
      default: 'users',
    },
    teamSize: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
TeamSchema.index({ name: 1 });
TeamSchema.index({ department: 1 });
TeamSchema.index({ lead: 1 });
TeamSchema.index({ status: 1 });

// Pre-save middleware to update teamSize
TeamSchema.pre('save', function (next) {
  this.teamSize = this.members.length;
  next();
});

// Method to get populated members
TeamSchema.methods.getPopulatedMembers = async function () {
  return await this.populate('members', 'fullName email role avatar isActive');
};

// Check if model exists before creating
const Team = mongoose.models.Team || mongoose.model('Team', TeamSchema);

module.exports = Team;