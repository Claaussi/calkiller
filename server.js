]const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const CONFIG_FILE = path.join(__dirname, 'config.json');
const BOOKINGS_FILE = path.join(__dirname, 'bookings.json');

const DEFAULT_CONFIG = {
  ownerName: "Your Name",
  ownerEmail: "you@example.com",
  calendarId: "primary",
  meetingDuration: 30,
  bufferTime: 15,
  availability: {
    monday: { start: "09:00", end: "17:00" },
    tuesday: { start: "09:00", end: "17:00" },
    wednesday: { start: "09:00", end: "17:00" },
    thursday: { start: "09:00", end: "17:00" },
    friday: { start: "09:00", end: "17:00" },
    saturday: null,
    sunday: null
  },
  timezone: "Europe/Madrid",
  brandColor: "#4F46E5",
  logoUrl: null,
  meetingTypes: [
    { id: "intro", name: "Intro Call", duration: 30, description: "Quick intro call" },
    { id: "deep-dive", name: "Deep Dive", duration: 60, description: "In-depth session" }
  ],
  smtp: { host: "smtp.gmail.com", port: 587, user: "", pass: "" }
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    }
  } catch (e) {}
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
  return DEFAULT_CONFIG;
}

function loadBookings() {
  try {
    if (fs.existsSync(BOOKINGS_FILE)) return JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf8'));
  } catch (e) {}
  return [];
}

function saveBookings(bookings) {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
}

async function getAvailableSlots(startDate, endDate, duration) {
  const config = loadConfig();
  const bookings = loadBookings();
  const slots = [];
  
  const current = new Date(startDate);
  while (current < endDate) {
    const dayName = current.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const dayAvailability = config.availability[dayName];
    
    if (dayAvailability) {
      const [startHour, startMin] = dayAvailability.start.split(':').map(Number);
      const [endHour, endMin] = dayAvailability.end.split(':').map(Number);
      
      const dayStart = new Date(current);
      dayStart.setHours(startHour, startMin, 0, 0);
      const dayEnd = new Date(current);
      dayEnd.setHours(endHour, endMin, 0, 0);
      
      let slotStart = new Date(dayStart);
      while (slotStart < dayEnd) {
        const slotEnd = new Date(slotStart.getTime() + duration * 60000);
        if (slotEnd <= dayEnd) {
          const isBooked = bookings.some(b => {
            const bs = new Date(b.startTime), be = new Date(b.endTime);
            return slotStart < be && slotEnd > bs;
          });
          if (!isBooked && slotStart > new Date()) {
            slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() });
          }
        }
        slotStart = new Date(slotStart.getTime() + (duration + config.bufferTime) * 60000);
      }
    }
    current.setDate(current.getDate() + 1);
  }
  return slots;
}

app.get('/api/config', (req, res) => {
  const config = loadConfig();
  res.json({
    ownerName: config.ownerName,
    meetingTypes: config.meetingTypes,
    timezone: config.timezone,
    brandColor: config.brandColor
  });
});

app.get('/api/slots', async (req, res) => {
  const { start, end, duration } = req.query;
  const config = loadConfig();
  const startDate = start ? new Date(start) : new Date();
  const endDate = end ? new Date(end) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const slots = await getAvailableSlots(startDate, endDate, parseInt(duration) || config.meetingDuration);
  res.json({ slots, timezone: config.timezone });
});

app.post('/api/book', async (req, res) => {
  const { name, email, startTime, endTime, meetingType, notes } = req.body;
  if (!name || !email || !startTime || !endTime) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const bookings = loadBookings();
  const booking = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    name, email, startTime, endTime, meetingType, notes,
    createdAt: new Date().toISOString()
  };
  bookings.push(booking);
  saveBookings(bookings);
  res.json({ success: true, booking });
});

app.get('/api/bookings', (req, res) => res.json(loadBookings()));

app.delete('/api/bookings/:id', (req, res) => {
  const bookings = loadBookings();
  const index = bookings.findIndex(b => b.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Not found' });
  const cancelled = bookings.splice(index, 1)[0];
  saveBookings(bookings);
  res.json({ success: true, cancelled });
});

const PORT = process.env.PORT || 3457;
app.listen(PORT, () => console.log(`🔪 CalKiller running on http://localhost:${PORT}`));
