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

// Rooms are combined so a socket in several of them receives the event once.
function emit(rooms, event, payload) {
  const list = [].concat(rooms).filter(Boolean);
  if (io && list.length) io.to(list).emit(event, payload);
}

module.exports = { setIo, getIo, emit, userRoom, chatRoom, STAFF_ROOM };
