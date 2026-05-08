import { useEffect, useRef, useState } from 'react';
import { taskApi, submissionApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';

const DIFFICULTY_COLOR = {
  Easy: 'text-green-600 bg-green-50',
  Medium: 'text-yellow-600 bg-yellow-50',
  Hard: 'text-red-600 bg-red-50',
};

const RECOMMENDATION_STYLE = {
  hire: 'bg-green-100 text-green-700',
  consider: 'bg-yellow-100 text-yellow-700',
  reject: 'bg-red-100 text-red-700',
};

function getGradeInfo(score) {
  if (score >= 90) return { grade: 'A', color: 'text-green-600 bg-green-50 border-green-300' };
  if (score >= 80) return { grade: 'B+', color: 'text-teal-600 bg-teal-50 border-teal-300' };
  if (score >= 70) return { grade: 'B', color: 'text-blue-600 bg-blue-50 border-blue-300' };
  if (score >= 60) return { grade: 'C', color: 'text-yellow-600 bg-yellow-50 border-yellow-300' };
  return { grade: 'D', color: 'text-red-600 bg-red-50 border-red-300' };
}

export default function Practicals() {
  const { profile } = useAuth();
  return profile?.role === 'interviewer' ? <InterviewerPracticals /> : <CandidatePracticals />;
}

// ── CANDIDATE ────────────────────────────────────────────────────────────────

function CandidatePracticals() {
  const [tab, setTab] = useState('practicals');
  const [tasks, setTasks] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [diffFilter, setDiffFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      taskApi.getTasks().then(r => r.data || []),
      submissionApi.getMySubmissions().then(r => r.data || []),
    ]).then(([t, s]) => {
      setTasks(t);
      setSubmissions(s);
    }).finally(() => setLoading(false));
  }, []);

  const handleSubmitted = (newSub) => {
    setSubmissions(prev => [newSub, ...prev]);
    setSelectedTask(null);
    setTab('reports');
  };

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>;

  if (selectedTask) {
    return (
      <TaskDetail
        task={selectedTask}
        onBack={() => setSelectedTask(null)}
        onSubmitted={handleSubmitted}
        mySubmissions={submissions.filter(s => s.taskId === selectedTask.taskId)}
      />
    );
  }

  const filtered = diffFilter ? tasks.filter(t => t.difficulty === diffFilter) : tasks;
  const reviewedCount = submissions.filter(s => s.status === 'reviewed').length;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Practicals</h1>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {[['practicals', 'All Practicals'], ['reports', 'My Reports']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {label}
            {key === 'reports' && reviewedCount > 0 && (
              <span className="ml-1.5 bg-green-100 text-green-600 text-xs px-1.5 py-0.5 rounded-full">{reviewedCount}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'practicals' && (
        <>
          <div className="flex gap-2 mb-4">
            {['', 'Easy', 'Medium', 'Hard'].map(d => (
              <button
                key={d}
                onClick={() => setDiffFilter(d)}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${diffFilter === d ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:border-indigo-400'}`}
              >
                {d || 'All'}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {filtered.length === 0 && <p className="text-gray-500 text-sm">No practicals found.</p>}
            {filtered.map(task => {
              const submitted = submissions.some(s => s.taskId === task.taskId);
              return (
                <div
                  key={task.taskId}
                  onClick={() => setSelectedTask(task)}
                  className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:border-indigo-300 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <h3 className="font-semibold text-gray-900">{task.title}</h3>
                        {submitted && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Submitted</span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${task.type === 'interviewer' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {task.type === 'interviewer' ? 'Interviewer' : 'Common'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${DIFFICULTY_COLOR[task.difficulty]}`}>
                          {task.difficulty}
                        </span>
                        <span className="text-xs text-gray-400">{task.timeLimit} min</span>
                        {task.tags?.map(tag => (
                          <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{tag}</span>
                        ))}
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-gray-400 mt-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'reports' && (
        <div className="space-y-4">
          {submissions.length === 0 && (
            <p className="text-gray-500 text-sm">No submissions yet. Pick a practical to get started.</p>
          )}
          {[...submissions]
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .map(s => <ReportCard key={s.submissionId} submission={s} />)}
        </div>
      )}
    </div>
  );
}

// ── INTERVIEWER ──────────────────────────────────────────────────────────────

function InterviewerPracticals() {
  const { profile } = useAuth();
  const [tab, setTab] = useState('browse');
  const [tasks, setTasks] = useState([]);
  const [reviewSubs, setReviewSubs] = useState([]);
  const [selectedSub, setSelectedSub] = useState(null);
  const [loading, setLoading] = useState(true);

  const myId = profile?.userId || profile?.sub;

  useEffect(() => {
    Promise.all([
      taskApi.getTasks().then(r => r.data || []),
      submissionApi.getForReview().then(r => r.data || []).catch(() => []),
    ]).then(([t, s]) => {
      setTasks(t);
      setReviewSubs(s);
    }).finally(() => setLoading(false));
  }, []);

  const handleTaskCreated = (task) => {
    setTasks(prev => [task, ...prev]);
    setTab('browse');
  };

  const handleEvaluated = (submissionId, evaluation) => {
    setReviewSubs(prev =>
      prev.map(s => s.submissionId === submissionId ? { ...s, evaluation, status: 'reviewed' } : s)
    );
    setSelectedSub(null);
  };

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>;

  if (selectedSub) {
    const task = tasks.find(t => t.taskId === selectedSub.taskId);
    return (
      <EvaluatePanel
        submission={selectedSub}
        task={task}
        onBack={() => setSelectedSub(null)}
        onEvaluated={handleEvaluated}
      />
    );
  }

  const pendingCount = reviewSubs.filter(s => s.status !== 'reviewed').length;
  const myTasks = tasks.filter(t => t.createdBy === myId);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Practicals</h1>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {[
          ['browse', 'Browse'],
          ['upload', 'Upload Practical'],
          ['evaluate', `Evaluate${pendingCount > 0 ? ` (${pendingCount})` : ''}`],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'browse' && <TaskBrowse tasks={tasks} myId={myId} />}
      {tab === 'upload' && <UploadPracticalForm onCreated={handleTaskCreated} />}
      {tab === 'evaluate' && (
        <EvaluateList submissions={reviewSubs} tasks={tasks} onSelect={setSelectedSub} />
      )}
    </div>
  );
}

// ── SHARED SUB-COMPONENTS ────────────────────────────────────────────────────

function TaskBrowse({ tasks, myId }) {
  const [diffFilter, setDiffFilter] = useState('');
  const filtered = diffFilter ? tasks.filter(t => t.difficulty === diffFilter) : tasks;

  return (
    <>
      <div className="flex gap-2 mb-4">
        {['', 'Easy', 'Medium', 'Hard'].map(d => (
          <button
            key={d}
            onClick={() => setDiffFilter(d)}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${diffFilter === d ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:border-indigo-400'}`}
          >
            {d || 'All'}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {filtered.length === 0 && <p className="text-gray-500 text-sm">No practicals found.</p>}
        {filtered.map(task => (
          <div key={task.taskId} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <h3 className="font-semibold text-gray-900">{task.title}</h3>
                  {task.createdBy === myId && (
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Yours</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${task.type === 'interviewer' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {task.type === 'interviewer' ? 'Interviewer' : 'Common'}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${DIFFICULTY_COLOR[task.difficulty]}`}>
                    {task.difficulty}
                  </span>
                  <span className="text-xs text-gray-400">{task.timeLimit} min</span>
                  {task.tags?.map(tag => (
                    <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function UploadPracticalForm({ onCreated }) {
  const [form, setForm] = useState({
    title: '', description: '', difficulty: 'Medium',
    timeLimit: 60, tags: '', evaluationCriteria: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      return setError('Title and description are required.');
    }
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        difficulty: form.difficulty,
        timeLimit: Number(form.timeLimit) || 60,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        evaluationCriteria: form.evaluationCriteria.split('\n').map(c => c.trim()).filter(Boolean),
      };
      const { data } = await taskApi.createTask(payload);
      setSuccess(`"${data.title}" uploaded successfully.`);
      setForm({ title: '', description: '', difficulty: 'Medium', timeLimit: 60, tags: '', evaluationCriteria: '' });
      onCreated(data);
    } catch {
      setError('Failed to upload practical. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-5">
      <h2 className="font-semibold text-gray-800 text-lg">Upload New Practical</h2>

      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">Title</label>
        <input
          type="text"
          value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder="e.g. Implement a Stack using Queues"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">Problem Description</label>
        <textarea
          rows={6}
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Describe the problem. Include examples, constraints, and expected input/output..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Difficulty</label>
          <select
            value={form.difficulty}
            onChange={e => set('difficulty', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option>Easy</option>
            <option>Medium</option>
            <option>Hard</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Time Limit (min)</label>
          <input
            type="number"
            value={form.timeLimit}
            onChange={e => set('timeLimit', e.target.value)}
            min={5}
            max={180}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Tags</label>
          <input
            type="text"
            value={form.tags}
            onChange={e => set('tags', e.target.value)}
            placeholder="Arrays, DP, Design"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-xs text-gray-400 mt-0.5">Comma-separated</p>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">Evaluation Criteria</label>
        <textarea
          rows={4}
          value={form.evaluationCriteria}
          onChange={e => set('evaluationCriteria', e.target.value)}
          placeholder={"Correctness\nTime Complexity\nCode Readability\nEdge Case Handling"}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <p className="text-xs text-gray-400 mt-1">One criterion per line. Each will be scored 1–10 when evaluating submissions.</p>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}
      {success && <p className="text-green-600 text-sm">{success}</p>}

      <button
        onClick={handleSubmit}
        disabled={saving}
        className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
      >
        {saving ? 'Uploading...' : 'Upload Practical'}
      </button>
    </div>
  );
}

function EvaluateList({ submissions, tasks, onSelect }) {
  const taskMap = Object.fromEntries(tasks.map(t => [t.taskId, t]));
  const pending = submissions.filter(s => s.status !== 'reviewed');
  const reviewed = submissions.filter(s => s.status === 'reviewed');

  if (submissions.length === 0) {
    return <p className="text-gray-500 text-sm">No submissions yet for your practicals.</p>;
  }

  const SubRow = ({ s }) => (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
      <div>
        <div className="font-medium text-sm text-gray-900">{s.taskTitle || taskMap[s.taskId]?.title || 'Practical'}</div>
        <div className="text-xs text-gray-400 mt-0.5">Submitted {format(new Date(s.createdAt), 'MMM d, yyyy h:mm a')}</div>
        {s.githubUrl && (
          <a href={s.githubUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline mt-0.5 block">
            View on GitHub
          </a>
        )}
        {s.evaluation && (
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs font-bold ${getGradeInfo(s.evaluation.overallScore).color} px-2 py-0.5 rounded-full border`}>
              {s.evaluation.grade} — {s.evaluation.overallScore}/100
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${RECOMMENDATION_STYLE[s.evaluation.recommendation] || ''}`}>
              {s.evaluation.recommendation}
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-4">
        {s.status === 'reviewed' ? (
          <button
            onClick={() => onSelect(s)}
            className="text-xs border border-indigo-400 text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50"
          >
            Re-evaluate
          </button>
        ) : (
          <button
            onClick={() => onSelect(s)}
            className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-indigo-700"
          >
            Evaluate
          </button>
        )}
        {s.s3Key && (
          <button
            onClick={async () => {
              const { data } = await submissionApi.getDownloadUrl(s.submissionId);
              window.open(data.url, '_blank');
            }}
            className="text-xs text-indigo-600 hover:underline"
          >
            Download
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-700 mb-3">Pending Review <span className="text-indigo-600">({pending.length})</span></h2>
          <div className="space-y-2">
            {pending.map(s => <SubRow key={s.submissionId} s={s} />)}
          </div>
        </div>
      )}
      {reviewed.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-700 mb-3">Reviewed ({reviewed.length})</h2>
          <div className="space-y-2">
            {reviewed.map(s => <SubRow key={s.submissionId} s={s} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function EvaluatePanel({ submission, task, onBack, onEvaluated }) {
  const criteria = task?.evaluationCriteria || [];
  const existing = submission.evaluation;
  const [scores, setScores] = useState(
    existing?.scores || Object.fromEntries(criteria.map(c => [c, 5]))
  );
  const [summary, setSummary] = useState(existing?.summary || '');
  const [recommendation, setRecommendation] = useState(existing?.recommendation || 'consider');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const scoreValues = Object.values(scores);
  const avg = scoreValues.length > 0 ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length : 0;
  const overallScore = Math.round(avg * 10);
  const { grade, color: gradeColor } = getGradeInfo(overallScore);

  const handleSubmit = async () => {
    if (!summary.trim()) return setError('Please provide a feedback summary.');
    setSaving(true);
    try {
      const evaluation = { scores, overallScore, grade, summary: summary.trim(), recommendation };
      await submissionApi.evaluate(submission.submissionId, evaluation);
      onEvaluated(submission.submissionId, evaluation);
    } catch {
      setError('Failed to save evaluation. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-indigo-600 hover:underline mb-5">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to submissions
      </button>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="mb-5 pb-5 border-b">
          <h2 className="font-semibold text-gray-800 text-lg">{submission.taskTitle || task?.title}</h2>
          <div className="text-xs text-gray-400 mt-1">
            Submitted {format(new Date(submission.createdAt), 'MMM d, yyyy h:mm a')}
          </div>
          {submission.githubUrl && (
            <a href={submission.githubUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline mt-1 block">
              {submission.githubUrl}
            </a>
          )}
        </div>

        {criteria.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Score Each Criterion (1–10)</h3>
            <div className="space-y-4">
              {criteria.map(c => (
                <div key={c} className="flex items-center gap-4">
                  <span className="text-sm text-gray-700 w-44 shrink-0">{c}</span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={scores[c] ?? 5}
                    onChange={e => setScores(prev => ({ ...prev, [c]: Number(e.target.value) }))}
                    className="flex-1 accent-indigo-600"
                  />
                  <span className="text-sm font-bold text-indigo-700 w-6 text-right">{scores[c] ?? 5}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-5 mb-6 p-4 bg-gray-50 rounded-xl">
          <div className={`w-16 h-16 rounded-full flex flex-col items-center justify-center border-2 shrink-0 ${gradeColor}`}>
            <span className="text-xl font-bold">{grade}</span>
          </div>
          <div>
            <div className="text-3xl font-bold text-gray-900">
              {overallScore}
              <span className="text-base font-normal text-gray-400">/100</span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">Overall Score (auto-calculated)</div>
          </div>
        </div>

        <div className="mb-5">
          <label className="text-sm font-medium text-gray-700 block mb-1">Feedback Summary</label>
          <textarea
            rows={4}
            value={summary}
            onChange={e => setSummary(e.target.value)}
            placeholder="Provide detailed feedback on the candidate's approach, strengths, and areas to improve..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="mb-6">
          <label className="text-sm font-medium text-gray-700 block mb-2">Recommendation</label>
          <div className="flex gap-3">
            {[['hire', 'Hire', 'bg-green-600'], ['consider', 'Consider', 'bg-yellow-500'], ['reject', 'Reject', 'bg-red-600']].map(([val, label, activeCls]) => (
              <button
                key={val}
                onClick={() => setRecommendation(val)}
                className={`px-5 py-2 rounded-lg text-sm font-medium border transition-colors ${recommendation === val ? `${activeCls} text-white border-transparent` : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
        >
          {saving ? 'Saving...' : 'Submit Evaluation'}
        </button>
      </div>
    </div>
  );
}

// ── TASK DETAIL (candidate submits) ─────────────────────────────────────────

function TaskDetail({ task, onBack, onSubmitted, mySubmissions }) {
  const [showForm, setShowForm] = useState(false);
  const [githubUrl, setGithubUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const handleSubmit = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file && !githubUrl.trim()) return setError('Attach a file or provide a GitHub URL.');
    setError('');
    setUploading(true);
    try {
      const form = new FormData();
      form.append('taskId', task.taskId);
      if (file) form.append('file', file);
      if (githubUrl.trim()) form.append('githubUrl', githubUrl.trim());
      const { data } = await submissionApi.upload(form);
      onSubmitted(data);
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-indigo-600 hover:underline mb-5">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to practicals
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-5">
        <div className="flex items-start justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">{task.title}</h1>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium px-3 py-1 rounded-full ${DIFFICULTY_COLOR[task.difficulty]}`}>
              {task.difficulty}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-5 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {task.timeLimit} minutes
          </span>
          <div className="flex gap-1 flex-wrap">
            {task.tags?.map(tag => (
              <span key={tag} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">{tag}</span>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Problem Statement</h3>
          <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed bg-gray-50 p-4 rounded-lg">
            {task.description}
          </pre>
        </div>

        {task.evaluationCriteria?.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Evaluation Criteria</h3>
            <ul className="space-y-1">
              {task.evaluationCriteria.map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-xs flex items-center justify-center font-medium shrink-0">{i + 1}</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 font-medium text-sm"
          >
            Submit Solution
          </button>
        ) : (
          <div className="border-t pt-5 space-y-4">
            <h3 className="font-semibold text-gray-800">Submit Your Solution</h3>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Upload File</label>
              <input
                type="file"
                ref={fileRef}
                accept=".zip,.py,.js,.ts,.java,.cpp,.go,.rb,.rs"
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
            </div>
            <div className="flex items-center gap-3">
              <hr className="flex-1 border-gray-200" />
              <span className="text-xs text-gray-400">or</span>
              <hr className="flex-1 border-gray-200" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">GitHub URL</label>
              <input
                type="url"
                value={githubUrl}
                onChange={e => setGithubUrl(e.target.value)}
                placeholder="https://github.com/username/repo"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={uploading}
                className="bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
              >
                {uploading ? 'Submitting...' : 'Submit'}
              </button>
              <button
                onClick={() => { setShowForm(false); setError(''); }}
                className="px-5 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {mySubmissions.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-700 mb-3 text-sm">Your Previous Submissions</h2>
          <div className="space-y-3">
            {mySubmissions.map(s => <ReportCard key={s.submissionId} submission={s} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── EVALUATION REPORT CARD (candidate view) ──────────────────────────────────

function ReportCard({ submission: s }) {
  const ev = s.evaluation;

  const handleDownload = async () => {
    const { data } = await submissionApi.getDownloadUrl(s.submissionId);
    window.open(data.url, '_blank');
  };

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="font-semibold text-gray-900">{s.taskTitle || 'Practical'}</div>
          <div className="text-xs text-gray-400 mt-0.5">{format(new Date(s.createdAt), 'MMM d, yyyy h:mm a')}</div>
          {s.githubUrl && (
            <a href={s.githubUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline mt-0.5 block">
              {s.githubUrl}
            </a>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${s.status === 'reviewed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
            {s.status === 'reviewed' ? 'Evaluated' : 'Pending Review'}
          </span>
          {s.s3Key && (
            <button onClick={handleDownload} className="text-xs text-indigo-600 hover:underline">Download</button>
          )}
        </div>
      </div>

      {ev && (
        <div className="border-t pt-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center border-2 shrink-0 ${getGradeInfo(ev.overallScore).color}`}>
              <span className="text-lg font-bold">{ev.grade}</span>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">
                {ev.overallScore}
                <span className="text-sm font-normal text-gray-400">/100</span>
              </div>
              <div className="text-xs text-gray-500">Overall Score</div>
            </div>
            {ev.recommendation && (
              <span className={`ml-auto text-xs px-3 py-1.5 rounded-full font-semibold capitalize ${RECOMMENDATION_STYLE[ev.recommendation] || 'bg-gray-100 text-gray-600'}`}>
                {ev.recommendation}
              </span>
            )}
          </div>

          {ev.scores && Object.keys(ev.scores).length > 0 && (
            <div className="space-y-2.5">
              {Object.entries(ev.scores).map(([criterion, score]) => (
                <div key={criterion}>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>{criterion}</span>
                    <span className="font-semibold">{score}/10</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-indigo-500 h-1.5 rounded-full"
                      style={{ width: `${score * 10}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {ev.summary && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-900">
              <span className="font-semibold">Feedback: </span>{ev.summary}
            </div>
          )}

          {ev.reviewedAt && (
            <div className="text-xs text-gray-400">
              Reviewed on {format(new Date(ev.reviewedAt), 'MMM d, yyyy')}
            </div>
          )}
        </div>
      )}

      {!ev && s.annotation && (
        <div className="border-t pt-3 mt-2">
          <div className="text-sm bg-green-50 text-green-800 p-3 rounded-lg">
            <span className="font-medium">Feedback: </span>{s.annotation}
          </div>
        </div>
      )}

      {!ev && !s.annotation && s.status !== 'reviewed' && (
        <div className="border-t pt-3 mt-2 text-sm text-gray-400 italic">
          Your submission is awaiting evaluation from the interviewer.
        </div>
      )}
    </div>
  );
}
