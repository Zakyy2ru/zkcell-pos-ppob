import axios from 'axios';

const API_HOST = window.location.hostname || 'localhost';

const api = axios.create({
  baseURL: `http://${API_HOST}:5000/api`,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('zkcell_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const formatRupiah = (amount) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  })
    .format(amount || 0)
    .replace('IDR', 'Rp')
    .replace(/\s+/g, '');
};

export default api;