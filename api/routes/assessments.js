const express = require('express');
const { ObjectId } = require('mongodb');
const { connectDB } = require('../../lib/mongodb');
const { generateActionPlan } = require('../services/gemini');

const router = express.Router();

// GET /api/assessments - List assessments (filterable)
router.get('/', async (req, res, next) => {
  try {
    const db = await connectDB();
    const { phase, status, barangay } = req.query;
    const filter = {};
    if (phase) filter.phase = phase;
    if (status) filter.status = status;

    if (barangay) {
      const buildingIds = await db
        .collection('buildings')
        .find({ barangay })
        .project({ _id: 1 })
        .toArray();
      filter.buildingId = { $in: buildingIds.map((b) => b._id) };
    }

    const assessments = await db
      .collection('assessments')
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    // Populate building refs
    for (const a of assessments) {
      if (a.buildingId) {
        a.building = await db.collection('buildings').findOne({ _id: a.buildingId });
      }
    }

    res.json(assessments);
  } catch (err) {
    next(err);
  }
});

// GET /api/assessments/:id - Get assessment by ID
router.get('/:id', async (req, res, next) => {
  try {
    const db = await connectDB();
    let id;
    try {
      id = new ObjectId(req.params.id);
    } catch {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const assessment = await db.collection('assessments').findOne({ _id: id });
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    if (assessment.buildingId) {
      assessment.building = await db.collection('buildings').findOne({ _id: assessment.buildingId });
    }

    res.json(assessment);
  } catch (err) {
    next(err);
  }
});

// POST /api/assessments - Create assessment
router.post('/', async (req, res, next) => {
  try {
    const db = await connectDB();
    const body = req.body;
    const now = new Date();

    const buildingId = body.buildingId ? new ObjectId(body.buildingId) : null;
    const inspectorId = body.inspectorId ? new ObjectId(body.inspectorId) : null;

    const doc = {
      buildingId,
      inspectorId,
      phase: body.phase || 'pre-earthquake',
      images: body.images || [],
      structuralData: body.structuralData || body.structural_data || {},
      aiResult: body.aiResult || null,
      actionPlan: body.actionPlan || null,
      engineerReview: body.engineerReview || null,
      priorityScore: body.priorityScore ?? 0,
      status: body.status || 'pending-review',
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('assessments').insertOne(doc);
    const inserted = await db.collection('assessments').findOne({ _id: result.insertedId });
    res.status(201).json(inserted);
  } catch (err) {
    next(err);
  }
});

// POST /api/assessments/:id/action-plan - Generate action plan (Gemini or template fallback)
router.post('/:id/action-plan', async (req, res, next) => {
  try {
    const db = await connectDB();
    let id;
    try {
      id = new ObjectId(req.params.id);
    } catch {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const assessment = await db.collection('assessments').findOne({ _id: id });
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    if (assessment.buildingId) {
      assessment.building = await db.collection('buildings').findOne({ _id: assessment.buildingId });
    }

    const actionPlan = await generateActionPlan(assessment);

    await db.collection('assessments').updateOne(
      { _id: id },
      { $set: { actionPlan, updatedAt: new Date() } }
    );

    res.json(actionPlan);
  } catch (err) {
    next(err);
  }
});

// PUT /api/assessments/:id/review - Engineer review/override
router.put('/:id/review', async (req, res, next) => {
  try {
    const db = await connectDB();
    let id;
    try {
      id = new ObjectId(req.params.id);
    } catch {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const { overrideClassification, justification, reviewedBy } = req.body;
    const update = {
      updatedAt: new Date(),
      reviewedBy: reviewedBy ? new ObjectId(reviewedBy) : null,
      overrideClassification: overrideClassification ?? null,
      justification: justification ?? null,
      reviewedAt: new Date(),
      status: 'reviewed',
    };

    const result = await db.collection('assessments').findOneAndUpdate(
      { _id: id },
      { $set: update },
      { returnDocument: 'after' }
    );
    if (!result) return res.status(404).json({ error: 'Assessment not found' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PUT /api/assessments/:id - Update assessment
router.put('/:id', async (req, res, next) => {
  try {
    const db = await connectDB();
    let id;
    try {
      id = new ObjectId(req.params.id);
    } catch {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const body = req.body;
    const update = { updatedAt: new Date() };
    const allowed = ['phase', 'structuralData', 'aiResult', 'actionPlan', 'priorityScore', 'status'];
    for (const f of allowed) {
      if (body[f] !== undefined) update[f] = body[f];
    }

    const result = await db.collection('assessments').findOneAndUpdate(
      { _id: id },
      { $set: update },
      { returnDocument: 'after' }
    );
    if (!result) return res.status(404).json({ error: 'Assessment not found' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/assessments/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const db = await connectDB();
    let id;
    try {
      id = new ObjectId(req.params.id);
    } catch {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const result = await db.collection('assessments').deleteOne({ _id: id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Assessment not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
