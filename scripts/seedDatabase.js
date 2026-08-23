const dns = require('dns');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

dns.setServers(['8.8.8.8', '1.1.1.1']);

const User = require('../src/models/User');
const Venue = require('../src/models/Venue');
const Court = require('../src/models/Court');
const Booking = require('../src/models/Booking');
const Review = require('../src/models/Review');
const SupportTicket = require('../src/models/SupportTicket');
const PromoCode = require('../src/models/PromoCode');
const Faq = require('../src/models/Faq');
const LegalDocument = require('../src/models/LegalDocument');
const AuditLog = require('../src/models/AuditLog');
const WalletTransaction = require('../src/models/WalletTransaction');

const DEFAULT_PASSWORD = 'Password123!';

const UNSPLASH_IMAGES = {
  venues: [
    'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1519766304817-4f37bda74a29?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1526232761682-d26e03ac148e?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1200&q=80',
  ],
  tennis: [
    'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=800&q=80',
  ],
  badminton: [
    'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1521537634581-0dced2efa2a3?auto=format&fit=crop&w=800&q=80',
  ],
  futsal: [
    'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=800&q=80',
  ],
  padel: [
    'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1519766304817-4f37bda74a29?auto=format&fit=crop&w=800&q=80',
  ],
  basketball: [
    'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1505666034604-ab3e07f4be85?auto=format&fit=crop&w=800&q=80',
  ],
};

const defaultOperatingHours = [
  { dayOfWeek: 0, openTime: '06:00', closeTime: '23:30', isClosed: false },
  { dayOfWeek: 1, openTime: '06:00', closeTime: '23:30', isClosed: false },
  { dayOfWeek: 2, openTime: '06:00', closeTime: '23:30', isClosed: false },
  { dayOfWeek: 3, openTime: '06:00', closeTime: '23:30', isClosed: false },
  { dayOfWeek: 4, openTime: '06:00', closeTime: '23:30', isClosed: false },
  { dayOfWeek: 5, openTime: '06:00', closeTime: '23:30', isClosed: false },
  { dayOfWeek: 6, openTime: '06:00', closeTime: '23:30', isClosed: false },
];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomDate(startDaysAgo, endDaysAgo = 0) {
  const now = new Date();
  const start = new Date(now.getTime() - startDaysAgo * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() - endDaysAgo * 24 * 60 * 60 * 1000);
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function seedDatabase() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sportsnest';
    console.log(`\n==================================================`);
    console.log(`🚀 SPORTSNEST SEED ENGINE STARTED`);
    console.log(`Target Database: ${mongoUri}`);
    console.log(`==================================================\n`);

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB.');

    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    // ── 1. SEED ADMIN USERS ──────────────────────────────────────────────────
    console.log('\n👤 Seeding Administrators...');
    const adminDefs = [
      { firstName: 'Salman', lastName: 'Sarwar', email: 'salman@sportsnest.pk', phone: '+923001234567' },
      { firstName: 'Master', lastName: 'Admin', email: 'admin@sportsnest.pk', phone: '+923009876543' },
      { firstName: 'Zain', lastName: 'Ali', email: 'zain@sportsnest.pk', phone: '+923005551234' },
    ];

    const admins = [];
    for (const a of adminDefs) {
      let u = await User.findOne({ email: a.email });
      if (!u) {
        u = await User.create({
          ...a,
          password: hashedPassword,
          role: 'admin',
          isEmailVerified: true,
          isActive: true,
          walletBalance: 5000,
          loyaltyPoints: 1000,
        });
      }
      admins.push(u);
    }
    console.log(`✅ ${admins.length} Administrators ready.`);

    // ── 2. SEED VENUE OWNERS ─────────────────────────────────────────────────
    console.log('\n🏟️ Seeding Venue Owners...');
    const ownerDefs = [
      { _id: '6a8a7e2e45ae80d4229e4adb', firstName: 'Owais', lastName: 'Ansari', email: 'bcitgeek@gmail.com', phone: '+923328204381' },
      { firstName: 'Hamza', lastName: 'Khan', email: 'hamza.owner@sportsnest.pk', phone: '+923218881122' },
      { firstName: 'Usman', lastName: 'Malik', email: 'usman.owner@sportsnest.pk', phone: '+923337772233' },
      { firstName: 'Ayesha', lastName: 'Siddiqui', email: 'ayesha.owner@sportsnest.pk', phone: '+923014443344' },
      { firstName: 'Bilal', lastName: 'Sheikh', email: 'bilal.owner@sportsnest.pk', phone: '+923025554455' },
      { firstName: 'Sana', lastName: 'Ahmed', email: 'sana.owner@sportsnest.pk', phone: '+923036665566' },
      { firstName: 'Ali', lastName: 'Hassan', email: 'ali.owner@sportsnest.pk', phone: '+923047776677' },
      { firstName: 'Hira', lastName: 'Raza', email: 'hira.owner@sportsnest.pk', phone: '+923058887788' },
      { firstName: 'Fatima', lastName: 'Farooq', email: 'fatima.owner@sportsnest.pk', phone: '+923069998899' },
      { firstName: 'Saad', lastName: 'Qureshi', email: 'saad.owner@sportsnest.pk', phone: '+923071112233' },
      { firstName: 'Zohaib', lastName: 'Tariq', email: 'zohaib.owner@sportsnest.pk', phone: '+923082223344' },
      { firstName: 'Mahnoor', lastName: 'Chaudhry', email: 'mahnoor.owner@sportsnest.pk', phone: '+923093334455' },
    ];

    const owners = [];
    for (const o of ownerDefs) {
      let u = await User.findOne({ email: o.email });
      if (!u) {
        u = await User.create({
          ...o,
          password: hashedPassword,
          role: 'owner',
          isEmailVerified: true,
          isActive: true,
          walletBalance: 25000,
          loyaltyPoints: 3500,
        });
      }
      owners.push(u);
    }
    console.log(`✅ ${owners.length} Venue Owners ready.`);

    // ── 3. SEED REGULAR CUSTOMERS ───────────────────────────────────────────
    console.log('\n👨‍👩‍👧‍👦 Seeding Regular Customers...');
    const firstNames = ['Aamir', 'Asad', 'Bilal', 'Danial', 'Fahad', 'Faisal', 'Haris', 'Ibrahim', 'Imran', 'Junaid', 'Kamran', 'Kashif', 'Moiz', 'Nabeel', 'Omer', 'Rehan', 'Rizwan', 'Shahzaib', 'Taha', 'Tariq', 'Umair', 'Waqas', 'Yasir', 'Zubair', 'Anum', 'Bushra', 'Daniya', 'Eman', 'Hania', 'Iqra', 'Javeria', 'Kiran', 'Laiba', 'Maham', 'Nida', 'Rabia', 'Sahar', 'Tooba', 'Yumna', 'Zainab'];
    const lastNames = ['Ahmed', 'Akram', 'Ali', 'Baig', 'Bhatti', 'Chaudhry', 'Dar', 'Farooqi', 'Hashmi', 'Iqbal', 'Javed', 'Khan', 'Lodi', 'Malik', 'Mirza', 'Niazi', 'Qureshi', 'Raza', 'Siddiqui', 'Tariq', 'Usmani', 'Zubairi'];

    const customerCount = 50;
    const customers = [];
    for (let i = 1; i <= customerCount; i++) {
      const fname = firstNames[(i - 1) % firstNames.length];
      const lname = lastNames[(i - 1) % lastNames.length];
      const email = `user${i}.${fname.toLowerCase()}@example.com`;

      let u = await User.findOne({ email });
      if (!u) {
        u = await User.create({
          firstName: fname,
          lastName: lname,
          email,
          phone: `+923${getRandomInt(0, 4)}${getRandomInt(1000000, 9999999)}`,
          password: hashedPassword,
          role: 'user',
          isEmailVerified: true,
          isActive: true,
          walletBalance: getRandomInt(500, 12000),
          loyaltyPoints: getRandomInt(100, 1500),
          createdAt: getRandomDate(120, 10),
        });
      }
      customers.push(u);
    }
    console.log(`✅ ${customers.length} Regular Customers ready.`);

    // ── 4. SEED VENUES ───────────────────────────────────────────────────────
    console.log('\n🏢 Seeding Sports Venues...');
    const venueDefs = [
      {
        name: 'DreamSports Arena Clifton',
        city: 'Karachi',
        street: 'Main Clifton Block 5',
        state: 'Sindh',
        landmark: 'Near Bilawal House',
        coords: [67.0312, 24.8138],
        ownerIndex: 0,
        description: 'Premier sports hub with international standard tennis hard courts, BWF certified badminton, and panoramical padel arenas.',
      },
      {
        name: 'DHA Athletic Hub Phase 6',
        city: 'Karachi',
        street: 'Khayaban-e-Seher, Phase 6',
        state: 'Sindh',
        landmark: 'Opposite Rahat Park',
        coords: [67.0623, 24.7915],
        ownerIndex: 1,
        description: 'State of the art multisport facility equipped with FIFA AstroTurf pitches, lighted tennis courts, and pro shop.',
      },
      {
        name: 'Gulshan Champions Pavilion',
        city: 'Karachi',
        street: 'Block 13-D, Gulshan-e-Iqbal',
        state: 'Sindh',
        landmark: 'Near Hassan Square',
        coords: [67.0855, 24.9122],
        ownerIndex: 2,
        description: 'Karachi Central leading indoor and outdoor sports complex with AC badminton courts and floodlit box cricket turf.',
      },
      {
        name: 'PECHS Racquet & Sports Club',
        city: 'Karachi',
        street: 'Tariq Road Block 2',
        state: 'Sindh',
        landmark: 'Near Rabi Center',
        coords: [67.0599, 24.8711],
        ownerIndex: 3,
        description: 'Exclusive racquet club offering clay court tennis, glass wall squash courts, and indoor table tennis suites.',
      },
      {
        name: 'Korangi Sports Complex',
        city: 'Karachi',
        street: 'Sector 15, Korangi Industrial Area',
        state: 'Sindh',
        landmark: 'Near Vita Chowrangi',
        coords: [67.1233, 24.8310],
        ownerIndex: 4,
        description: 'Spacious industrial sports arena featuring 7-a-side futsal grounds, volleyball courts, and executive locker rooms.',
      },
      {
        name: 'North Nazimabad Athletic Pavilion',
        city: 'Karachi',
        street: 'Block H, North Nazimabad',
        state: 'Sindh',
        landmark: 'Near Hydri Supermarket',
        coords: [67.0388, 24.9355],
        ownerIndex: 5,
        description: 'Family friendly sports hub featuring indoor basketball, BWF badminton mats, and cafe facilities.',
      },
      {
        name: 'Bahria Town Sports Arena',
        city: 'Karachi',
        street: 'Precinct 1, Bahria Town',
        state: 'Sindh',
        landmark: 'Near Main Super Highway Entrance',
        coords: [67.3112, 25.0118],
        ownerIndex: 6,
        description: 'Luxury sports village featuring Olympic specification tennis courts, padel turf, and grandstand seating.',
      },
      {
        name: 'Seaview Padel & Tennis Club',
        city: 'Karachi',
        street: 'Abdul Sattar Edhi Avenue, DHA Phase 8',
        state: 'Sindh',
        landmark: 'Facing Arabian Sea',
        coords: [67.0688, 24.7688],
        ownerIndex: 7,
        description: 'Oceanfront padel and tennis club with sea breeze ambient lighting and executive lounge.',
      },
      {
        name: 'Johar Arena Sports Center',
        city: 'Karachi',
        street: 'Block 1, Gulistan-e-Johar',
        state: 'Sindh',
        landmark: 'Near Continental Bakery',
        coords: [67.1355, 24.9188],
        ownerIndex: 8,
        description: 'Popular community ground featuring box cricket, futsal pitches, and nighttime lighting.',
      },
      {
        name: 'Malir Cantt Sports Club',
        city: 'Karachi',
        street: 'Check Post 5 Road, Malir Cantt',
        state: 'Sindh',
        landmark: 'Near Cantt Bazar',
        coords: [67.1988, 24.9011],
        ownerIndex: 9,
        description: 'Secure sports complex featuring lush clay tennis courts, indoor squash, and swimming access.',
      },
    ];

    const venues = [];
    for (let i = 0; i < venueDefs.length; i++) {
      const vdef = venueDefs[i];
      const ownerDoc = owners[vdef.ownerIndex % owners.length];

      let v = await Venue.findOne({ name: vdef.name });
      if (!v) {
        v = await Venue.create({
          name: vdef.name,
          displayName: vdef.name,
          description: vdef.description,
          owner: ownerDoc._id,
          address: {
            street: vdef.street,
            city: vdef.city,
            state: vdef.state,
            country: 'Pakistan',
            postalCode: '75000',
            landmark: vdef.landmark,
          },
          location: {
            type: 'Point',
            coordinates: vdef.coords,
          },
          contact: {
            primaryPhone: ownerDoc.phone,
            email: ownerDoc.email,
            website: 'https://sportsnest.pk',
          },
          defaultOperatingHours,
          amenities: {
            totalCourts: 4,
            parking: { available: true, capacity: 40, isFree: true },
            restrooms: true,
            changingRooms: true,
            showers: true,
            lockers: { available: true, count: 30 },
            cafeteria: true,
            proShop: true,
            wifi: { available: true, isFree: true },
            wheelchairAccessible: true,
          },
          media: [
            {
              type: 'image',
              url: UNSPLASH_IMAGES.venues[i % UNSPLASH_IMAGES.venues.length],
              altText: vdef.name,
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
      }
      venues.push(v);
    }
    console.log(`✅ ${venues.length} Sports Venues ready.`);

    // ── 5. SEED COURTS ───────────────────────────────────────────────────────
    console.log('\n🎾 Seeding Playing Courts...');
    const courtTemplates = [
      { name: 'Center Court 1 (Synthetic Spec)', sportType: 'tennis', surfaceType: 'synthetic-grass', courtType: 'outdoor', baseHourlyRate: 2500, img: UNSPLASH_IMAGES.tennis[0] },
      { name: 'Court 2 (Championship Clay)', sportType: 'tennis', surfaceType: 'clay', courtType: 'outdoor', baseHourlyRate: 3000, img: UNSPLASH_IMAGES.tennis[1] },
      { name: 'Badminton Hall A - Mat 1', sportType: 'badminton', surfaceType: 'wooden', courtType: 'indoor', baseHourlyRate: 1800, img: UNSPLASH_IMAGES.badminton[0] },
      { name: 'Badminton Hall B - Mat 2', sportType: 'badminton', surfaceType: 'acrylic', courtType: 'indoor', baseHourlyRate: 2000, img: UNSPLASH_IMAGES.badminton[1] },
      { name: 'Futsal AstroTurf Pitch 1', sportType: 'futsal', surfaceType: 'synthetic-grass', courtType: 'outdoor', baseHourlyRate: 4000, img: UNSPLASH_IMAGES.futsal[0] },
      { name: 'Padel Glass Arena 1', sportType: 'pickleball', surfaceType: 'synthetic-grass', courtType: 'outdoor', baseHourlyRate: 3500, img: UNSPLASH_IMAGES.padel[0] },
      { name: 'Basketball Wooden Floor', sportType: 'basketball', surfaceType: 'wooden', courtType: 'indoor', baseHourlyRate: 3200, img: UNSPLASH_IMAGES.basketball[0] },
      { name: 'Box Cricket Astro Ground', sportType: 'other', surfaceType: 'synthetic-grass', courtType: 'outdoor', baseHourlyRate: 2800, img: UNSPLASH_IMAGES.futsal[1] },
    ];

    const courts = [];
    for (const v of venues) {
      // Create 4 courts per venue
      for (let cidx = 0; cidx < 4; cidx++) {
        const template = courtTemplates[(venues.indexOf(v) * 2 + cidx) % courtTemplates.length];
        const courtName = `${v.name.split(' ')[0]} - ${template.name}`;

        let courtDoc = await Court.findOne({ venue: v._id, name: courtName });
        if (!courtDoc) {
          courtDoc = await Court.create({
            name: courtName,
            courtNumber: `CT-0${cidx + 1}`,
            description: `Professional spec ${template.sportType.toUpperCase()} court with floodlights and spectator seating.`,
            venue: v._id,
            owner: v.owner,
            sportType: template.sportType,
            surfaceType: template.surfaceType,
            courtType: template.courtType,
            baseHourlyRate: template.baseHourlyRate,
            currency: 'PKR',
            status: 'active',
            operatingHours: defaultOperatingHours,
            media: [
              {
                type: 'image',
                url: template.img,
                altText: courtName,
              },
            ],
          });
        }
        courts.push(courtDoc);
      }
    }
    console.log(`✅ ${courts.length} Playing Courts ready.`);

    // ── 6. SEED BOOKINGS (Past, Today, Upcoming) ────────────────────────────
    console.log('\n📅 Seeding Bookings & Transactions (spanning past 90 days)...');
    const existingBookingsCount = await Booking.countDocuments();
    const targetBookingsCount = 300;

    const bookingsToCreate = Math.max(targetBookingsCount - existingBookingsCount, 50);
    const createdBookings = [];

    const statuses = ['completed', 'completed', 'completed', 'confirmed', 'confirmed', 'pending-confirmation', 'cancelled'];

    for (let i = 0; i < bookingsToCreate; i++) {
      const customer = getRandomItem(customers);
      const court = getRandomItem(courts);
      const venue = venues.find(v => v._id.toString() === court.venue.toString()) || venues[0];

      // Random date between 90 days ago and 15 days in future
      const isPast = Math.random() < 0.8;
      const bookingDate = isPast ? getRandomDate(90, 1) : getRandomDate(0, -15);

      const hour = getRandomInt(8, 21);
      const startTime = new Date(bookingDate);
      startTime.setHours(hour, 0, 0, 0);

      const duration = getRandomItem([60, 90, 120]);
      const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

      let status = isPast ? (Math.random() < 0.9 ? 'completed' : 'cancelled') : getRandomItem(['confirmed', 'pending-confirmation']);

      const basePrice = (court.baseHourlyRate * duration) / 60;
      const serviceFee = 150;
      const totalPrice = basePrice + serviceFee;

      const booking = await Booking.create({
        user: customer._id,
        court: court._id,
        venue: venue._id,
        startTime,
        endTime,
        duration,
        status,
        pricing: {
          basePrice,
          subtotal: basePrice,
          serviceFee,
          totalAmount: totalPrice,
          currency: 'PKR',
        },
        payment: {
          amount: totalPrice,
          currency: 'PKR',
          status: status === 'completed' || status === 'confirmed' ? 'completed' : status === 'cancelled' ? 'refunded' : 'pending',
          method: getRandomItem(['card', 'wallet', 'cash', 'online']),
          paidAt: startTime,
        },
        createdAt: new Date(startTime.getTime() - getRandomInt(1, 5) * 24 * 60 * 60 * 1000),
      });

      createdBookings.push(booking);

      // Also create WalletTransaction if paid by wallet
      if (booking.payment?.method === 'wallet' && booking.payment?.status === 'completed') {
        await WalletTransaction.create({
          user: customer._id,
          type: 'debit',
          amount: totalPrice,
          balanceAfter: customer.walletBalance,
          source: 'booking_payment',
          description: `Booking #${booking._id.toString().slice(-6)} at ${venue.name}`,
          booking: booking._id,
          createdAt: booking.createdAt,
        });
      }
    }
    console.log(`✅ ${createdBookings.length} Bookings created successfully.`);

    // ── 7. SEED REVIEWS ──────────────────────────────────────────────────────
    console.log('\n⭐ Seeding Customer Reviews...');
    const completedBookings = await Booking.find({ status: 'completed' }).limit(150);

    const reviewComments = [
      'Excellent court condition and top notch floodlighting. Will definitely book again!',
      'Great surface rebound! Clean changing rooms and helpful staff.',
      'Super easy check-in process. The turf quality was fantastic for futsal.',
      'Very well maintained courts with clear lines. Parking was ample and free.',
      'Awesome experience! Lighting for night games is high quality and no glare.',
      'Decent court, clean facilities, but parking got crowded during peak hours.',
      'High quality net and poles. Really enjoyed our weekend tennis match.',
      'Air conditioning in the badminton hall was working perfectly. Very comfortable.',
      'Loved the padel court! Tempered glass rebound is accurate and synthetic grass feels premium.',
      'Prompt staff service and good refreshments at the court cafe.',
    ];

    let reviewCount = 0;
    for (const b of completedBookings) {
      const existing = await Review.findOne({ booking: b._id });
      if (!existing) {
        const rating = getRandomItem([5, 5, 5, 4, 4, 4, 3, 2]);
        const comment = getRandomItem(reviewComments);

        await Review.create({
          user: b.user,
          court: b.court,
          venue: b.venue,
          booking: b._id,
          rating,
          comment,
          status: 'approved',
          createdAt: new Date(b.endTime.getTime() + getRandomInt(1, 24) * 3600 * 1000),
        });
        reviewCount++;
      }
    }
    console.log(`✅ ${reviewCount} Reviews created.`);

    // ── 8. SEED SUPPORT TICKETS ──────────────────────────────────────────────
    console.log('\n🎫 Seeding Support Tickets...');
    const ticketCategories = ['booking-issue', 'payment-issue', 'refund-dispute', 'account', 'technical'];
    const ticketSubjects = [
      'Refund requested for cancelled session',
      'Double charged for booking #39021',
      'Need to reschedule court time slot',
      'Promo code PLAYMORE not applying discount',
      'Floodlight issue during night session',
      'Wallet top up deduction failure',
      'Updating venue owner primary contact phone',
      'Inquiry regarding monthly membership discounts',
    ];

    let ticketCount = 0;
    for (let i = 0; i < 30; i++) {
      const customer = getRandomItem(customers);
      const subject = getRandomItem(ticketSubjects);

      const ticket = await SupportTicket.create({
        user: customer._id,
        subject: `${subject} (${i + 1})`,
        category: getRandomItem(ticketCategories),
        description: `Customer ${customer.firstName} submitted an inquiry regarding: ${subject}. Please review and update.`,
        priority: getRandomItem(['low', 'medium', 'high', 'urgent']),
        status: getRandomItem(['open', 'in-progress', 'resolved', 'closed']),
        messages: [
          {
            sender: customer._id,
            senderRole: 'user',
            message: `Hello support, I need assistance with ${subject.toLowerCase()}. Thank you!`,
            createdAt: getRandomDate(30, 2),
          },
          {
            sender: admins[0]._id,
            senderRole: 'admin',
            message: `Hi ${customer.firstName}, our team has received your ticket and is investigating the issue.`,
            createdAt: getRandomDate(1, 0),
          },
        ],
        createdAt: getRandomDate(45, 1),
      });
      ticketCount++;
    }
    console.log(`✅ ${ticketCount} Support Tickets created.`);

    // ── 9. SEED PROMO CODES ──────────────────────────────────────────────────
    console.log('\n🏷️ Seeding Promo Codes...');
    const promoDefs = [
      { code: 'PLAYMORE', description: '20% discount on all bookings', discountType: 'percentage', discountValue: 20, maxDiscountAmount: 1000, minBookingAmount: 1500, isActive: true },
      { code: 'WEEKEND10', description: '10% discount on weekend courts', discountType: 'percentage', discountValue: 10, maxDiscountAmount: 500, minBookingAmount: 1000, isActive: true },
      { code: 'FIRSTGAME', description: 'Flat PKR 500 off on first booking', discountType: 'fixed', discountValue: 500, minBookingAmount: 2000, isActive: true },
      { code: 'SPORTS15', description: '15% discount for verified players', discountType: 'percentage', discountValue: 15, maxDiscountAmount: 800, minBookingAmount: 1200, isActive: true },
      { code: 'PADELMANIA', description: '25% discount on padel glass courts', discountType: 'percentage', discountValue: 25, maxDiscountAmount: 1200, minBookingAmount: 2500, isActive: true },
      { code: 'SUMMER2026', description: 'Seasonal summer 15% discount', discountType: 'percentage', discountValue: 15, maxDiscountAmount: 600, minBookingAmount: 1000, isActive: false },
      { code: 'WELCOME100', description: 'PKR 100 welcome bonus discount', discountType: 'fixed', discountValue: 100, minBookingAmount: 500, isActive: true },
    ];

    let promoCount = 0;
    for (const p of promoDefs) {
      let pc = await PromoCode.findOne({ code: p.code });
      if (!pc) {
        await PromoCode.create({
          ...p,
          validFrom: new Date(Date.now() - 30 * 24 * 3600 * 1000),
          validUntil: new Date(Date.now() + 90 * 24 * 3600 * 1000),
          usageLimit: 500,
          usedCount: getRandomInt(10, 80),
          createdBy: admins[0]._id,
        });
        promoCount++;
      }
    }
    console.log(`✅ ${promoCount} Promo Codes ready.`);

    // ── 10. SEED FAQS ────────────────────────────────────────────────────────
    console.log('\n❓ Seeding FAQs...');
    const faqDefs = [
      { question: 'How do I book a court on SportsNest?', answer: 'Search for your desired sport, select a venue and court, choose an available date and time slot, and complete the checkout using card, online banking, or wallet balance.', category: 'booking', order: 1 },
      { question: 'What is the cancellation and refund policy?', answer: 'Bookings cancelled at least 12 hours prior to start time receive a full 100% wallet refund. Cancellations made within 12 hours are subject to venue policy.', category: 'booking', order: 2 },
      { question: 'What payment methods are supported?', answer: 'We accept Credit/Debit cards (Visa, Mastercard), Easypaisa, JazzCash, direct bank transfers, and instant SportsNest Wallet payments.', category: 'payment', order: 3 },
      { question: 'How do I register my sports venue on SportsNest?', answer: 'Venue owners can register by clicking "Partner With Us" or contacting our venue onboarding team. Once verified by admins, you get access to the full Owner Portal.', category: 'venue-owner', order: 4 },
      { question: 'How do promo codes work?', answer: 'Enter your valid promo code on the booking review step before payment. The discount will automatically apply to your total amount.', category: 'general', order: 5 },
      { question: 'Can I reschedule an existing booking slot?', answer: 'Yes! Navigate to My Bookings, select the active booking, and click "Reschedule" to pick a new open time slot on the same court.', category: 'booking', order: 6 },
    ];

    let faqCount = 0;
    for (const f of faqDefs) {
      let faq = await Faq.findOne({ question: f.question });
      if (!faq) {
        await Faq.create({ ...f, createdBy: admins[0]._id });
        faqCount++;
      }
    }
    console.log(`✅ ${faqCount} FAQs ready.`);

    // ── 11. SEED LEGAL DOCUMENTS ──────────────────────────────────────────────
    console.log('\n📜 Seeding Legal Documents...');
    const legalDefs = [
      {
        type: 'terms-of-service',
        version: '1.0',
        content: '# SportsNest Terms of Service\n\nWelcome to SportsNest. By accessing or using our platform, you agree to comply with all terms and conditions set forth herein.',
        isActive: true,
        publishedBy: admins[0]._id,
      },
      {
        type: 'privacy-policy',
        version: '1.0',
        content: '# SportsNest Privacy Policy\n\nYour privacy is important to us. This policy outlines how we collect, store, and safeguard your personal information.',
        isActive: true,
        publishedBy: admins[0]._id,
      },
    ];

    for (const l of legalDefs) {
      let doc = await LegalDocument.findOne({ type: l.type, version: l.version });
      if (!doc) {
        await LegalDocument.create(l);
      }
    }
    console.log('✅ Legal Documents ready.');

    // ── 12. SEED AUDIT LOGS ─────────────────────────────────────────────────
    console.log('\n🔍 Seeding System Audit Logs...');
    const auditActions = [
      { action: 'USER_REGISTERED', resourceType: 'User' },
      { action: 'VENUE_CREATED', resourceType: 'Venue' },
      { action: 'COURT_UPDATED', resourceType: 'Venue' },
      { action: 'BOOKING_CONFIRMED', resourceType: 'Booking' },
      { action: 'PROMO_CODE_CREATED', resourceType: 'PromoCode' },
      { action: 'REVIEW_APPROVED', resourceType: 'Review' },
    ];

    let auditCount = 0;
    for (let i = 0; i < 50; i++) {
      const act = getRandomItem(auditActions);
      const actor = getRandomItem([...admins, ...owners]);
      const resId = act.resourceType === 'User' ? customers[0]._id : venues[0]._id;

      await AuditLog.create({
        actor: actor._id,
        action: act.action,
        resourceType: act.resourceType,
        resourceId: resId,
        reason: `System automated activity log entry #${i + 1}`,
        ip: `192.168.1.${getRandomInt(10, 250)}`,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        createdAt: getRandomDate(60, 1),
      });
      auditCount++;
    }
    console.log(`✅ ${auditCount} Audit Logs created.`);

    console.log(`\n==================================================`);
    console.log(`🎉 DATABASE SEEDING COMPLETED SUCCESSFULLY!`);
    console.log(`==================================================`);
    console.log(`• Admins: ${admins.length}`);
    console.log(`• Venue Owners: ${owners.length}`);
    console.log(`• Customers: ${customers.length}`);
    console.log(`• Venues: ${venues.length}`);
    console.log(`• Courts: ${courts.length}`);
    console.log(`• Total Bookings Processed: ${await Booking.countDocuments()}`);
    console.log(`• Reviews: ${await Review.countDocuments()}`);
    console.log(`• Support Tickets: ${await SupportTicket.countDocuments()}`);
    console.log(`• Promo Codes: ${await PromoCode.countDocuments()}`);
    console.log(`• Audit Logs: ${await AuditLog.countDocuments()}`);
    console.log(`==================================================\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error during database seeding:', error);
    process.exit(1);
  }
}

seedDatabase();
