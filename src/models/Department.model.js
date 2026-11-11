// models/Department.model.js
const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    description: {
      type: String,
      default: "",
    },
    headOfDepartment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    employeeCount: {
      type: Number,
      default: 0,
    },
    settings: {
      workStartTime: {
        type: String,
        default: "09:00",
      },
      workEndTime: {
        type: String,
        default: "18:00",
      },
      gracePeriodMinutes: {
        type: Number,
        default: 15,
      },
      breakDurationMinutes: {
        type: Number,
        default: 60,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    budget: {
      type: Number,
      default: 0,
    },
    location: {
      type: String,
      default: "",
    },
    establishedDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ========== VIRTUAL FIELDS ==========
departmentSchema.virtual("headName").get(function () {
  return this.headOfDepartment?.fullName || "Not Assigned";
});

departmentSchema.virtual("headEmail").get(function () {
  return this.headOfDepartment?.email || "";
});

// ========== INDEXES ==========
departmentSchema.index({ name: 1 });
departmentSchema.index({ code: 1 });
departmentSchema.index({ isActive: 1 });
departmentSchema.index({ headOfDepartment: 1 });

// ========== METHODS ==========
departmentSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.headName = this.headName;
  obj.headEmail = this.headEmail;
  return obj;
};

// ========== UPDATE EMPLOYEE COUNT ==========
departmentSchema.methods.updateEmployeeCount = async function () {
  const { User } = require("./User.model");
  const count = await User.countDocuments({
    departmentId: this._id,
    isActive: true,
  });
  this.employeeCount = count;
  await this.save({ validateBeforeSave: false });
  return count;
};

// ========== STATIC METHODS ==========
departmentSchema.statics.findActive = function () {
  return this.find({ isActive: true });
};

departmentSchema.statics.findByCode = function (code) {
  return this.findOne({ code: code.toUpperCase() });
};

departmentSchema.statics.recountAll = async function () {
  const { User } = require("./User.model");
  const departments = await this.find({});
  let updated = 0;

  for (const dept of departments) {
    const count = await User.countDocuments({
      departmentId: dept._id,
      isActive: true,
    });
    dept.employeeCount = count;
    await dept.save({ validateBeforeSave: false });
    updated++;
  }

  return updated;
};

// ========== FIX: Check if model exists before creating ==========
let Department;
try {
  Department = mongoose.model("Department");
} catch (error) {
  Department = mongoose.model("Department", departmentSchema);
}

module.exports = { Department };
