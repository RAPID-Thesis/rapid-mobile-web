const express = require('express');
const { ObjectId } = require('mongodb');
const { connectDB } = require('../../lib/mongodb');

const router = express.Router();

// GET /api/users - List users
router.get('/', async (req, res, next) => {
  try {
    const db = await connectDB();
    const users = await db
      .collection('users')
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    // Don't expose password hashes
    const safe = users.map((u) => {
      const { passwordHash, ...rest } = u;
      return { ...rest, id: u._id.toString() };
    });

    res.json(safe);
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:id - Get user by ID
router.get('/:id', async (req, res, next) => {
  try {
    const db = await connectDB();
    let id;
    try {
      id = new ObjectId(req.params.id);
    } catch {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const user = await db.collection('users').findOne({ _id: id });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { passwordHash, ...safe } = user;
    res.json({ ...safe, id: user._id.toString() });
  } catch (err) {
    next(err);
  }
});

// POST /api/users - Create user (no auth for MVP)
router.post('/', async (req, res, next) => {
  try {
    const db = await connectDB();
    const body = req.body;
    const now = new Date();

    const doc = {
      email: body.email,
      passwordHash: body.passwordHash || '(placeholder - use Supabase Auth)',
      fullName: body.fullName || body.full_name,
      role: body.role || 'inspector',
      lguCode: body.lguCode || body.lgu_code || '',
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('users').insertOne(doc);
    const inserted = await db.collection('users').findOne({ _id: result.insertedId });
    const { passwordHash, ...safe } = inserted;
    res.status(201).json({ ...safe, id: inserted._id.toString() });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/:id - Update user
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
    const allowed = ['fullName', 'role', 'lguCode'];
    for (const f of allowed) {
      if (body[f] !== undefined) update[f] = body[f];
    }

    const result = await db.collection('users').findOneAndUpdate(
      { _id: id },
      { $set: update },
      { returnDocument: 'after' }
    );
    if (!result) return res.status(404).json({ error: 'User not found' });

    const { passwordHash, ...safe } = result;
    res.json({ ...safe, id: result._id.toString() });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const db = await connectDB();
    let id;
    try {
      id = new ObjectId(req.params.id);
    } catch {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const result = await db.collection('users').deleteOne({ _id: id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'User not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
