// routes/department.routes.js
const express = require("express");
const { body } = require("express-validator");
const {
  getAllDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getDepartmentEmployees,
  updateDepartmentEmployeeCount,
  recountAllDepartments,
} = require("../controllers/department.controller");
const { authenticate, requireRole } = require("../middleware/auth.middleware");

const router = express.Router();

// Validation rules
const createDepartmentValidation = [
  body("name").notEmpty().trim().withMessage("Name is required"),
  body("code")
    .notEmpty()
    .isLength({ min: 2, max: 10 })
    .withMessage("Code must be 2-10 characters"),
  body("description").optional(),
  body("headOfDepartment")
    .optional()
    .isMongoId()
    .withMessage("Invalid head of department ID"),
  body("budget").optional().isNumeric().withMessage("Budget must be a number"),
  body("location").optional().isString(),
];

const updateDepartmentValidation = [
  body("name").optional().trim(),
  body("code").optional().isLength({ min: 2, max: 10 }),
  body("description").optional(),
  body("headOfDepartment").optional().isMongoId(),
  body("isActive").optional().isBoolean(),
  body("budgetAllocated").optional().isNumeric(),
  body("location").optional().isString(),
];

// All routes require authentication
router.use(authenticate);

// Routes accessible by authenticated users
router.get("/", getAllDepartments);
router.get("/:id", getDepartmentById);
router.get(
  "/:id/employees",
  requireRole("super_admin", "admin", "hr_manager", "dept_manager"),
  getDepartmentEmployees,
);

// Admin only routes
router.post(
  "/",
  requireRole("super_admin", "admin", "hr_manager", "dept_manager"),
  createDepartmentValidation,
  createDepartment,
);
router.put(
  "/:id",
  requireRole("super_admin", "admin", "hr_manager", "dept_manager"),
  updateDepartmentValidation,
  updateDepartment,
);
router.delete(
  "/:id",
  requireRole("super_admin", "admin", "hr_manager", "dept_manager"),
  deleteDepartment,
);
router.put(
  "/:id/update-count",
  requireRole("super_admin", "admin", "hr_manager", "dept_manager"),
  updateDepartmentEmployeeCount,
);
router.post(
  "/recount-all",
  requireRole("super_admin", "admin"),
  recountAllDepartments,
);

module.exports = router;
