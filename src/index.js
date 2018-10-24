var QRCode = require('qrcode');

const fetch = window.fetch;

export const SessionStatus = {
  Initialized: 'INITIALIZED', // The session has been started and is waiting for the client
  Connected  : 'CONNECTED',   // The client has retrieved the session request, we wait for its response
  Cancelled  : 'CANCELLED',   // The session is cancelled, possibly due to an error
  Done       : 'DONE',        // The session has completed successfully
  Timeout    : 'TIMEOUT',     // Session timed out
};

const optionsDefaults = {
  method: 'canvas',
  element: 'irmaqr',
};

function log(...msg) {
  console.log(msg); // eslint-disable-line no-console
}

export function handleSession(server, qr, options = {}) {
  const token = qr.u;
  return renderQr(server, qr, options)
    .then(() => fetch(`${server}/session/${token}/result`))
    .then((res) => res.json());
}

export function renderQr(server, qr, options = {}) {
  const opts = Object.assign({}, optionsDefaults, options);
  const state = {
    qr,
    server,
    token: qr.u,
    canvas: document.getElementById(opts.element),
    options: opts,
  };

  return Promise.resolve(state)
    .then((state) => {
      state.pollUrl = `${state.server}/session/${state.qr.u}/status`;
      state.qr.u = `${state.server}/irma/${state.token}`;
      log(state.qr);
      QRCode.toCanvas(state.canvas, JSON.stringify(state.qr), (error) => { if (error) throw error; });
      return Promise.all([state, waitConnected(state.pollUrl)]);
    })
    .then(([state, status]) => {
      log('2nd', state.pollUrl, status);
      if (status !== SessionStatus.Connected)
        return Promise.reject(status);
      state.canvas.getContext('2d').clearRect(0, 0, state.canvas.width, state.canvas.height);
      return waitDone(state.pollUrl);
    });
}

export function startSession(server, request) {
  return fetch(`${server}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  }).then((res) => res.json());
}

function waitConnected(url) {
  return pollStatus(url, SessionStatus.Initialized);
}

function waitDone(url) {
  return pollStatus(url, SessionStatus.Connected);
}

function pollStatus(url, status = SessionStatus.Initialized) {
  return new Promise((resolve, reject) => {
    const poller = (status, resolve) => {
      fetch(url)
        .then((response) => response.json())
        .then((text) => text !== status ? resolve(text) : setTimeout(poller, 500, status, resolve))
        .catch((err) => reject(err));
    };
    poller(status, resolve);
  });
}
