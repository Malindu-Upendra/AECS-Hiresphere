import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { userApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const DOMAINS = ['Backend', 'Frontend', 'DevOps', 'AI/ML', 'Mobile'];
const INTERVIEW_TYPES = ['DSA', 'System Design', 'Behavioral'];
const LEVELS = ['Senior', 'Staff', 'Principal'];

export default function Onboarding() {
  const { setProfile } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ role: '', name: '', bio: '', domain: '', interviewTypes: [], experienceLevel: '', hourlyRate: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleInterviewType = (type) => {
    setForm(f => ({
      ...f,
      interviewTypes: f.interviewTypes.includes(type)
        ? f.interviewTypes.filter(t => t !== type)
        : [...f.interviewTypes, type],
    }));
  };

  const handleSubmit = async () => {
    if (!form.role) return setError('Please select a role to continue.');
    if (!form.name.trim()) return setError('Full name is required.');
    setError('');
    setSaving(true);
    try {
      const { data } = await userApi.createProfile(form);
      setProfile(data);
      navigate('/', { replace: true });
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="relative min-h-screen flex items-center justify-center px-4"
      style={{
        backgroundImage: 'url(https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1920&q=80)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-lg relative z-10">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Welcome to HireSphere</h1>
          <p className="text-gray-500 mt-2 text-sm">Set up your profile to get started</p>
        </div>

        <div className="space-y-5">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">I am a...</label>
            <div className="flex gap-3">
              {['candidate', 'interviewer'].map(r => (
                <button
                  key={r}
                  onClick={() => setForm(f => ({ ...f, role: r }))}
                  className={`flex-1 py-3 rounded-xl border text-sm font-medium capitalize transition-colors ${
                    form.role === r
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-gray-300 text-gray-700 hover:border-indigo-400'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <Field label="Full Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
          <Field label="Bio" value={form.bio} onChange={v => setForm(f => ({ ...f, bio: v }))} multiline />

          {form.role === 'interviewer' && (
            <>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">Domain</label>
                <select
                  value={form.domain}
                  onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select domain</option>
                  {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">Interview Types</label>
                <div className="flex gap-2 flex-wrap">
                  {INTERVIEW_TYPES.map(t => (
                    <button
                      key={t}
                      onClick={() => toggleInterviewType(t)}
                      className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                        form.interviewTypes.includes(t)
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-gray-300 hover:border-indigo-400'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">Experience Level</label>
                <select
                  value={form.experienceLevel}
                  onChange={e => setForm(f => ({ ...f, experienceLevel: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select level</option>
                  {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              <Field label="Hourly Rate ($)" value={form.hourlyRate} onChange={v => setForm(f => ({ ...f, hourlyRate: v }))} type="number" />
            </>
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Setting up...' : 'Get Started'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, multiline, type = 'text' }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 block mb-1">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      )}
    </div>
  );
}
