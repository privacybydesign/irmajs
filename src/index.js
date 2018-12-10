import QRCode from 'qrcode';
import fetch from '@brillout/fetch';

import './irma.scss';
import './irma.png';
import popupHtml from './popup.html';
import translations from './translations';

export const SessionStatus = {
  Initialized: 'INITIALIZED', // The session has been started and is waiting for the client
  Connected  : 'CONNECTED',   // The client has retrieved the session request, we wait for its response
  Cancelled  : 'CANCELLED',   // The session is cancelled, possibly due to an error
  Done       : 'DONE',        // The session has completed successfully
  Timeout    : 'TIMEOUT',     // Session timed out
};

const optionsDefaults = {
  method: 'popup',
  element: 'irmaqr',
  language: 'en',
};

const document = window ? window.document : undefined;

export function handleSession(server, qr, options = {}) {
  const token = qr.u;
  return renderQr(server, qr, options)
    .then(() => {
      if (options.method === 'popup')
        closePopup();
      return fetch(`${server}/session/${token}/result`);
    })
    .then((res) => res.json());
}

export function renderQr(server, qr, options = {}) {
  const opts = Object.assign({}, optionsDefaults, options);
  let state = {
    qr,
    server,
    token: qr.u,
    options: opts,
  };
  if (options.method === 'popup')
    ensurePopupInitialized(); // TODO: Moving this down breaks the QR?!
  if (document)
    state.canvas = document.getElementById(opts.element);

  return Promise.resolve()
    .then(() => {
      state.pollUrl = `${state.server}/irma/${state.token}/status`;
      state.qr.u = `${state.server}/irma/${state.token}`;
      log(state.qr);
      if (options.method === 'popup') {
        translatePopup(qr.irmaqr, state.options.language);
        document.getElementById('irma-modal').classList.add('irma-show');
        // TODO remove earlier listeners
        document.getElementById('irma-cancel-button').addEventListener('click', () => {
          fetch(`${state.server}/irma/${state.token}`, {method: 'DELETE'});
        });
      }
      QRCode.toCanvas(state.canvas,
        JSON.stringify(state.qr),
        {width: '230', margin: '1'},
        (error) => { if (error) throw error; }
      );
      return waitConnected(state.pollUrl);
    })
    .then((status) => {
      log('2nd', state.pollUrl, status);
      if (status !== SessionStatus.Connected) {
        if (options.method === 'popup')
          closePopup();
        return Promise.reject(status);
      }
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

export function waitConnected(url) {
  return pollStatus(url, SessionStatus.Initialized);
}

export function waitDone(url) {
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

function closePopup() {
  if (!document || !document.getElementById('irma-modal'))
    return;
  document.getElementById('irma-modal').classList.remove('irma-show');
}

function ensurePopupInitialized() {
  if (!document || document.getElementById('irma-modal'))
    return;

  const popup = document.createElement('div');
  popup.id = 'irma-modal';
  popup.innerHTML = popupHtml;
  document.body.appendChild(popup);

  const overlay = document.createElement('div');
  overlay.classList.add('irma-overlay');
  document.body.appendChild(overlay);

  // If we add these elements and then immediately add a css class to trigger our css animations,
  // adding the elements and the css classes get bundled up and executed simultaneously,
  // preventing the css animation from being shown. Accessing offsetHeight forces a reflow in between.
  // https://stackoverflow.com/questions/24148403/trigger-css-transition-on-appended-element
  // https://stackoverflow.com/questions/21664940/force-browser-to-trigger-reflow-while-changing-css
  void(popup.offsetHeight); // void prevents Javascript optimizers from throwing away this line
}

function log(...msg) {
  console.log(msg); // eslint-disable-line no-console
}

const sessionTypeMap = {
  disclosing: 'Verify',
  issuing: 'Issue',
  signing: 'Sign'
};

function translatePopup(type, lang) {
  translatePopupElement('irma-cancel-button', 'Common.Cancel', lang);
  translatePopupElement('irma-title', sessionTypeMap[type] + '.Title', lang);
  translatePopupElement('irma-text', sessionTypeMap[type] + '.Body', lang);
}

function translatePopupElement(el, id, lang) {
  document.getElementById(el).innerText = getTranslatedString(id, lang);
}

function getTranslatedString(id, lang) {
  var parts = id.split('.');
  var res = translations[lang];
  for (var part in parts) {
      if (res === undefined) break;
      res = res[parts[part]];
  }

  if (res === undefined) {
      res = translations[optionsDefaults.language];
      for (part in parts) {
          if (res === undefined) break;
          res = res[parts[part]];
      }
  }

  if (res === undefined) return '';
  else return res;
}
