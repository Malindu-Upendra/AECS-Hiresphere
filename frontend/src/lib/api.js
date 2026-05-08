import axios from 'axios';
import { fetchAuthSession, signOut } from 'aws-amplify/auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use(async (config) => {
  try {
    const session = await fetchAuthSession({ forceRefresh: false });
    const token = session.tokens?.accessToken?.toString();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {
    await signOut();
    window.location.href = '/login';
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await signOut();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const userApi = {
  createProfile: (data) => api.post('/users/profile', data),
  getMe: () => api.get('/users/me'),
  updateMe: (data) => api.put('/users/me', data),
  getUser: (id) => api.get(`/users/${id}`),
  searchInterviewers: (params) => api.get('/users/interviewers/search', { params }),
};

export const bookingApi = {
  createSlot: (data) => api.post('/bookings/slots', data),
  getSlots: (interviewerId) => api.get(`/bookings/slots/${interviewerId}`),
  createBooking: (data) => api.post('/bookings', data),
  getBookings: (role) => api.get('/bookings', { params: { role } }),
  getBooking: (id) => api.get(`/bookings/${id}`),
  updateBookingStatus: (id, status) => api.patch(`/bookings/${id}/status`, { status }),
  enableSession: (id, enabled) => api.patch(`/bookings/${id}/enable-session`, { enabled }),
};

export const packageApi = {
  createPackage: (data) => api.post('/bookings/packages', data),
  getAllPackages: () => api.get('/bookings/packages/all'),
  getMyPackages: () => api.get('/bookings/packages/mine'),
  togglePackage: (id) => api.patch(`/bookings/packages/${id}/toggle`),
  purchasePackage: (id, data) => api.post(`/bookings/packages/${id}/purchase`, data),
  getMyPurchases: () => api.get('/bookings/purchases'),
  redeemPurchase: (purchaseId, data) => api.post(`/bookings/purchases/${purchaseId}/redeem`, data),
};

export const messagingApi = {
  sendMessage: (data) => api.post('/messages', data),
  getConversation: (otherUserId) => api.get(`/messages/${otherUserId}`),
  getConversations: () => api.get('/messages'),
};

export const sessionApi = {
  getStatus: (bookingId) => api.get(`/sessions/${bookingId}/status`),
};

export const taskApi = {
  getTasks: (params) => api.get('/tasks', { params }),
  getTask: (id) => api.get(`/tasks/${id}`),
  createTask: (data) => api.post('/tasks', data),
};

export const submissionApi = {
  upload: (formData) => api.post('/submissions/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  getDownloadUrl: (id) => api.get(`/submissions/${id}/download`),
  getMySubmissions: () => api.get('/submissions'),
  getTaskSubmissions: (taskId) => api.get(`/submissions/task/${taskId}`),
  getForReview: () => api.get('/submissions/for-review'),
  annotate: (id, annotation) => api.patch(`/submissions/${id}/annotate`, { annotation }),
  evaluate: (id, evaluation) => api.patch(`/submissions/${id}/evaluate`, { evaluation }),
};
