// models/Task.model.js
const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    project: { type: String, trim: true },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: false,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
    },
    status: {
      type: String,
      enum: [
        "pending",
        "in_progress",
        "submitted",
        "completed",
        "overdue",
        "rejected",
      ],
      default: "pending",
    },
    estimatedHours: { type: Number, default: 0 },
    actualMinutes: { type: Number, default: 0 },

    // ✅ FIXED: Added actualMinutes (was silently dropped by Mongoose strict mode)
    actualMinutes: {
      type: Number,
      default: 0,
      description: "Total tracked time in minutes (saved from timer)",
    },

    deadline: { type: Date, required: true },
    startDate: { type: Date },

    // ✅ FIXED: Added revisedDeadline (was silently dropped by Mongoose strict mode)
    revisedDeadline: {
      type: Date,
      default: null,
      description: "New deadline after extension approval",
    },

    progress: { type: Number, min: 0, max: 100, default: 0 },

    // 🆕 MILESTONE FIELDS
    isMilestone: {
      type: Boolean,
      default: false,
      description: "If true, task appears as diamond on Gantt chart",
    },
    parentTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
      description: "If set, this task is a sub-task of parent task",
    },
    subTaskCount: {
      type: Number,
      default: 0,
      description: "Number of sub-tasks (for parent tasks)",
    },
    completedSubTaskCount: {
      type: Number,
      default: 0,
      description: "Number of completed sub-tasks (for parent tasks)",
    },

    // 🆕 TASK DEPENDENCY FIELDS
    dependencies: [
      {
        taskId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Task",
          required: true,
        },
        type: {
          type: String,
          enum: ["FS", "SS", "FF", "SF"],
          default: "FS",
          description:
            "Dependency type: FS=Finish to Start, SS=Start to Start, FF=Finish to Finish, SF=Start to Finish",
        },
        lag: {
          type: Number,
          default: 0,
          description: "Delay in days between dependency tasks",
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    dependents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Task",
        description: "Tasks that depend on this task (reverse lookup)",
      },
    ],

    // Existing fields
    isApprovalRequired: { type: Boolean, default: false },
    evidenceRequired: { type: Boolean, default: false },
    evidenceUrls: [{ type: String }],
    evidenceSubmitted: { type: Boolean, default: false },
    evidenceSubmittedAt: { type: Date },
    rejectionReason: { type: String, default: "" },
    approvalNote: { type: String, default: "" },
    isTimerRunning: { type: Boolean, default: false },
    timerStartTime: { type: Date },
    elapsedTime: { type: Number, default: 0 },
    timeSpent: { type: Number, default: 0 },
    completedAt: { type: Date },
    order: { type: Number, default: 0 },

    extensionRequests: [
      {
        requestedDate: { type: Date, default: Date.now },
        reason: String,
        status: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending",
        },
        approvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User", // ✅ IMPORTANT: must be ref to User
          default: null,
        },
        approvedAt: { type: Date, default: null },
      },
    ],
  },
  { timestamps: true },
);

taskSchema.add({
  commentsCount: { type: Number, default: 0 },
  attachmentsCount: { type: Number, default: 0 },
  reviewsCount: { type: Number, default: 0 },
  averageRating: { type: Number, default: 0 },
});

// ============================================
// 🆕 MIDDLEWARE: Check for circular dependencies before save
// ============================================
taskSchema.pre("save", async function (next) {
  // If dependencies are being modified, check for circular dependencies
  if (this.isModified("dependencies")) {
    const circular = await this.checkCircularDependencies(
      this._id,
      this.dependencies,
    );
    if (circular) {
      const error = new Error(`Circular dependency detected: ${circular}`);
      error.status = 400;
      return next(error);
    }
  }

  // If this is a milestone, auto-set properties
  if (this.isMilestone) {
    this.estimatedHours = 0;
    this.progress = 100;
    this.parentTaskId = null;
    this.subTaskCount = 0;
    this.completedSubTaskCount = 0;
  }

  // If this is a regular task (not milestone)
  if (!this.isMilestone && this.progress >= 100) {
    if (this.status !== "completed" && this.status !== "done") {
      this.status = "completed";
      this.completedAt = new Date();
    }
  }

  next();
});

// ============================================
// 🆕 METHOD: Check for circular dependencies
// ============================================
taskSchema.methods.checkCircularDependencies = async function (
  taskId,
  dependencies,
) {
  if (!dependencies || dependencies.length === 0) return null;

  // Build dependency graph
  const graph = {};
  const visited = new Set();
  const recursionStack = new Set();

  // Get all tasks with their dependencies
  const allTasks = await mongoose
    .model("Task")
    .find({})
    .select("_id dependencies")
    .lean();

  // Build graph
  allTasks.forEach((t) => {
    graph[t._id.toString()] = (t.dependencies || []).map((d) =>
      d.taskId.toString(),
    );
  });

  // Add current dependencies to graph
  graph[taskId.toString()] = dependencies.map((d) => d.taskId.toString());

  // DFS to detect cycle
  const detectCycle = (node, path = []) => {
    if (recursionStack.has(node)) {
      // Found cycle
      const cycleStart = path.indexOf(node);
      const cycle = path.slice(cycleStart).concat(node);
      return cycle.join(" → ");
    }

    if (visited.has(node)) return null;

    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const neighbors = graph[node] || [];
    for (const neighbor of neighbors) {
      const result = detectCycle(neighbor, path);
      if (result) return result;
    }

    recursionStack.delete(node);
    path.pop();
    return null;
  };

  // Check for cycles starting from the current task
  return detectCycle(taskId.toString());
};

// ============================================
// 🆕 METHOD: Get all dependent tasks (forward)
// ============================================
taskSchema.methods.getDependentTasks = async function () {
  const tasks = await mongoose
    .model("Task")
    .find({
      "dependencies.taskId": this._id,
    })
    .select("_id title status deadline priority");
  return tasks;
};

// ============================================
// 🆕 METHOD: Get all predecessor tasks (backward)
// ============================================
taskSchema.methods.getPredecessorTasks = async function () {
  const tasks = await mongoose
    .model("Task")
    .find({
      _id: { $in: (this.dependencies || []).map((d) => d.taskId) },
    })
    .select("_id title status deadline priority");
  return tasks;
};

// ============================================
// 🆕 STATIC METHOD: Get task dependency chain
// ============================================
taskSchema.statics.getDependencyChain = async function (taskId) {
  const task = await this.findById(taskId).lean();
  if (!task) return null;

  const chain = {
    predecessors: [],
    dependents: [],
  };

  // Get predecessors
  if (task.dependencies && task.dependencies.length > 0) {
    const predIds = task.dependencies.map((d) => d.taskId);
    chain.predecessors = await this.find({
      _id: { $in: predIds },
    }).select("_id title status deadline priority");
  }

  // Get dependents
  const dependents = await this.find({
    "dependencies.taskId": taskId,
  }).select("_id title status deadline priority");
  chain.dependents = dependents;

  return chain;
};

// ============================================
// 🆕 STATIC METHOD: Get all tasks with dependencies for a project
// ============================================
taskSchema.statics.getProjectDependencies = async function (projectId) {
  const tasks = await this.find({ projectId })
    .select("_id title status deadline dependencies")
    .lean();

  const dependencies = [];
  tasks.forEach((task) => {
    if (task.dependencies && task.dependencies.length > 0) {
      task.dependencies.forEach((dep) => {
        dependencies.push({
          from: dep.taskId,
          to: task._id,
          type: dep.type,
          lag: dep.lag,
        });
      });
    }
  });

  return dependencies;
};

// ============================================
// 🆕 VIRTUAL: Check if task has dependencies
// ============================================
taskSchema.virtual("hasDependencies").get(function () {
  return this.dependencies && this.dependencies.length > 0;
});

taskSchema.virtual("isDependent").get(function () {
  return this.dependents && this.dependents.length > 0;
});

// ============================================
// POST-SAVE: Update dependents array
// ============================================
taskSchema.post("save", async function (doc) {
  // Update dependents for all tasks that depend on this task
  const tasks = await mongoose.model("Task").find({
    "dependencies.taskId": doc._id,
  });

  for (const task of tasks) {
    if (!task.dependents) task.dependents = [];
    if (!task.dependents.includes(doc._id)) {
      task.dependents.push(doc._id);
      await task.save();
    }
  }

  // If this task has dependencies, update its dependents array
  if (doc.dependencies && doc.dependencies.length > 0) {
    for (const dep of doc.dependencies) {
      const depTask = await mongoose.model("Task").findById(dep.taskId);
      if (depTask) {
        if (!depTask.dependents) depTask.dependents = [];
        if (!depTask.dependents.includes(doc._id)) {
          depTask.dependents.push(doc._id);
          await depTask.save();
        }
      }
    }
  }
});

// ============================================
// ✅ FIXED: PRE-DELETE: Clean up dependencies
// Changed from 'remove' → 'findOneAndDelete' because the controller uses
// Task.findByIdAndDelete(id), which fires findOneAndDelete middleware, NOT remove.
// ============================================
taskSchema.pre("findOneAndDelete", async function () {
  // 'this' is the query, not the document. Fetch the doc first.
  const doc = await this.model.findOne(this.getQuery());
  if (!doc) return;

  // Remove this task from all dependencies
  await mongoose.model("Task").updateMany(
    { "dependencies.taskId": doc._id },
    { $pull: { dependencies: { taskId: doc._id } } },
  );

  // Remove this task from all dependents
  await mongoose.model("Task").updateMany(
    { dependents: doc._id },
    { $pull: { dependents: doc._id } },
  );
});

// ============================================
// INDEXES
// ============================================
taskSchema.index({ assignedTo: 1 });
taskSchema.index({ departmentId: 1 });
taskSchema.index({ status: 1 });
taskSchema.index({ deadline: 1 });
taskSchema.index({ projectId: 1 });
taskSchema.index({ projectId: 1, order: 1 });
taskSchema.index({ isMilestone: 1, projectId: 1 });
taskSchema.index({ parentTaskId: 1 });
taskSchema.index({ isMilestone: 1, status: 1 });
taskSchema.index({ progress: 1 });

// 🆕 Indexes for dependencies
taskSchema.index({ "dependencies.taskId": 1 });
taskSchema.index({ dependents: 1 });

// Enable virtuals in JSON output
taskSchema.set("toJSON", { virtuals: true });
taskSchema.set("toObject", { virtuals: true });

module.exports = { Task: mongoose.model("Task", taskSchema) };