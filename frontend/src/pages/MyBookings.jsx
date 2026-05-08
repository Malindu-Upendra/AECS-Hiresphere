import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { bookingApi, sessionApi, packageApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { format, eachDayOfInterval, isBefore, startOfDay } from 'date-fns';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

function canJoin(booking) {
  if (booking.status !== 'confirmed') return false;
  if (booking.sessionEnabled) return true;
  if (!booking.startTime || !booking.endTime) return false;
  const now = new Date();
  const start = new Date(booking.startTime);
  const end = new Date(booking.endTime);
  return now >= new Date(start.getTime() - 15 * 60 * 1000) && now <= end;
}

const STATUS_COLORS = {
  confirmed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export default function MyBookings() {
  const { profile } = useAuth();
  const isInterviewer = profile?.role === 'interviewer';
  const [tab, setTab] = useState('bookings');
  const [bookings, setBookings] = useState([]);
  const [slots, setSlots] = useState([]);
  const [packages, setPackages] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [sessionStatus, setSessionStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  useEffect(() => {
    const fetches = [bookingApi.getBookings(profile?.role).then(r => setBookings(r.data || []))];
    if (isInterviewer) {
      fetches.push(
        bookingApi.getSlots(profile?.userId || profile?.sub).then(r => {
          setSlots((r.data || []).sort((a, b) => new Date(a.startTime) - new Date(b.startTime)));
        }).catch(() => {}),
        packageApi.getMyPackages().then(r => setPackages(r.data || [])).catch(() => {}),
      );
    } else {
      fetches.push(
        packageApi.getMyPurchases().then(r => setPurchases(r.data || [])).catch(() => {}),
      );
    }
    Promise.all(fetches).finally(() => setLoading(false));
  }, [profile]);

  // Poll bookings + session status every 10 seconds so sessionEnabled changes are picked up
  useEffect(() => {
    if (bookings.filter(b => b.status === 'confirmed').length === 0) return;

    const poll = async () => {
      // Re-fetch bookings to pick up sessionEnabled toggled by interviewer
      const fresh = await bookingApi.getBookings(profile?.role).then(r => r.data || []).catch(() => null);
      const latest = fresh || bookings;
      if (fresh) setBookings(fresh);

      const confirmed = latest.filter(b => b.status === 'confirmed');
      if (confirmed.length === 0) return;

      const results = await Promise.all(
        confirmed.map(b =>
          sessionApi.getStatus(b.bookingId)
            .then(r => ({ bookingId: b.bookingId, participants: r.data.participants }))
            .catch(() => ({ bookingId: b.bookingId, participants: 0 }))
        )
      );
      setSessionStatus(Object.fromEntries(results.map(r => [r.bookingId, r.participants])));
    };

    poll();
    pollRef.current = setInterval(poll, 10000);
    return () => clearInterval(pollRef.current);
  }, [profile?.role]); // run once per role, not on every bookings update

  const handleStatusUpdate = async (bookingId, status) => {
    await bookingApi.updateBookingStatus(bookingId, status);
    setBookings(prev => prev.map(b => b.bookingId === bookingId ? { ...b, status } : b));
  };

  const handleEnableSession = async (bookingId, enabled) => {
    await bookingApi.enableSession(bookingId, enabled);
    setBookings(prev => prev.map(b => b.bookingId === bookingId ? { ...b, sessionEnabled: enabled } : b));
  };

  const handleSlotAdded = (slot) => {
    setSlots(prev => [slot, ...prev]);
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">My Bookings</h1>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {(isInterviewer
          ? [['bookings', 'Booking Requests'], ['slots', 'Availability Slots'], ['packages', 'Packages']]
          : [['bookings', 'Bookings'], ['purchases', 'My Purchases']]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {label}
            {key === 'bookings' && bookings.length > 0 && (
              <span className="ml-1.5 bg-indigo-100 text-indigo-600 text-xs px-1.5 py-0.5 rounded-full">
                {bookings.length}
              </span>
            )}
            {key === 'purchases' && purchases.length > 0 && (
              <span className="ml-1.5 bg-indigo-100 text-indigo-600 text-xs px-1.5 py-0.5 rounded-full">
                {purchases.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'bookings' && (
        <>
          {bookings.length === 0 && <p className="text-gray-500">No bookings yet.</p>}
          <div className="space-y-4">
            {bookings.map(booking => (
              <div key={booking.bookingId} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-semibold">{booking.sessionType} Session</div>
                    {booking.startTime ? (
                      <div className="text-sm text-gray-700 mt-1 font-medium">
                        {format(new Date(booking.startTime), 'EEE, MMM d, yyyy')}
                      </div>
                    ) : null}
                    {booking.startTime && booking.endTime ? (
                      <div className="text-sm text-indigo-600 mt-0.5">
                        {format(new Date(booking.startTime), 'h:mm a')} – {format(new Date(booking.endTime), 'h:mm a')}
                      </div>
                    ) : null}
                    <div className="text-xs text-gray-400 mt-1">
                      Booked {format(new Date(booking.createdAt), 'MMM d, yyyy')}
                    </div>
                    <Link
                      to={`/messages?to=${isInterviewer ? booking.candidateId : booking.interviewerId}`}
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline mt-1.5"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      {isInterviewer ? 'Message Candidate' : 'Message Interviewer'}
                    </Link>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`text-xs px-3 py-1 rounded-full font-medium ${STATUS_COLORS[booking.status] || 'bg-gray-100'}`}>
                      {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                    </span>
                    {booking.status === 'confirmed' && (
                      <div className="flex flex-col items-end gap-1">
                        {isInterviewer && (
                          <button
                            onClick={() => handleEnableSession(booking.bookingId, !booking.sessionEnabled)}
                            className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${booking.sessionEnabled ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                          >
                            {booking.sessionEnabled ? 'Disable Session' : 'Enable Session'}
                          </button>
                        )}
                        {sessionStatus[booking.bookingId] > 0 && (
                          <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            {sessionStatus[booking.bookingId] === 1
                              ? '1 person waiting'
                              : `${sessionStatus[booking.bookingId]} in session`}
                          </div>
                        )}
                        {canJoin(booking) ? (
                          <Link
                            to={`/session/${booking.bookingId}`}
                            className={`text-xs text-white px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 transition-colors ${sessionStatus[booking.bookingId] > 0 ? 'bg-green-600 hover:bg-green-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 00-2 2v4a2 2 0 002 2h9a2 2 0 002-2V10a2 2 0 00-2-2H3z" />
                            </svg>
                            {sessionStatus[booking.bookingId] > 0 ? 'Join Now' : 'Join Session'}
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-400 px-3 py-1.5">
                            {booking.sessionEnabled ? 'Session closed' : 'Opens at session time'}
                          </span>
                        )}
                      </div>
                    )}
                    {isInterviewer && booking.status === 'confirmed' && (
                      <button
                        onClick={() => handleStatusUpdate(booking.bookingId, 'cancelled')}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'packages' && isInterviewer && (
        <InterviewerPackages
          packages={packages}
          onCreated={pkg => setPackages(prev => [pkg, ...prev])}
          onToggled={(id, status) => setPackages(prev => prev.map(p => p.packageId === id ? { ...p, status } : p))}
          hourlyRate={profile?.hourlyRate}
        />
      )}

      {tab === 'purchases' && !isInterviewer && (
        <MyPurchases purchases={purchases} />
      )}

      {tab === 'slots' && isInterviewer && (
        <div>
          <AddSlotForm onAdded={handleSlotAdded} hourlyRate={profile?.hourlyRate} />
          <h2 className="font-semibold text-gray-700 mt-8 mb-3">Your Published Slots</h2>
          {slots.length === 0 && <p className="text-gray-500 text-sm">No slots published yet.</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {slots.map(slot => (
              <div key={slot.slotId} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-gray-900">{format(new Date(slot.startTime), 'EEE, MMM d, yyyy')}</div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      {format(new Date(slot.startTime), 'h:mm a')} – {format(new Date(slot.endTime), 'h:mm a')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-indigo-600">${slot.price}</div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${slot.status === 'available' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {slot.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── INTERVIEWER PACKAGES ─────────────────────────────────────────────────────

function InterviewerPackages({ packages, onCreated, onToggled, hourlyRate }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', totalSessions: 3, sessionTypes: [], bundlePrice: '', pricePerSession: hourlyRate || '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const SESSION_TYPES = ['DSA', 'System Design', 'Behavioral', 'Resume Review', 'Mock Interview'];

  const toggleType = (t) => setForm(f => ({
    ...f,
    sessionTypes: f.sessionTypes.includes(t) ? f.sessionTypes.filter(x => x !== t) : [...f.sessionTypes, t],
  }));

  const handleCreate = async () => {
    if (!form.title.trim() || !form.bundlePrice) return setError('Title and bundle price are required.');
    setSaving(true);
    setError('');
    try {
      const { data } = await packageApi.createPackage({
        title: form.title.trim(),
        description: form.description.trim(),
        totalSessions: Number(form.totalSessions),
        sessionTypes: form.sessionTypes,
        pricePerSession: Number(form.pricePerSession) || 0,
        bundlePrice: Number(form.bundlePrice),
      });
      onCreated(data);
      setShowForm(false);
      setForm({ title: '', description: '', totalSessions: 3, sessionTypes: [], bundlePrice: '', pricePerSession: hourlyRate || '' });
    } catch {
      setError('Failed to create package. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (pkg) => {
    const { data } = await packageApi.togglePackage(pkg.packageId);
    onToggled(pkg.packageId, data.status);
  };

  const savings = (p) => {
    if (!p.pricePerSession) return null;
    const full = p.pricePerSession * p.totalSessions;
    const save = full - p.bundlePrice;
    return save > 0 ? save : null;
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h2 className="font-semibold text-gray-800">Interview Packages</h2>
        <button
          onClick={() => setShowForm(v => !v)}
          className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700"
        >
          {showForm ? 'Cancel' : '+ Create Package'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6 space-y-4">
          <h3 className="font-semibold text-gray-800">New Package</h3>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Package Title</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Full Stack Interview Bundle"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What's included in this package..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Sessions</label>
              <input
                type="number"
                min={2}
                max={10}
                value={form.totalSessions}
                onChange={e => setForm(f => ({ ...f, totalSessions: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Price/Session ($)</label>
              <input
                type="number"
                value={form.pricePerSession}
                onChange={e => setForm(f => ({ ...f, pricePerSession: e.target.value }))}
                placeholder={hourlyRate || '0'}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Bundle Price ($)</label>
              <input
                type="number"
                value={form.bundlePrice}
                onChange={e => setForm(f => ({ ...f, bundlePrice: e.target.value }))}
                placeholder="e.g. 250"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {form.pricePerSession && form.bundlePrice && Number(form.pricePerSession) * Number(form.totalSessions) > Number(form.bundlePrice) && (
                <p className="text-xs text-green-600 mt-0.5">
                  ${Number(form.pricePerSession) * Number(form.totalSessions) - Number(form.bundlePrice)} savings for candidate
                </p>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-2">Session Types Included</label>
            <div className="flex gap-2 flex-wrap">
              {SESSION_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => toggleType(t)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${form.sessionTypes.includes(t) ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:border-indigo-400'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={saving}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
          >
            {saving ? 'Creating...' : 'Create Package'}
          </button>
        </div>
      )}

      {packages.length === 0 && !showForm && (
        <p className="text-gray-500 text-sm">No packages yet. Create one to offer bundled sessions.</p>
      )}

      <div className="space-y-3">
        {packages.map(pkg => (
          <div key={pkg.packageId} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900">{pkg.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${pkg.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {pkg.status}
                  </span>
                </div>
                {pkg.description && <p className="text-sm text-gray-500 mb-2">{pkg.description}</p>}
                <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{pkg.totalSessions} sessions</span>
                  {pkg.pricePerSession > 0 && (
                    <span className="line-through">${pkg.pricePerSession * pkg.totalSessions}</span>
                  )}
                  <span className="text-indigo-600 font-bold text-sm">${pkg.bundlePrice} bundle</span>
                  {savings(pkg) && (
                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Save ${savings(pkg)}</span>
                  )}
                </div>
                {pkg.sessionTypes?.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {pkg.sessionTypes.map(t => (
                      <span key={t} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleToggle(pkg)}
                className={`text-xs px-3 py-1.5 rounded-lg ml-4 shrink-0 ${pkg.status === 'active' ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}`}
              >
                {pkg.status === 'active' ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CANDIDATE MY PURCHASES ────────────────────────────────────────────────────

function MyPurchases({ purchases }) {
  if (purchases.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-2">No packages purchased yet.</p>
        <Link to="/search" className="text-indigo-600 text-sm hover:underline">Browse interviewers to find packages</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {purchases.map(p => {
        const used = p.usedSessions;
        const total = p.totalSessions;
        const left = total - used;
        const pct = Math.round((used / total) * 100);
        return (
          <div key={p.purchaseId} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-semibold text-gray-900">{p.packageTitle}</h3>
                <p className="text-xs text-gray-400 mt-0.5">Purchased {format(new Date(p.purchasedAt), 'MMM d, yyyy')}</p>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {p.status === 'active' ? `${left} session${left !== 1 ? 's' : ''} left` : 'Completed'}
              </span>
            </div>
            <div className="mb-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{used} of {total} sessions used</span>
                <span>{pct}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
            {p.sessionTypes?.length > 0 && (
              <div className="flex gap-1 flex-wrap mb-3">
                {p.sessionTypes.map(t => (
                  <span key={t} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            )}
            {p.status === 'active' && (
              <Link
                to={`/book/${p.interviewerId}?purchase=${p.purchaseId}`}
                className="inline-block bg-indigo-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-indigo-700 font-medium"
              >
                Book a Session
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AddSlotForm({ onAdded, hourlyRate }) {
  const [dateRange, setDateRange] = useState([null, null]);
  const [startDate, endDate] = dateRange;
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [queue, setQueue] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleAddToQueue = () => {
    if (!startDate) return setError('Please select a date or date range.');
    if (!startTime || !endTime) return setError('Start and end time are required.');

    const to = endDate || startDate;
    const days = eachDayOfInterval({ start: startDate, end: to });

    const newSlots = [];
    for (const day of days) {
      const dateStr = format(day, 'yyyy-MM-dd');
      const slotStart = new Date(`${dateStr}T${startTime}`).toISOString();
      const slotEnd = new Date(`${dateStr}T${endTime}`).toISOString();
      if (new Date(slotEnd) <= new Date(slotStart)) {
        return setError('End time must be after start time.');
      }
      const key = `${slotStart}-${slotEnd}`;
      if (!queue.some(s => s._key === key)) {
        newSlots.push({ startTime: slotStart, endTime: slotEnd, price: Number(hourlyRate || 0), _key: key });
      }
    }

    if (newSlots.length === 0) return setError('All selected days are already in the queue.');
    setError('');
    setQueue(prev => [...prev, ...newSlots]);
    setDateRange([null, null]);
  };

  const handleRemove = (key) => setQueue(prev => prev.filter(s => s._key !== key));

  const handlePublishAll = async () => {
    if (queue.length === 0) return;
    setSaving(true);
    try {
      const results = await Promise.all(
        queue.map(({ _key, ...slot }) => bookingApi.createSlot(slot).then(r => r.data))
      );
      results.forEach(onAdded);
      setQueue([]);
    } catch {
      setError('Some slots failed to publish. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-semibold text-gray-800">Add Availability Slots</h2>
        {hourlyRate && (
          <span className="text-sm text-indigo-600 font-medium bg-indigo-50 px-3 py-1 rounded-full">
            Rate: ${hourlyRate}/hr
          </span>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-start">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-2">Select Date Range</label>
          <DatePicker
            selected={startDate}
            onChange={dates => setDateRange(dates)}
            startDate={startDate}
            endDate={endDate}
            selectsRange
            inline
            minDate={new Date()}
            calendarClassName="!border-0 !shadow-none"
          />
        </div>

        <div className="flex flex-col gap-4 pt-6">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Start Time</label>
            <input
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className="w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">End Time</label>
            <input
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              className="w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {startDate && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              {endDate && !isBefore(endDate, startDate)
                ? <>Selected: <span className="font-medium text-gray-700">{format(startDate, 'MMM d')} – {format(endDate, 'MMM d')}</span> ({eachDayOfInterval({ start: startDate, end: endDate }).length} days)</>
                : <>Selected: <span className="font-medium text-gray-700">{format(startDate, 'MMM d, yyyy')}</span></>
              }
            </div>
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            onClick={handleAddToQueue}
            className="border border-indigo-600 text-indigo-600 px-4 py-2 rounded-lg hover:bg-indigo-50 text-sm font-medium"
          >
            + Add to Queue
          </button>
        </div>
      </div>

      {queue.length > 0 && (
        <div className="mt-6 border-t pt-5">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Ready to publish — <span className="text-indigo-600">{queue.length} slot{queue.length > 1 ? 's' : ''}</span>
          </h3>
          <div className="space-y-2 mb-4 max-h-48 overflow-y-auto pr-1">
            {queue.map(slot => (
              <div key={slot._key} className="flex items-center justify-between bg-indigo-50 rounded-lg px-4 py-2.5">
                <div className="text-sm text-gray-800">
                  <span className="font-medium">{format(new Date(slot.startTime), 'EEE, MMM d')}</span>
                  <span className="text-gray-500 ml-2">
                    {format(new Date(slot.startTime), 'h:mm a')} – {format(new Date(slot.endTime), 'h:mm a')}
                  </span>
                  <span className="ml-2 text-indigo-600 font-medium">${slot.price}</span>
                </div>
                <button onClick={() => handleRemove(slot._key)} className="text-gray-400 hover:text-red-500 text-xl leading-none ml-4">×</button>
              </div>
            ))}
          </div>
          <button
            onClick={handlePublishAll}
            disabled={saving}
            className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
          >
            {saving ? 'Publishing...' : `Publish All ${queue.length} Slot${queue.length > 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </div>
  );
}
