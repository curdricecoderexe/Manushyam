// Holds the Socket.IO server once it is attached (server.js), so services can push events.
// Without one (tests of the REST API, scripts) every emit is a no-op.
let io = null;

function setIo(server) {
  io = server;
}

function getIo() {
  return io;
}

const userRoom = (id) => `user:${id}`;
const chatRoom = (id) => `chat:${id}`;
const STAFF_ROOM = "staff";
const ADMIN_ROOM = "admins";

// Rooms are combined so a socket in several of them receives the event once.
function emit(rooms, event, payload) {
  const list = [].concat(rooms).filter(Boolean);
  if (io && list.length) io.to(list).emit(event, payload);
}

// Removes every socket from a room whose user no longer passes `allowed(user)` (e.g. other staff
// after a colleague accepts a chat), so they stop receiving its messages.
async function evictFromRoom(room, allowed) {
  if (!io) return;
  const sockets = await io.in(room).fetchSockets();
  for (const s of sockets) if (!s.data?.user || !allowed(s.data.user)) s.leave(room);
}

module.exports = { setIo, getIo, emit, evictFromRoom, userRoom, chatRoom, STAFF_ROOM, ADMIN_ROOM };
