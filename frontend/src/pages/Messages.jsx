import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { messagingApi, userApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';

export default function Messages() {
  const { profile } = useAuth();
  const myId = profile?.userId || profile?.sub;
  const [searchParams] = useSearchParams();

  const [conversations, setConversations] = useState([]);
  const [userNames, setUserNames] = useState({});
  const [activeId, setActiveId] = useState(searchParams.get('to') || null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const bottomRef = useRef(null);
  const msgPollRef = useRef(null);
  const convPollRef = useRef(null);

  const fetchName = async (id, current = {}) => {
    if (current[id] || !id) return current;
    const user = await userApi.getUser(id).then(r => r.data).catch(() => null);
    return user?.name ? { ...current, [id]: user.name } : current;
  };

  const loadConversations = async () => {
    const { data } = await messagingApi.getConversations().catch(() => ({ data: [] }));
    const convs = data || [];
    setConversations(convs);

    // Batch-fetch names for all conversation partners
    const partnerIds = [...new Set(convs.map(c => c.senderId === myId ? c.recipientId : c.senderId))];
    let names = {};
    await Promise.all(partnerIds.map(async id => {
      const user = await userApi.getUser(id).then(r => r.data).catch(() => null);
      if (user?.name) names[id] = user.name;
    }));
    setUserNames(prev => ({ ...prev, ...names }));
  };

  // Load conversations on mount and poll every 15s
  useEffect(() => {
    if (!myId) return;
    loadConversations();
    convPollRef.current = setInterval(loadConversations, 15000);
    return () => clearInterval(convPollRef.current);
  }, [myId]);

  // Pre-fetch name for ?to= param (new conversation, not yet in list)
  useEffect(() => {
    const toId = searchParams.get('to');
    if (toId && myId) {
      userApi.getUser(toId).then(r => {
        if (r.data?.name) setUserNames(prev => ({ ...prev, [toId]: r.data.name }));
      }).catch(() => {});
    }
  }, [searchParams.get('to'), myId]);

  // Load + poll messages when active conversation changes
  useEffect(() => {
    clearInterval(msgPollRef.current);
    setMessages([]);
    if (!activeId) return;

    const loadMessages = async () => {
      const { data } = await messagingApi.getConversation(activeId).catch(() => ({ data: [] }));
      setMessages(data || []);
    };

    setLoadingMsgs(true);
    loadMessages().finally(() => setLoadingMsgs(false));
    msgPollRef.current = setInterval(loadMessages, 3000);
    return () => clearInterval(msgPollRef.current);
  }, [activeId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!draft.trim() || !activeId || sending) return;
    const text = draft.trim();
    setDraft('');
    setSending(true);
    try {
      const { data } = await messagingApi.sendMessage({ recipientId: activeId, content: text });
      setMessages(prev => [...prev, data]);
      // Update conversation list preview
      setConversations(prev => {
        const exists = prev.find(c => c.conversationId === data.conversationId);
        if (exists) return prev.map(c => c.conversationId === data.conversationId ? data : c);
        return [data, ...prev];
      });
    } catch {
      setDraft(text); // restore on failure
    } finally {
      setSending(false);
    }
  };

  const activeName = userNames[activeId] || (activeId ? activeId.slice(0, 8) + '…' : '');

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Messages</h1>
      <div className="flex gap-4 h-[620px]">

        {/* Sidebar */}
        <div className="w-64 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
          <div className="px-4 py-3.5 border-b text-sm font-semibold text-gray-700">Conversations</div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 && (
              <p className="p-5 text-sm text-gray-400 leading-relaxed">
                No conversations yet. Find an interviewer and click Message to start.
              </p>
            )}
            {conversations.map(c => {
              const otherId = c.senderId === myId ? c.recipientId : c.senderId;
              const name = userNames[otherId] || otherId.slice(0, 8) + '…';
              const isActive = activeId === otherId;
              return (
                <button
                  key={c.conversationId}
                  onClick={() => setActiveId(otherId)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${isActive ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''}`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isActive ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className={`text-sm font-medium truncate ${isActive ? 'text-indigo-700' : 'text-gray-900'}`}>{name}</div>
                      <div className="text-xs text-gray-400 truncate">{c.content}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {!activeId ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
              <svg className="w-12 h-12 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-sm">Select a conversation or message an interviewer</p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="px-5 py-3.5 border-b flex items-center gap-3 bg-white">
                <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                  {activeName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-gray-900 text-sm">{activeName}</div>
                  <div className="text-xs text-green-500">Online</div>
                </div>
              </div>

              {/* Messages list */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
                {loadingMsgs && messages.length === 0 && (
                  <div className="text-center text-sm text-gray-400 pt-8">Loading messages...</div>
                )}
                {!loadingMsgs && messages.length === 0 && (
                  <div className="text-center text-sm text-gray-400 pt-8">No messages yet. Say hello!</div>
                )}
                {messages.map((m, i) => {
                  const isMine = m.senderId === myId;
                  const prevMsg = messages[i - 1];
                  const showTime = !prevMsg || new Date(m.createdAt) - new Date(prevMsg.createdAt) > 5 * 60 * 1000;

                  return (
                    <div key={m.messageId}>
                      {showTime && (
                        <div className="text-center text-xs text-gray-400 my-3">
                          {format(new Date(m.createdAt), 'MMM d, h:mm a')}
                        </div>
                      )}
                      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-sm ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                          <div className={`px-4 py-2.5 text-sm leading-relaxed ${
                            isMine
                              ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm'
                              : 'bg-gray-100 text-gray-800 rounded-2xl rounded-tl-sm'
                          }`}>
                            {m.content}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="px-4 py-3.5 border-t bg-white flex items-center gap-2">
                <input
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder={`Message ${activeName}…`}
                  className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !draft.trim()}
                  className="bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                >
                  <svg className="w-5 h-5 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
