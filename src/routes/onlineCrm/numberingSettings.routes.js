// src/routes/onlineCrm/numberingSettings.routes.js
const express = require('express');
const ctrl = require('../../controllers/onlineCrm/numberingSettings.controller');

const router = express.Router();

/* ⭐ All numbering-settings routes are PUBLIC (no auth) */

router.get('/', ctrl.get);                          // read settings by scope
router.patch('/', ctrl.update);                     // save settings (public)
router.post('/preview', ctrl.preview);              // preview next number
router.post('/generate-next', ctrl.generateNext);   // generate + increment

module.exports = router;