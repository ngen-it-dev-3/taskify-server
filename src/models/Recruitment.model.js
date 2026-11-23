// src/models/Recruitment.model.js
const mongoose = require("mongoose");

const jobPositionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Position title is required"],
      trim: true,
      maxlength: [150, "Title cannot exceed 150 characters"],
    },
    department: {
      type: String,
      required: [true, "Department is required"],
      trim: true,
      maxlength: [100, "Department cannot exceed 100 characters"],
    },
    region: {
      type: String,
      trim: true,
      default: "Head Office",
    },
    vacancies: {
      type: Number,
      default: 1,
      min: [1, "At least 1 vacancy is required"],
    },
    stage: {
      type: String,
      enum: ["open", "interviewing", "offer", "closed", "on_hold"],
      default: "interviewing",
      index: true,
    },
    targetStartDate: {
      type: Date,
      default: null,
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

const questionItemSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: true,
      trim: true,
    },
    answer: {
      type: String,
      required: true,
      trim: true,
    },
    marks: {
      type: Number,
      default: 10,
    },
  },
  { _id: true }
);

const questionPaperSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Question paper title is required"],
      trim: true,
      maxlength: [150, "Title cannot exceed 150 characters"],
    },
    positionLabel: {
      type: String,
      trim: true,
      default: "All Positions",
    },
    positionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobPosition",
      default: null,
    },
    paperType: {
      type: String,
      trim: true,
      default: "Aptitude",
    },
    questionsCountOverride: {
      type: Number,
      default: null,
    },
    questions: {
      type: [questionItemSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

const onlineTestSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Test title is required"],
      trim: true,
      maxlength: [150, "Title cannot exceed 150 characters"],
    },
    positionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobPosition",
      default: null,
    },
    questionPaperId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QuestionPaper",
      default: null,
    },
    status: {
      type: String,
      enum: ["Active", "Completed", "Draft"],
      default: "Active",
    },
    candidatesTaken: {
      type: Number,
      default: 0,
      min: 0,
    },
    candidatesTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

const submittedAnswerSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true },
    answered: { type: String, required: true, trim: true },
    isCorrect: { type: Boolean, default: true },
  },
  { _id: true }
);

const testSubmissionSchema = new mongoose.Schema(
  {
    testId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OnlineTest",
      default: null,
      index: true,
    },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
      default: null,
    },
    candidateName: {
      type: String,
      required: true,
      trim: true,
    },
    submittedDate: {
      type: Date,
      default: Date.now,
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    answers: {
      type: [submittedAnswerSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

const candidateSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Candidate name is required"],
      trim: true,
      maxlength: [120, "Name cannot exceed 120 characters"],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other", ""],
      default: "",
    },
    department: {
      type: String,
      trim: true,
      default: "",
    },
    experienceYears: {
      type: Number,
      default: 0,
      min: 0,
    },
    interviewedBefore: {
      type: Boolean,
      default: false,
    },
    positionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobPosition",
      default: null,
      index: true,
    },
    positionAppliedLabel: {
      type: String,
      trim: true,
      default: "",
    },
    source: {
      type: String,
      trim: true,
      default: "Online Test Portal",
    },
    stage: {
      type: String,
      enum: [
        "Shortlisted",
        "Interviewing",
        "Not Selected",
        "On File",
        "Selected",
      ],
      default: "On File",
      index: true,
    },
    testScore: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    blacklisted: {
      type: Boolean,
      default: false,
      index: true,
    },
    blacklistReason: {
      type: String,
      trim: true,
      default: "",
    },
    cvFileName: {
      type: String,
      default: "CV.pdf",
      trim: true,
    },
    cvFileUrl: {
      type: String,
      default: "",
      trim: true,
    },
    cvFilePath: {
      type: String,
      default: "",
      trim: true,
    },
    cvFileSize: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

const interviewSelectionSchema = new mongoose.Schema(
  {
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
      default: null,
    },
    candidateName: {
      type: String,
      required: true,
      trim: true,
    },
    designation: {
      type: String,
      required: true,
      trim: true,
    },
    interviewDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["Selected", "Scheduled", "Rejected"],
      default: "Scheduled",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

const onboardingHireSchema = new mongoose.Schema(
  {
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
      default: null,
    },
    employeeName: {
      type: String,
      required: [true, "New hire name is required"],
      trim: true,
      maxlength: [120, "Name cannot exceed 120 characters"],
    },
    department: {
      type: String,
      required: [true, "Department is required"],
      trim: true,
    },
    positionTitle: {
      type: String,
      trim: true,
      default: "",
    },
    startDate: {
      type: Date,
      required: true,
    },
    completedSteps: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalSteps: {
      type: Number,
      default: 6,
      min: 1,
    },
    ndaStatus: {
      type: String,
      enum: ["Signed", "Pending"],
      default: "Pending",
    },
    status: {
      type: String,
      enum: ["In Progress", "Completed", "On Hold"],
      default: "In Progress",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = {
  JobPosition: mongoose.model("JobPosition", jobPositionSchema),
  QuestionPaper: mongoose.model("QuestionPaper", questionPaperSchema),
  OnlineTest: mongoose.model("OnlineTest", onlineTestSchema),
  TestSubmission: mongoose.model("TestSubmission", testSubmissionSchema),
  Candidate: mongoose.model("Candidate", candidateSchema),
  InterviewSelection: mongoose.model("InterviewSelection", interviewSelectionSchema),
  OnboardingHire: mongoose.model("OnboardingHire", onboardingHireSchema),
};