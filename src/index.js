import QRCode from 'qrcode';
import fetch from '@brillout/fetch';

import './irma.scss';
import './irma.png';
import phonePng from './phone.png';
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
  showConnectedIcon: true,
};

// In the browser we fetch window.EventSource only when we need it; by then a polyfill might have defined it
const EventSource = defined(window) ? undefined : require('eventsource').default;
const document = defined(window) ? window.document : undefined;

/**
 * Handle an IRMA session at an irmaserver, returning the session result
 * when done. This function assumes the session has already been created
 * (e.g. using startSession()).
 * @param {string} server URL to irmaserver
 * @param {Object} qr
 * @param {Object} options
 */
export function handleSession(server, qr, options = {}) {
  const token = qr.u.split('/').pop();
  return renderQr(qr, options)
    .then(() => {
      if (options.method === 'popup')
        closePopup();
      return fetch(`${server}/session/${token}/result`);
    })
    .then((res) => res.json());
}

/**
 * Render a session QR, returning when the session is complete.
 * Compatible with both irmaserver and library.
 * @param {Object} qr
 * @param {Object} options
 */
export function renderQr(qr, options = {}) {
  const opts = Object.assign({}, optionsDefaults, options);
  let state = {
    qr,
    options: opts,
  };
  if (state.options.method === 'popup')
    ensurePopupInitialized(); // TODO: Moving this down breaks the QR?!
  if (defined(document))
    state.canvas = document.getElementById(opts.element);

  return Promise.resolve()
    .then(() => {
      log(state.qr);
      if (state.options.method === 'popup')
        setupPopup(qr, state.options.language);
      drawQr(state.canvas, state.qr);
      return waitConnected(state.qr.u);
    })
    .then((status) => {
      log('Session state changed', status, state.qr.u);
      if (status !== SessionStatus.Connected) {
        if (state.options.method === 'popup')
          closePopup();
        return Promise.reject(status);
      }
      if (state.options.method === 'popup')
        translatePopupElement('irma-text', 'Messages.FollowInstructions', state.options.language);
      clearQr(state.canvas, state.options.showConnectedIcon);
      return waitDone(state.qr.u);
    });
}

/**
 * Start an IRMA session at an irmaserver.
 * @param {string} server URL to irmaserver at which to start the session
 * @param {Object} request Session request
 */
export function startSession(server, request) {
  return fetch(`${server}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  }).then((res) => res.json());
}

/**
 * Poll the status URL of an IRMA server library until it indicates that
 * the IRMA app has connected to it (or that the session is cancelled).
 * @param {string} url
 */
export function waitConnected(url) {
  return waitStatus(url, SessionStatus.Initialized);
}

/**
 * Poll the status URL of an IRMA server library until it indicates that the session is done.
 * @param {string} url
 */
export function waitDone(url) {
  return waitStatus(url, SessionStatus.Connected);
}

function waitStatus(url, status = SessionStatus.Initialized) {
  let usingServerEvents = false;
  return new Promise((resolve, reject) => {
    const EvtSource = defined(window) ? window.EventSource : EventSource;
    if (!defined(EvtSource)) {
      log('No support for EventSource, fallback to polling');
      return pollStatus(`${url}/status`, status);
    }

    const source = new EvtSource(`${url}/statusevents`);
    source.onmessage = e => {
      usingServerEvents = true;
      log('Received server event', e);
      source.close();
      resolve(e.data);
    };
    source.onerror = e => {
      log('Received server event error', e);
      source.close();
      reject(e);
    };
  }).catch((e) => {
    if (!usingServerEvents) {
      log('error in server sent event, falling back to polling');
      return pollStatus(`${url}/status`, status);
    } else {
      throw e;
    }
  });
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

function drawQr(canvas, qr) {
  QRCode.toCanvas(canvas,
    JSON.stringify(qr),
    {width: '230', margin: '1'},
    (error) => { if (error) throw error; }
  );
}

function clearQr(canvas, showConnectedIcon) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (showConnectedIcon) {
    const scale = window.devicePixelRatio;
    const canvasSize = 230;
    const imgWidth = 79;
    const imgHeight = 150;
    canvas.width = canvasSize * scale;
    canvas.height = canvasSize * scale;
    ctx.scale(scale, scale);
    const img = new Image();
    img.onload = () => ctx.drawImage(img, (canvasSize-imgWidth)/2, (canvasSize-imgHeight)/2, imgWidth, imgHeight);
    img.src = phonePng;
  }
}

function setupPopup(qr, language) {
  translatePopup(qr.irmaqr, language);
  document.getElementById('irma-modal').classList.add('irma-show');
  const cancelbtn = document.getElementById('irma-cancel-button');
  cancelbtn.addEventListener('click', function del() {
    fetch(qr.u, {method: 'DELETE'});
    // The popup including the irma-cancel-button element might be reused in later IRMA sessions,
    // so we need to remove this listener. removeEventListener() requires a function reference,
    // which we don't want to have to keep track of outside of setupPopup(), so we do the removing
    // of the listener here inside the listener itself.
    cancelbtn.removeEventListener('click', del);
  });
}

function closePopup() {
  if (!defined(document) || !document.getElementById('irma-modal'))
    return;
  document.getElementById('irma-modal').classList.remove('irma-show');
}

function ensurePopupInitialized() {
  if (!defined(document) || document.getElementById('irma-modal'))
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

function log() {
  console.log.apply(console, arguments); // eslint-disable-line no-console
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

function defined(o) {
  return typeof(o) !== 'undefined';
}