require('es6-promise').polyfill();
const browser = typeof(window) !== 'undefined';
const qrcodeterminal = !browser ? require('qrcode-terminal') : undefined;
const EventSource = !browser ? require('eventsource') : undefined;

import fetch from 'isomorphic-fetch';
import QRCode from 'qrcode';

import './irma.scss';
import phonePng from './phone.png';
import popupHtml from './popup.html';
import translations from './translations';

export const SessionStatus = {
  Initialized: 'INITIALIZED', // The session has been started and is waiting for the client to connect (scan the QR)
  Connected  : 'CONNECTED',   // The client has retrieved the session request, we wait for its response
  Cancelled  : 'CANCELLED',   // The session is cancelled, possibly due to an error
  Done       : 'DONE',        // The session has completed successfully
  Timeout    : 'TIMEOUT',     // Session timed out
};

const optionsDefaults = {
  method:            'popup',            // Supported methods: 'popup', 'canvas', 'mobile' (only browser), 'console' (only node), 'url' (both)
  element:           'irmaqr',           // ID of the canvas to draw to if method === 'canvas'
  language:          'en',               // Popup language when method === 'popup'
  showConnectedIcon: true,               // When method is 'popup' or 'canvas', replace QR with a phone icon when phone connects
  returnStatus:      SessionStatus.Done, // When the session reaches this status control is returned to the caller
  server:            '',                 // Server URL to fetch the session result from after the session is done
  resultJwt:         false,              // Retrieve signed session result from the irma server
  disableMobile:     false,              // Disable automatic navigation to IRMA app on mobile
};

/**
 * Handle an IRMA session after it has been created at an irma server, given the QR contents
 * to be sent to the IRMA app. This function can (1) draw an IRMA QR, (2) wait for the phone to
 * connect, (3) wait for the session to complete, and (4) retrieve the session result afterwards
 * from the irma server. 
 * Returns a promise that can return at any of these phases, depending on the options.
 * Compatible with both `irma server` cli and Go `irmaserver` library.
 * @param {Object} qr
 * @param {Object} options
 */
export function handleSession(qr, options = {}) {
  const token = qr.u.split('/').pop();
  let state = { qr, done: false };

  // When we start the session is always in the Initialized state, but the state at which
  // we return control to the caller depends on the options. See the function comment.
  // We implement this by 4 chained promises, each of which can "break out of the chain" by
  // setting state.done to true, after which all remaining then's return immediately.

  return Promise.resolve()
    // 1st phase: session started, phone not yet connected
    .then(() => {
      log('Session started', state.qr);
      state.options = processOptions(options);
      state.method = state.options.method;
      switch (state.method) {
        case 'url':
          state.done = true;
          return QRCode.toDataURL(JSON.stringify(state.qr));
        case 'mobile':
          startMobileSession(qr, state.options.userAgent);
          break;
        case 'popup':
          setupPopup(qr, state.options.language);
          // fallthrough
        case 'canvas':
          state.canvas = window.document.getElementById(state.options.element);
          if (!state.canvas) return Promise.reject('Specified canvas not found in DOM');
          drawQr(state.canvas, state.qr);
          break;
        case 'console':
          qrcodeterminal.generate(JSON.stringify(state.qr));
          break;
      }

      if (state.options.returnStatus === SessionStatus.Initialized) {
        state.done = true;
        return SessionStatus.Initialized;
      }
      return waitConnected(state.qr.u);
    })

    // 2nd phase: phone connected
    .then((status) => {
      if (state.done) return status;

      log('Session state changed', status, state.qr.u);
      switch (state.method) {
        case 'popup':
          translatePopupElement('irma-text', 'Messages.FollowInstructions', state.options.language);
          // fallthrough
        case 'canvas':
          clearQr(state.canvas, state.options.showConnectedIcon);
          break;
      }

      if (state.options.returnStatus === SessionStatus.Connected) {
        state.done = true;
        return SessionStatus.Connected;
      }
      return waitDone(state.qr.u);
    })

    // 3rd phase: session done
    .then((status) => {
      if (state.done) return status;

      if (state.method === 'popup')
        closePopup();
      if (state.options.server.length === 0) {
        state.done = true;
        return status;
      }
      return fetchCheck(`${state.options.server}/session/${token}/${ state.options.resultJwt ? 'result-jwt' : 'result' }`);
    })

    // 4th phase: handle session result received from irmaserver
    .then((response) => {
      if (state.done) return response;
      return state.options.resultJwt ? response.text() : response.json();
    })

    .catch((err) => {
      log('Error or unexpected status', err);
      if (state.method === 'popup') closePopup();
      throw err;
    });
}

/**
 * Start an IRMA session at an irmaserver.
 * @param {string} server URL to irmaserver at which to start the session
 * @param {Object} request Session request
 * @param {string} method authentication method (supported: undefined, none, token, hmac, publickey)
 * @param {*} key API token or JWT key
 * @param {string} name name of the requestor, only for hmac and publickey mode
 */
export function startSession(server, request, method, key, name) {
  return Promise.resolve()
    .then(() => {
      if (typeof(request) === 'object')
        return method == 'publickey' || method == 'hmac' ? signSessionRequest(request, method, key, name) : JSON.stringify(request);
      else
        return request;
    })
    .then((body) => {
      let headers = {};
      switch (method) {
        case undefined: case 'none':
          headers['Content-Type'] = 'application/json';
          break;
        case 'token':
          headers['Authorization'] = key;
          headers['Content-Type'] = 'application/json';
          break;
        case 'publickey': case 'hmac':
          headers['Content-Type'] = 'text/plain';
          break;
        default:
          throw new Error('Unsupported authentication method');
      }
      return fetchCheck(`${server}/session`, {method: 'POST', headers, body});
    })
    .then((res) => res.json());
}

/**
 * Sign a session request into a JWT, using the HMAC (HS256) or RSA (RS256) signing algorithm.
 * @param {Object} request Session request
 * @param {string} method authentication method (supported: undefined, none, token, hmac, publickey)
 * @param {*} key API token or JWT key
 * @param {string} name name of the requestor, only for hmac and publickey mode
 */
export function signSessionRequest(request, method, key, name) {
  return import(/* webpackChunkName: "jwt" */ 'jsonwebtoken').then(jwt => {
    let type;
    let rrequest;
    if (request.type) {
      type = request.type;
      rrequest = { request };
    } else if (request.request) {
      type = request.request.type;
      rrequest = request;
    }

    if (type !== 'disclosing' && type !== 'issuing' && type !== 'signing')
      throw new Error('Not an IRMA session request');
    if (method !== 'publickey' && method !== 'hmac')
      throw new Error('Unsupported signing method');

    const subjects = { disclosing: 'verification_request', issuing: 'issue_request', signing: 'signature_request' };
    const fields = { disclosing: 'sprequest', issuing: 'iprequest', signing: 'absrequest' };
    const algorithm = method === 'publickey' ? 'RS256' : 'HS256';
    const jwtOptions = { algorithm, issuer: name, subject: subjects[type] };

    return jwt.sign({[ fields[type] ] : rrequest}, key, jwtOptions);
  });
}

/**
 * Poll the status URL of an IRMA server library until it indicates that
 * the IRMA app has connected to it (or that the session is cancelled).
 * @param {string} url
 */
export function waitConnected(url) {
  return waitStatus(url, SessionStatus.Initialized)
    .then((status) => {
      if (status !== SessionStatus.Connected)
        return Promise.reject(status);
      return status;
    });
}

/**
 * Poll the status URL of an IRMA server library until it indicates that the session is done.
 * @param {string} url
 */
export function waitDone(url) {
  return waitStatus(url, SessionStatus.Connected)
    .then((status) => {
      if (status !== SessionStatus.Done)
        return Promise.reject(status);
      return status;
    });
}

function waitStatus(url, status = SessionStatus.Initialized) {
  return new Promise((resolve, reject) => {
    const EvtSource = browser ? window.EventSource : EventSource;
    if (!EvtSource) {
      log('No support for EventSource, fallback to polling');
      return pollStatus(`${url}/status`, status);
    }

    const source = new EvtSource(`${url}/statusevents`);
    source.onmessage = e => {
      source.close();
      resolve(e.data);
    };
    source.onerror = e => {
      log('Received server event error', e);
      source.close();
      reject(e);
    };
  }).catch((e) => {
    log('error in server sent event, falling back to polling', e);
    return pollStatus(`${url}/status`, status);
  });
}

function pollStatus(url, status = SessionStatus.Initialized) {
  return new Promise((resolve, reject) => {
    const poller = (status, resolve) => {
      fetchCheck(url)
        .then((response) => response.json())
        .then((text) => text !== status ? resolve(text) : setTimeout(poller, 500, status, resolve))
        .catch((err) => reject(err));
    };
    poller(status, resolve);
  });
}

const UserAgent = {
  Desktop: 'Desktop',
  Android: 'Android',
  iOS: 'iOS',
};

function processOptions(o) {
  log('Options:', o);
  const options = Object.assign({}, optionsDefaults, o);

  options.userAgent = detectUserAgent();
  if (browser && !options.disableMobile && options.userAgent !== UserAgent.Desktop) {
    if (options.method !== 'mobile')
      log('On mobile; using method mobile instead of ' + options.method);
    options.method = 'mobile';
  }

  switch (options.method) {
    case 'url': break;
    case 'mobile':
      if (options.returnStatus !== SessionStatus.Done)
        throw new Error('On mobile sessions, returnStatus must be Done');
      break;
    case 'popup':
      if (!browser) throw new Error('Cannot use method popup in node');
      if (!(options.language in translations)) throw new Error('Unsupported language, currently supported: ' + Object.keys(translations).join(', '));
      options.element = 'modal-irmaqr';
      options.returnStatus = SessionStatus.Done;
      break;
    case 'canvas':
      if (!browser) throw new Error('Cannot use method canvas in node');
      if (typeof(options.element) !== 'string' || options.element === '')
        throw new Error('canvas method requires `element` to be provided in options');
      break;
    case 'console':
      if (browser) throw new Error('Cannot use console method in browser');
      break;
    default:
      throw new Error('Unsupported method');
  }
  if (typeof(options.server) !== 'string')
    throw new Error('server must be a string (URL)');
  if (options.server.length > 0 && options.returnStatus !== SessionStatus.Done)
    throw new Error('If server option is used, returnStatus option must be SessionStatus.Done');
  if (options.resultJwt && options.server.length === 0)
    throw new Error('resultJwt option was enabled but no server to retrieve result from was provided');
  return options;
}

function handleFetchErrors(response) {
  if (!response.ok) {
    return response.text().then((text) => {
      warn('Server returned error:', text);
      throw new Error(response.statusText);
    });
  }
  return response;
}

function fetchCheck() {
  return fetch
    .apply(null, arguments)
    .then(handleFetchErrors);
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
  ensurePopupInitialized();
  translatePopup(qr.irmaqr, language);
  window.document.getElementById('irma-modal').classList.add('irma-show');
  const cancelbtn = window.document.getElementById('irma-cancel-button');
  cancelbtn.addEventListener('click', function del() {
    fetch(qr.u, {method: 'DELETE'}); // We ignore server errors by not using fetchCheck
    // The popup including the irma-cancel-button element might be reused in later IRMA sessions,
    // so we need to remove this listener. removeEventListener() requires a function reference,
    // which we don't want to have to keep track of outside of setupPopup(), so we do the removing
    // of the listener here inside the listener itself.
    cancelbtn.removeEventListener('click', del);
  });
}

function closePopup() {
  if (!browser || !window.document.getElementById('irma-modal'))
    return;
  window.document.getElementById('irma-modal').classList.remove('irma-show');
}

function ensurePopupInitialized() {
  if (!browser || window.document.getElementById('irma-modal'))
    return;

  const popup = window.document.createElement('div');
  popup.id = 'irma-modal';
  popup.innerHTML = popupHtml;
  window.document.body.appendChild(popup);

  const overlay = window.document.createElement('div');
  overlay.classList.add('irma-overlay');
  window.document.body.appendChild(overlay);

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

function warn() {
  console.warn.apply(console, arguments); // eslint-disable-line no-console
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
  window.document.getElementById(el).innerText = getTranslatedString(id, lang);
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

function startMobileSession(qr, userAgent) {
  const url = 'qr/json/' + encodeURIComponent(JSON.stringify(qr));
  if (userAgent === UserAgent.Android) {
    const intent = 'intent://' + url + '#Intent;package=org.irmacard.cardemu;scheme=cardemu;'
      + 'l.timestamp=' + Date.now() + ';'
      + 'S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dorg.irmacard.cardemu;end';
    log('Navigating:', intent);
    window.location.href = intent;
  } else if (userAgent === UserAgent.iOS) {
    log('Navigating:', 'irma://' + url);
    window.location.href = 'irma://' + url;
  }
}

function detectUserAgent() {
  if (!browser)
    return null;

  // IE11 doesn't have window.navigator, test differently
  // https://stackoverflow.com/questions/21825157/internet-explorer-11-detection
  if (!!window.MSInputMethodContext && !!document.documentMode) {
    log('Detected IE11');
    return UserAgent.Desktop;
  }
  if (/Android/i.test(window.navigator.userAgent)) {
    log('Detected Android');
    return UserAgent.Android;
  } else if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
      // https://stackoverflow.com/questions/9038625/detect-if-device-is-ios
    log('Detected iOS');
    return UserAgent.iOS;
  } else {
      log('Neither Android nor iOS, assuming desktop');
      return UserAgent.Desktop;
  }
}
