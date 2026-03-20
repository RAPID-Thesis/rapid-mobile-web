const express = require('express');
const { ObjectId } = require('mongodb');
const { connectDB } = require('../../lib/mongodb');

const router = express.Router();

// GET /api/buildings - List buildings (filterable)
router.get('/', async (req, res, next) => {
  try {
    const db = await connectDB();
    const { barangay, municipality } = req.query;
    const filter = {};
    if (barangay) filter.barangay = barangay;
    if (municipality) filter.municipality = municipality;

    const buildings = await db
      .collection('buildings')
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    res.json(buildings);
  } catch (err) {
    next(err);
  }
});

// GET /api/buildings/geojson - GeoJSON FeatureCollection
router.get('/geojson', async (req, res, next) => {
  try {
    const db = await connectDB();
    const buildings = await db.collection('buildings').find({}).toArray();

    const features = buildings.map((b) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: b.location?.coordinates || [0, 0],
      },
      properties: {
        id: b._id.toString(),
        buildingCode: b.buildingCode,
        address: b.address,
        barangay: b.barangay,
        municipality: b.municipality,
        buildingUse: b.buildingUse,
        numberOfStories: b.numberOfStories,
        yearBuilt: b.yearBuilt,
      },
    }));

    res.json({ type: 'FeatureCollection', features });
  } catch (err) {
    next(err);
  }
});

// GET /api/buildings/:id - Get building by ID
router.get('/:id', async (req, res, next) => {
  try {
    const db = await connectDB();
    let id;
    try {
      id = new ObjectId(req.params.id);
    } catch {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const building = await db.collection('buildings').findOne({ _id: id });
    if (!building) return res.status(404).json({ error: 'Building not found' });
    res.json(building);
  } catch (err) {
    next(err);
  }
});

// POST /api/buildings - Create building
router.post('/', async (req, res, next) => {
  try {
    const db = await connectDB();
    const body = req.body;
    const now = new Date();

    const doc = {
      buildingCode: body.buildingCode || body.building_code,
      address: body.address,
      barangay: body.barangay,
      municipality: body.municipality,
      location: {
        type: 'Point',
        coordinates: [
          body.longitude ?? body.location?.coordinates?.[0] ?? 0,
          body.latitude ?? body.location?.coordinates?.[1] ?? 0,
        ],
      },
      buildingUse: body.buildingUse || body.building_use || 'residential',
      numberOfStories: body.numberOfStories ?? body.number_of_stories ?? 1,
      yearBuilt: body.yearBuilt ?? body.year_built,
      structuralSystem: body.structuralSystem ?? body.structural_system,
      foundationType: body.foundationType ?? body.foundation_type,
      soilClassification: body.soilClassification ?? body.soil_classification,
      distanceToFaultKm: body.distanceToFaultKm ?? body.distance_to_fault_km,
      previousRetrofit: body.previousRetrofit ?? body.previous_retrofit ?? false,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('buildings').insertOne(doc);
    const inserted = await db.collection('buildings').findOne({ _id: result.insertedId });
    res.status(201).json(inserted);
  } catch (err) {
    next(err);
  }
});

// PUT /api/buildings/:id - Update building
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

    const fields = [
      'buildingCode', 'address', 'barangay', 'municipality',
      'buildingUse', 'numberOfStories', 'yearBuilt',
      'structuralSystem', 'foundationType', 'soilClassification',
      'distanceToFaultKm', 'previousRetrofit',
    ];
    for (const f of fields) {
      if (body[f] !== undefined) update[f] = body[f];
    }
    if (body.longitude !== undefined || body.latitude !== undefined) {
      update.location = {
        type: 'Point',
        coordinates: [
          body.longitude ?? body.location?.coordinates?.[0] ?? 0,
          body.latitude ?? body.location?.coordinates?.[1] ?? 0,
        ],
      };
    }

    const result = await db.collection('buildings').findOneAndUpdate(
      { _id: id },
      { $set: update },
      { returnDocument: 'after' }
    );
    if (!result) return res.status(404).json({ error: 'Building not found' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/buildings/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const db = await connectDB();
    let id;
    try {
      id = new ObjectId(req.params.id);
    } catch {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const result = await db.collection('buildings').deleteOne({ _id: id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Building not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
