// src/controllers/onlineCrm/numberingSettings.controller.js
const svc = require('../../services/onlineCrm/numberingSettings.service');

/** GET /api/v1/numbering-settings?scope=quote|pq */
exports.get = async (req, res, next) => {
  try {
    const scope = req.query.scope === 'pq' ? 'pq' : 'quote';
    const doc = await svc.getSettings();
    res.json({
      success: true,
      data: doc[scope],              // <-- only the requested scheme
      meta: { scope },
    });
  } catch (e) {
    next(e);
  }
};

/** PATCH /api/v1/numbering-settings  body: { scope, ...fields } */
exports.update = async (req, res, next) => {
  try {
    const scope = req.body.scope === 'pq' ? 'pq' : 'quote';
    const doc = await svc.updateSettings({
      scope,
      payload: req.body,
      userId: req.user?._id,
    });
    res.json({ success: true, data: doc[scope], meta: { scope } });
  } catch (e) {
    next(e);
  }
};

/** POST /api/v1/numbering-settings/preview  body: { scope } */
exports.preview = async (req, res, next) => {
  try {
    const scope = req.body.scope === 'pq' ? 'pq' : 'quote';
    const doc = await svc.getSettings();
    const scheme = doc[scope];
    const next = (scheme.nextSeq || 0) + 1;
    const number = scope === 'quote'
      ? svc.buildQuoteNumber(scheme, next)
      : svc.buildPqNumber(scheme, next);
    res.json({ success: true, data: { number, seq: next } });
  } catch (e) {
    next(e);
  }
};

/* ⭐ Internal helper — call this from your quote/PQ generation
   controller instead of writing the same logic there. */
exports.generateNext = async (req, res, next) => {
  try {
    const scope = req.query.scope === 'pq' ? 'pq' : 'quote';
    const result = await svc.generateNextNumber(scope);
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};