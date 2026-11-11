const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const {
  getResources,
  getResourceById,
  createResource,
  updateResource,
  deleteResource,
  seedResources,
} = require('../controllers/resource.controller');

const router = express.Router();

// All routes require authentication (no role restrictions)
router.use(authenticate);

// Resource routes - allow all authenticated users
router.get('/', getResources);
router.post('/seed', seedResources);
router.get('/:id', getResourceById);
router.post('/', createResource);
router.put('/:id', updateResource);
router.delete('/:id', deleteResource);

module.exports = router;