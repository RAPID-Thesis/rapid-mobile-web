/**
 * Seed MongoDB with collections, indexes, and sample data for RAPID.
 * Run: npm run db:seed
 */
require('dotenv').config();
const { ObjectId } = require('mongodb');
const { connectDB } = require('../lib/mongodb');

async function seed() {
  const db = await connectDB();

  // --- Create indexes ---
  console.log('Creating indexes...');

  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('users').createIndex({ createdAt: -1 });

  await db.collection('buildings').createIndex(
    { location: '2dsphere' },
    { name: 'location_2dsphere' }
  );
  await db.collection('buildings').createIndex({ buildingCode: 1 }, { unique: true });
  await db.collection('buildings').createIndex({ barangay: 1, municipality: 1 });

  await db.collection('assessments').createIndex({ buildingId: 1 });
  await db.collection('assessments').createIndex({ phase: 1 });
  await db.collection('assessments').createIndex({ status: 1 });
  await db.collection('assessments').createIndex({ priorityScore: -1 });
  await db.collection('assessments').createIndex({ inspectorId: 1 });

  console.log('Indexes created.');

  // --- Sample data (optional - skip if collections already have data) ---
  const usersCount = await db.collection('users').countDocuments();
  if (usersCount === 0) {
    console.log('Seeding sample data...');
    const now = new Date();

    const sampleUser = {
      _id: new ObjectId(),
      email: 'admin@rapid.local',
      passwordHash: '(use Supabase Auth in production)',
      fullName: 'Admin User',
      role: 'admin',
      lguCode: 'PH-01',
      createdAt: now,
      updatedAt: now,
    };
    await db.collection('users').insertOne(sampleUser);

    const sampleBuilding = {
      _id: new ObjectId(),
      buildingCode: 'BLD-001',
      address: '123 Sample St, Barangay Example',
      barangay: 'Example',
      municipality: 'Sample City',
      location: {
        type: 'Point',
        coordinates: [121.0, 14.6], // Manila area
      },
      buildingUse: 'residential',
      numberOfStories: 2,
      yearBuilt: 2010,
      structuralSystem: 'concrete',
      foundationType: 'spread footing',
      soilClassification: 'C',
      distanceToFaultKm: 15,
      previousRetrofit: false,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection('buildings').insertOne(sampleBuilding);

    const sampleAssessment = {
      _id: new ObjectId(),
      buildingId: sampleBuilding._id,
      inspectorId: sampleUser._id,
      phase: 'pre-earthquake',
      images: [],
      structuralData: {
        material: 'reinforced concrete',
        condition: 'fair',
        irregularities: [],
        occupancyAtTime: 5,
      },
      aiResult: null,
      actionPlan: null,
      engineerReview: null,
      priorityScore: 0,
      status: 'pending-review',
      createdAt: now,
      updatedAt: now,
    };
    await db.collection('assessments').insertOne(sampleAssessment);

    console.log('Sample data added: 1 user, 1 building, 1 assessment');
  } else {
    console.log('Collections already have data, skipping sample insert.');
  }

  console.log('Done!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
