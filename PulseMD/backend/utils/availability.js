const VALID_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function normalizeTime(value = '') {
  const text = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(text)) return null;
  const [hour, minute] = text.split(':').map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function toMinutes(value) {
  const normalized = normalizeTime(value);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(':').map(Number);
  return hour * 60 + minute;
}

function getIstParts(date) {
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Kolkata' }).format(date);
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata'
  }).format(date);
  return { day, minuteOfDay: toMinutes(time) };
}

function normalizeSchedule(schedule = {}) {
  const days = (Array.isArray(schedule.days) ? schedule.days : [])
    .map((day) => String(day || '').slice(0, 3))
    .filter((day, index, arr) => VALID_DAYS.includes(day) && arr.indexOf(day) === index);

  const slots = (Array.isArray(schedule.slots) ? schedule.slots : [])
    .map((slot) => {
      const startTime = normalizeTime(slot?.startTime);
      const endTime = normalizeTime(slot?.endTime);
      const startMinutes = toMinutes(startTime);
      const endMinutes = toMinutes(endTime);
      if (!startTime || !endTime || startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
        return null;
      }
      return { startTime, endTime, startMinutes, endMinutes };
    })
    .filter(Boolean)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  return {
    timezone: schedule.timezone || 'Asia/Kolkata',
    days: days.length ? days : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    slots: slots.length
      ? slots
      : [
          { startTime: '10:00', endTime: '13:00', startMinutes: 600, endMinutes: 780 },
          { startTime: '17:00', endTime: '20:00', startMinutes: 1020, endMinutes: 1200 }
        ]
  };
}

function isWithinSchedule(date, schedule) {
  const normalized = normalizeSchedule(schedule);
  const { day, minuteOfDay } = getIstParts(date);
  if (!normalized.days.includes(day)) return false;
  return normalized.slots.some((slot) => minuteOfDay >= slot.startMinutes && minuteOfDay <= slot.endMinutes);
}

function findNextAvailableFrom(schedule, fromDate = new Date()) {
  const normalized = normalizeSchedule(schedule);
  const start = new Date(fromDate);

  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);

    const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Kolkata' }).format(date);
    if (!normalized.days.includes(day)) continue;

    for (const slot of normalized.slots) {
      const candidate = new Date(date);
      const [hour, minute] = slot.startTime.split(':').map(Number);

      const ist = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
        .format(candidate)
        .split('/');

      const iso = `${ist[2]}-${ist[1]}-${ist[0]}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:30`;
      const candidateDate = new Date(iso);
      if (candidateDate > fromDate) return candidateDate;
    }
  }

  return null;
}

function getAvailabilityState(profile, now = new Date()) {
  if (profile?.availabilityStatus === 'offline') {
    return {
      code: 'offline',
      label: 'Offline',
      availableNow: false,
      nextAvailableAt: null
    };
  }

  const schedule = normalizeSchedule(profile?.availabilitySchedule || {});

  if (isWithinSchedule(now, schedule)) {
    return {
      code: 'available_now',
      label: 'Available Now',
      availableNow: true,
      nextAvailableAt: null
    };
  }

  const nextAvailableAt = findNextAvailableFrom(schedule, now);
  if (!nextAvailableAt) {
    return {
      code: 'offline',
      label: 'Offline',
      availableNow: false,
      nextAvailableAt: null
    };
  }

  return {
    code: 'next_available',
    label: `Next Available at ${nextAvailableAt.toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata'
    })}`,
    availableNow: false,
    nextAvailableAt
  };
}

module.exports = {
  VALID_DAYS,
  normalizeSchedule,
  isWithinSchedule,
  getAvailabilityState
};
