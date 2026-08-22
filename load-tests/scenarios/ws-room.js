/**
 * P083 – Load test: WebSocket room join under concurrent load.
 *
 * Note: this deliberately does NOT send draw-delta/commit messages over the
 * WebSocket — verified against the current server (lib/server/
 * wsConnectionHandler.ts) that client-initiated actions moved to REST POST
 * endpoints a while back; the WS connection today is server -> client
 * broadcast plus a narrow peer-relay path (fullsync-request/fullsync,
 * pong). What's actually worth load-testing on this connection is what
 * every client does on every join: the `welcome` handshake and the
 * `presence` broadcast fan-out as room population grows.
 */
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { WS_URL, SEED_ROOM_ID } from '../k6.config.js';

export const options = {
  vus: 20,
  duration: '2m',
  thresholds: {
    ws_connecting: ['p(95)<500'],
    // Each VU deliberately holds its socket open for 5000ms (see the
    // setTimeout below) before closing it, so ws_session_duration is
    // always >=5000ms by design — the threshold checks that the server
    // isn't adding meaningful overhead on top of that, not that sessions
    // are short.
    ws_session_duration: ['p(95)<5500'],
  },
};

export default function () {
  const url = `${WS_URL}?room=${SEED_ROOM_ID}&name=LoadTestUser&color=%237c6eff`;
  let gotWelcome = false;
  let gotPresence = false;

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      socket.setTimeout(() => socket.close(), 5000);
    });

    socket.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.type === 'welcome') {
        gotWelcome = true;
        // Respond to the server's heartbeat to keep the connection alive
        // for the duration of this VU iteration, same as a real client.
      } else if (msg.type === 'presence') {
        gotPresence = true;
      } else if (msg.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong' }));
      }
    });

    socket.on('error', (e) => {
      console.error(`WS error: ${e.error()}`);
    });
  });

  check(res, { 'WS connection established (101)': (r) => r && r.status === 101 });
  check(null, {
    'received welcome message': () => gotWelcome,
    'received presence message': () => gotPresence,
  });

  sleep(1);
}
