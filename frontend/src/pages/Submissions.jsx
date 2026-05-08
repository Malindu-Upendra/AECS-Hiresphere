import { useEffect, useRef, useState } from 'react';
import { taskApi, submissionApi } from '../lib/api';
import { format } from 'date-fns';

const DIFFICULTY_COLOR = {
  Easy: 'text-green-600 bg-green-50',
  Medium: 'text-yellow-600 bg-yellow-50',
  Hard: 'text-red-600 bg-red-50',
};

export default function Submissions() {
  const [tab, setTab] = useState('tasks');
  const [tasks, setTasks] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      taskApi.getTasks().then(r => r.data),
      submissionApi.getMySubmissions().then(r => r.data),
    ]).then(([t, s]) => {
      setTasks(t || []);
      setSubmissions(s || []);
    }).finally(() => setLoading(false));
  }, []);

  const filteredTasks = difficultyFilter
    ? tasks.filter(t => t.difficulty === difficultyFilter)
    : tasks;

  const handleSubmitted = (newSubmission) => {
    setSubmissions(prev => [newSubmission, ...prev]);
    setSelectedTask(null);
    setTab('mine');
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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Coding Challenges</h1>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {[['tasks', 'All Tasks'], ['mine', 'My Submissions']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {label}
            {key === 'mine' && submissions.length > 0 && (
              <span className="ml-1.5 bg-indigo-100 text-indigo-600 text-xs px-1.5 py-0.5 rounded-full">{submissions.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'tasks' && (
        <>
          <div className="flex gap-2 mb-4">
            {['', 'Easy', 'Medium', 'Hard'].map(d => (
              <button
                key={d}
                onClick={() => setDifficultyFilter(d)}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${difficultyFilter === d ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:border-indigo-400'}`}
              >
                {d || 'All'}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filteredTasks.map(task => {
              const submitted = submissions.some(s => s.taskId === task.taskId);
              return (
                <div
                  key={task.taskId}
                  onClick={() => setSelectedTask(task)}
                  className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:border-indigo-300 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-gray-900">{task.title}</h3>
                        {submitted && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Submitted</span>
                        )}
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

      {tab === 'mine' && (
        <div className="space-y-3">
          {submissions.length === 0 && (
            <p className="text-gray-500 text-sm">No submissions yet. Pick a task to get started.</p>
          )}
          {submissions
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .map(s => (
              <SubmissionCard key={s.submissionId} submission={s} />
            ))}
        </div>
      )}
    </div>
  );
}

function TaskDetail({ task, onBack, onSubmitted, mySubmissions }) {
  const [showSubmitForm, setShowSubmitForm] = useState(false);
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
        Back to tasks
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-5">
        <div className="flex items-start justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">{task.title}</h1>
          <span className={`text-sm font-medium px-3 py-1 rounded-full ${DIFFICULTY_COLOR[task.difficulty]}`}>
            {task.difficulty}
          </span>
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

        <div className="prose prose-sm max-w-none mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Problem Statement</h3>
          <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed bg-gray-50 p-4 rounded-lg">
            {task.description}
          </pre>
        </div>

        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Evaluation Criteria</h3>
          <ul className="space-y-1">
            {task.evaluationCriteria?.map((c, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-xs flex items-center justify-center font-medium shrink-0">{i + 1}</span>
                {c}
              </li>
            ))}
          </ul>
        </div>

        {!showSubmitForm ? (
          <button
            onClick={() => setShowSubmitForm(true)}
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
                onClick={() => { setShowSubmitForm(false); setError(''); }}
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
          <div className="space-y-2">
            {mySubmissions.map(s => <SubmissionCard key={s.submissionId} submission={s} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function SubmissionCard({ submission: s }) {
  const handleDownload = async () => {
    const { data } = await submissionApi.getDownloadUrl(s.submissionId);
    window.open(data.url, '_blank');
  };

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <div className="flex justify-between items-start">
        <div>
          <div className="font-medium text-sm text-gray-900">{s.taskTitle || 'Coding Task'}</div>
          <div className="text-xs text-gray-400 mt-0.5">{format(new Date(s.createdAt), 'MMM d, yyyy h:mm a')}</div>
          {s.githubUrl && (
            <a href={s.githubUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline mt-1 block">
              {s.githubUrl}
            </a>
          )}
          {s.annotation && (
            <div className="mt-2 text-sm bg-green-50 text-green-800 p-2 rounded-lg">
              <span className="font-medium">Feedback:</span> {s.annotation}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <span className={`text-xs px-2 py-1 rounded-full ${s.status === 'reviewed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            {s.status}
          </span>
          {s.s3Key && (
            <button onClick={handleDownload} className="text-xs text-indigo-600 hover:underline">
              Download
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
