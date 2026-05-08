import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { userApi, bookingApi, submissionApi, sessionApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';

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
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function Dashboard() {
  const { profile: authProfile } = useAuth();
  const isInterviewer = authProfile?.role === 'interviewer';

  const [profile, setProfile] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [slots, setSlots] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [sessionStatus, setSessionStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!authProfile) return;

    const fetches = [
      userApi.getMe().catch(err => {
        if (err?.response?.status === 404) return { data: null };
        return { data: null };
      }),
      bookingApi.getBookings(authProfile.role).catch(() => ({ data: [] })),
    ];

    if (isInterviewer) {
      fetches.push(
        bookingApi.getSlots(authProfile.userId).catch(() => ({ data: [] }))
      );
    } else {
      fetches.push(
        submissionApi.getMySubmissions().catch(() => ({ data: [] }))
      );
    }

    Promise.all(fetches).then(async ([profileRes, bookingsRes, thirdRes]) => {
      setProfile(profileRes.data);
      const allBookings = bookingsRes.data || [];
      setBookings(allBookings);
      if (isInterviewer) setSlots(thirdRes.data || []);
      else setSubmissions(thirdRes.data || []);

      // Fetch session status for confirmed bookings
      const confirmed = allBookings.filter(b => b.status === 'confirmed');
      if (confirmed.length > 0) {
        const statuses = await Promise.all(
          confirmed.map(b =>
            sessionApi.getStatus(b.bookingId)
              .then(r => [b.bookingId, r.data.participants])
              .catch(() => [b.bookingId, 0])
          )
        );
        setSessionStatus(Object.fromEntries(statuses));
      }
    }).finally(() => setLoading(false));
  }, [authProfile]);

  // Poll every 10s to refresh bookings (picks up sessionEnabled changes) + session status
  useEffect(() => {
    if (!authProfile) return;
    const poll = async () => {
      const fresh = await bookingApi.getBookings(authProfile.role).then(r => r.data || []).catch(() => null);
      if (!fresh) return;
      setBookings(fresh);
      const confirmed = fresh.filter(b => b.status === 'confirmed');
      if (confirmed.length === 0) return;
      const statuses = await Promise.all(
        confirmed.map(b =>
          sessionApi.getStatus(b.bookingId)
            .then(r => [b.bookingId, r.data.participants])
            .catch(() => [b.bookingId, 0])
        )
      );
      setSessionStatus(Object.fromEntries(statuses));
    };
    pollRef.current = setInterval(poll, 10000);
    return () => clearInterval(pollRef.current);
  }, [authProfile?.role]);

  if (loading) return <div className="text-gray-400 text-sm">Loading...</div>;

  if (!profile) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Welcome to HireSphere</h1>
        <p className="text-gray-600 mb-6">Set up your profile to get started.</p>
        <Link to="/profile" className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700">
          Create Profile
        </Link>
      </div>
    );
  }

  const upcoming = bookings.filter(b => b.status === 'confirmed');
  const recentBookings = [...bookings]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {profile.name}</h1>
        <p className="text-gray-500 text-sm mt-1 capitalize">{profile.role} Account</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Upcoming Sessions"
          value={upcoming.length}
          color="bg-green-50 text-green-800 border border-green-100"
        />
        {isInterviewer ? (
          <>
            <StatCard
              label="Available Slots"
              value={slots.filter(s => s.status === 'available').length}
              color="bg-indigo-50 text-indigo-800 border border-indigo-100"
            />
            <StatCard
              label="Total Sessions"
              value={bookings.length}
              color="bg-blue-50 text-blue-800 border border-blue-100"
            />
          </>
        ) : (
          <>
            <StatCard
              label="Total Bookings"
              value={bookings.length}
              color="bg-blue-50 text-blue-800 border border-blue-100"
            />
            <StatCard
              label="Practicals"
              value={submissions.length}
              color="bg-purple-50 text-purple-800 border border-purple-100"
            />
          </>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex gap-3 mb-10">
        {isInterviewer ? (
          <>
            <Link to="/bookings" className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg hover:bg-indigo-700 text-sm font-medium">
              Manage Availability
            </Link>
            <Link to="/practicals" className="border border-indigo-600 text-indigo-600 px-5 py-2.5 rounded-lg hover:bg-indigo-50 text-sm font-medium">
              Practicals
            </Link>
          </>
        ) : (
          <>
            <Link to="/search" className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg hover:bg-indigo-700 text-sm font-medium">
              Find an Interviewer
            </Link>
            <Link to="/practicals" className="border border-indigo-600 text-indigo-600 px-5 py-2.5 rounded-lg hover:bg-indigo-50 text-sm font-medium">
              Practicals
            </Link>
          </>
        )}
        <Link to="/messages" className="border border-gray-300 text-gray-600 px-5 py-2.5 rounded-lg hover:bg-gray-50 text-sm font-medium">
          Messages
        </Link>
      </div>

      {/* Recent bookings */}
      <div>
        <h2 className="font-semibold text-gray-700 mb-3">Recent Sessions</h2>
        {recentBookings.length === 0 ? (
          <p className="text-gray-400 text-sm">
            {isInterviewer ? 'No sessions yet. Add availability slots to get booked.' : 'No sessions yet. Find an interviewer to get started.'}
          </p>
        ) : (
          <div className="space-y-2">
            {recentBookings.map(b => (
              <div key={b.bookingId} className="bg-white rounded-xl px-5 py-4 shadow-sm border border-gray-100 flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900 text-sm">{b.sessionType} Session</div>
                  {b.startTime ? (
                    <div className="text-xs text-gray-700 mt-0.5 font-medium">
                      {format(new Date(b.startTime), 'EEE, MMM d')}
                      {b.endTime && (
                        <span className="text-indigo-600 ml-1">
                          {format(new Date(b.startTime), 'h:mm a')} – {format(new Date(b.endTime), 'h:mm a')}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 mt-0.5">{format(new Date(b.createdAt), 'MMM d, yyyy')}</div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[b.status] || 'bg-gray-100 text-gray-600'}`}>
                    {b.status.charAt(0).toUpperCase() + b.status.slice(1)}
                  </span>
                  {b.status === 'confirmed' && (
                    <div className="flex flex-col items-end gap-1">
                      {sessionStatus[b.bookingId] > 0 && (
                        <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                          {sessionStatus[b.bookingId] === 1 ? '1 waiting' : 'Live'}
                        </div>
                      )}
                      {canJoin(b) ? (
                        <Link to={`/session/${b.bookingId}`}
                          className={`text-xs text-white px-3 py-1 rounded-lg font-medium transition-colors ${sessionStatus[b.bookingId] > 0 ? 'bg-green-600 hover:bg-green-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                          Join
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-400 px-1">Opens at session time</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className={`rounded-xl p-5 ${color}`}>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-sm mt-1">{label}</div>
    </div>
  );
}
