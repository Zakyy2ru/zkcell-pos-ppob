import { io } from 'socket.io-client';

const SOCKET_HOST = window.location.hostname || 'localhost';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || `http://${SOCKET_HOST}:5000`;

const socket = io(SOCKET_URL, {
  autoConnect: true,
});

export default socket;