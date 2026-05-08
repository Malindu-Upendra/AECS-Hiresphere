import { useEffect, useState } from 'react';
import { userApi } from '../lib/api';

const DOMAINS = ['Backend', 'Frontend', 'DevOps', 'AI/ML', 'Mobile'];
const INTERVIEW_TYPES = ['DSA', 'System Design', 'Behavioral'];
const LEVELS = ['Senior', 'Staff', 'Principal'];

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ role: 'candidate', name: '', bio: '', domain: '', interviewTypes: [], experienceLevel: '', hourlyRate: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    userApi.getMe()
      .then(({ data }) => {
        setProfile(data);
        setForm({ role: data.role, name: data.name || '', bio: data.bio || '', domain: data.domain || '', interviewTypes: data.interviewTypes || [], experienceLevel: data.experienceLevel || '', hourlyRate: data.hourlyRate || '' });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!profile) {
        await userApi.createProfile(form);
      } else {
        await userApi.updateMe(form);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const toggleInterviewType = (type) => {
    setForm(f => ({
      ...f,
      interviewTypes: f.interviewTypes.includes(type)
        ? f.interviewTypes.filter(t => t !== type)
        : [...f.interviewTypes, type],
    }));
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6">{profile ? 'Edit Profile' : 'Create Profile'}</h1>
      <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
        {!profile && (
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">I am a...</label>
            <div className="flex gap-3">
              {['candidate', 'interviewer'].map(r => (
                <button
                  key={r}
                  onClick={() => setForm(f => ({ ...f, role: r }))}
                  className={`px-4 py-2 rounded-lg border text-sm capitalize ${form.role === r ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300'}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        <Field label="Full Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
        <Field label="Bio" value={form.bio} onChange={v => setForm(f => ({ ...f, bio: v }))} multiline />

        {form.role === 'interviewer' && (
          <>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Domain</label>
              <select value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Select domain</option>
                {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Interview Types</label>
              <div className="flex gap-2 flex-wrap">
                {INTERVIEW_TYPES.map(t => (
                  <button key={t} onClick={() => toggleInterviewType(t)}
                    className={`px-3 py-1 rounded-full text-sm border ${form.interviewTypes.includes(t) ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Experience Level</label>
              <select value={form.experienceLevel} onChange={e => setForm(f => ({ ...f, experienceLevel: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Select level</option>
                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <Field label="Hourly Rate ($)" value={form.hourlyRate} onChange={v => setForm(f => ({ ...f, hourlyRate: v }))} type="number" />
          </>
        )}

        <button onClick={handleSave} disabled={saving}
          className="w-full bg-indigo-600 text-white py-2 rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50">
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Profile'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, multiline, type = 'text' }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 block mb-1">{label}</label>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      )}
    </div>
  );
}
