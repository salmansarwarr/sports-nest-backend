const dns = require('dns');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

dns.setServers(['8.8.8.8', '1.1.1.1']);

const User = require('../src/models/User');
const Venue = require('../src/models/Venue');
const Court = require('../src/models/Court');
const Booking = require('../src/models/Booking');

const OWNER_ID = '6a8a7e2e45ae80d4229e4adb';
const OWNER_EMAIL = 'bcitgeek@gmail.com';

const defaultOperatingHours = [
  { dayOfWeek: 0, openTime: '06:00', closeTime: '23:00', isClosed: false },
  { dayOfWeek: 1, openTime: '06:00', closeTime: '23:00', isClosed: false },
  { dayOfWeek: 2, openTime: '06:00', closeTime: '23:00', isClosed: false },
  { dayOfWeek: 3, openTime: '06:00', closeTime: '23:00', isClosed: false },
  { dayOfWeek: 4, openTime: '06:00', closeTime: '23:00', isClosed: false },
  { dayOfWeek: 5, openTime: '06:00', closeTime: '23:00', isClosed: false },
  { dayOfWeek: 6, openTime: '06:00', closeTime: '23:00', isClosed: false },
];

async function seed() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sportsnest';
    console.log(`Connecting to MongoDB at ${mongoUri}...`);
    await mongoose.connect(mongoUri);
    console.log('MongoDB Connected successfully.');

    // 1. Ensure Owner User Exists
    let owner = await User.findById(OWNER_ID);
    if (!owner) {
      owner = await User.findOne({ email: OWNER_EMAIL });
    }

    if (!owner) {
      console.log(`Creating owner user with ID ${OWNER_ID}...`);
      owner = await User.create({
        _id: OWNER_ID,
        firstName: 'Owais',
        lastName: 'Ansari',
        email: OWNER_EMAIL,
        password: '$2b$12$FG0Bt6aunaTAPWt8WG58o.3/lJ/RCOu6l4.kKwvoOxVlrgD9PDRiy',
        phone: '+923328204381',
        isEmailVerified: true,
        role: 'owner',
        isActive: true,
        provider: 'manual',
      });
      console.log(`Created owner user: ${owner.firstName} ${owner.lastName} (${owner.email})`);
    } else {
      console.log(`Found existing owner: ${owner.firstName} ${owner.lastName} (${owner.email})`);
    }

    // 2. Ensure Venue Exists for Owner
    let venue = await Venue.findOne({ owner: owner._id });
    if (!venue) {
      console.log('Creating flagship venue for owner...');
      venue = await Venue.create({
        name: 'DreamSports Arena Karachi',
        displayName: 'DreamSports Premium Sports Complex',
        description: 'State-of-the-art sports complex featuring professional tennis courts, indoor badminton courts, FIFA-grade futsal arenas, and padel courts.',
        owner: owner._id,
        address: {
          street: 'Main Clifton Block 5',
          city: 'Karachi',
          state: 'Sindh',
          country: 'Pakistan',
          postalCode: '75600',
          landmark: 'Near Bilawal House',
        },
        location: {
          type: 'Point',
          coordinates: [67.0312, 24.8138],
        },
        contact: {
          primaryPhone: '+923328204381',
          email: OWNER_EMAIL,
          website: 'https://dreamsports.pk',
        },
        defaultOperatingHours,
        amenities: {
          totalCourts: 5,
          parking: { available: true, capacity: 50, isFree: true },
          restrooms: true,
          changingRooms: true,
          showers: true,
          lockers: { available: true, count: 40 },
          cafeteria: true,
          proShop: true,
          wifi: { available: true, isFree: true },
          wheelchairAccessible: true,
        },
        media: [
          {
            type: 'image',
            url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80',
            altText: 'DreamSports Main Complex',
            isPrimary: true,
          },
        ],
        status: 'active',
        verification: {
          isVerified: true,
          verifiedAt: new Date(),
          notes: 'Verified by system administrator.',
        },
      });
      console.log(`Created venue: ${venue.name} (#${venue._id})`);
    } else {
      console.log(`Found existing venue: ${venue.name} (#${venue._id})`);
    }

    // 3. Seed Courts for Venue
    const courtsToSeed = [
      {
        name: 'Center Court 1 (Pro Synthetic)',
        courtNumber: 'CT-01',
        description: 'Professional outdoor hard synthetic tennis court with high-lumen floodlights for evening games.',
        venue: venue._id,
        owner: owner._id,
        sportType: 'tennis',
        surfaceType: 'synthetic-grass',
        courtType: 'outdoor',
        baseHourlyRate: 2500,
        currency: 'PKR',
        status: 'active',
      },
      {
        name: 'Grand Court 2 (Clay Spec)',
        courtNumber: 'CT-02',
        description: 'Championship clay surface court with high rebound stability.',
        venue: venue._id,
        owner: owner._id,
        sportType: 'tennis',
        surfaceType: 'clay',
        courtType: 'outdoor',
        baseHourlyRate: 3000,
        currency: 'PKR',
        status: 'active',
      },
      {
        name: 'Badminton Hall A - Wooden Floor',
        courtNumber: 'BD-01',
        description: 'AC indoor wooden floor court with non-marking BWF certified matting.',
        venue: venue._id,
        owner: owner._id,
        sportType: 'badminton',
        surfaceType: 'wooden',
        courtType: 'indoor',
        baseHourlyRate: 1800,
        currency: 'PKR',
        status: 'active',
      },
      {
        name: 'Padel Arena Glass Court 1',
        courtNumber: 'PD-01',
        description: 'Panoramical tempered glass padel court with artificial turf surface.',
        venue: venue._id,
        owner: owner._id,
        sportType: 'pickleball',
        surfaceType: 'synthetic-grass',
        courtType: 'outdoor',
        baseHourlyRate: 3500,
        currency: 'PKR',
        status: 'active',
      },
      {
        name: 'Futsal Turf Pitch 1',
        courtNumber: 'FT-01',
        description: '5-a-side AstroTurf futsal ground with floodlights and spectator seating.',
        venue: venue._id,
        owner: owner._id,
        sportType: 'futsal',
        surfaceType: 'synthetic-grass',
        courtType: 'outdoor',
        baseHourlyRate: 4000,
        currency: 'PKR',
        status: 'active',
      },
    ];

    let createdCourtsCount = 0;
    for (const courtData of courtsToSeed) {
      const existing = await Court.findOne({ venue: venue._id, name: courtData.name });
      if (!existing) {
        await Court.create({
          ...courtData,
          operatingHours: defaultOperatingHours,
        });
        createdCourtsCount++;
        console.log(`Created court: ${courtData.name} (${courtData.sportType.toUpperCase()}) - PKR ${courtData.baseHourlyRate}/hr`);
      } else {
        console.log(`Court already exists: ${courtData.name}`);
      }
    }

    console.log(`\n🎉 Seed Completed Successfully!`);
    console.log(`Owner: ${owner.firstName} ${owner.lastName} (${owner.email})`);
    console.log(`Venue: ${venue.name} (#${venue._id})`);
    console.log(`Courts Processed: ${courtsToSeed.length} (${createdCourtsCount} newly created)`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    process.exit(1);
  }
}

seed();
