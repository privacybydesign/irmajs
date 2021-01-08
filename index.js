const IrmaCore      = require('@privacybydesign/irma-core');
const Client        = require('@privacybydesign/irma-client');
const ServerSession = require('@privacybydesign/irma-client/server-session');
const ServerState   = require('@privacybydesign/irma-client/server-state');
const Console       = require('@privacybydesign/irma-console');
const Popup         = require('@privacybydesign/irma-popup');
const QRCode        = require('qrcode');

const browser = typeof(window) !== 'undefined';

if (browser) require('@privacybydesign/irma-css');

const SessionStatus = {
  Initialized: 'INITIALIZED', // The session has been started and is waiting for the client to connect (scan the QR)
  Connected:   'CONNECTED',   // The client has retrieved the session request, we wait for its response
  Cancelled:   'CANCELLED',   // The session is cancelled, possibly due to an error
  Done:        'DONE',        // The session has completed successfully
  Timeout:     'TIMEOUT',     // Session timed out
};

/* eslint-disable no-console */
const optionsDefaults = {
  language:          'en',               // Popup language when method === 'popup'
  resultJwt:         false,              // Retrieve signed session result from the irma server
  legacyResultJwt:   false,              // Retrieve legacy (i.e. irma_api_server compatible from /getproof) JWT format
};
/* eslint-enable no-console */

function parseError(e) {
  switch (e) {
    case 'TimedOut':
      throw SessionStatus.Timeout;
    case 'Cancelled':
    case 'Aborted':
      throw SessionStatus.Cancelled;
    default:
      throw e;
  }
}

let logEnabled = false;

/**
 * Change whether or not the irmajs library logs to console.
 */
function setLoggingState(enabled) {
  logEnabled = enabled;
}

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
function handleSession(qr, options = {}) {
  return Promise.resolve().then(() => {
    // Option url does not involve any session management, so return immediately
    if (options.method === 'url')
      return QRCode.toDataURL(JSON.stringify(qr));

    let irmaCoreOptions = {
      session: {
        start: false,
        mapping: {
          sessionPtr: () => qr,
          sessionToken: () => options.token
        },
        result: false,
      },
      debugging: logEnabled,
      language:  options.language || optionsDefaults.language,
    };

    if (options.server) {
      const jwtType = options.legacyResultJwt ? 'getproof' : 'result-jwt';
      const endpoint = options.resultJwt || options.legacyResultJwt ? jwtType : 'result';
      irmaCoreOptions.session.url = options.server;
      irmaCoreOptions.session.result = {
        url: (o, {sessionToken}) => `${o.url}/session/${sessionToken}/${endpoint}`,
        parseResponse: endpoint === 'result' ? r => r.json() : r => r.text()
      };
    }

    const irmaCore = new IrmaCore(irmaCoreOptions);
    irmaCore.use(Client);

    switch (options.method) {
      case 'canvas':
        throw new Error('Method canvas is not supported anymore, please switch to popup mode or use irma-frontend-packages.');
      case 'console':
        irmaCore.use(Console);
        break;
      case 'mobile':
        console.info('Method mobile has been fully integrated in the option popup');
        // Fall through
      case 'popup':
      case undefined:
        if (!browser)
          throw new Error('Method popup is only available in browser environments');
        irmaCore.use(Popup);
        break;
      default:
        throw new Error(`Specified method ${options.method} unknown`);
    }

    return irmaCore.start()
    .then(result => {
      if (result)
        return result;
      return SessionStatus.Done;
    })
    .catch(parseError);
  })
}

/**
 * Start an IRMA session at an irmaserver.
 * @param {string} server URL to irmaserver at which to start the session
 * @param {Object} request Session request
 * @param {string} method authentication method (supported: undefined, none, token, hmac, publickey)
 * @param {*} key API token or JWT key
 * @param {string} name name of the requestor, only for hmac and publickey mode
 */
function startSession(server, request, method, key, name) {
  let options = {
    url: server,
    debugging: logEnabled,
    mapping: {
      sessionPtr: r => r, // In this way also the sessionToken is included in the return value.
      sessionToken: () => undefined,
    }
  };

  if (typeof(request) === 'object') {
    if (['publickey', 'hmac'].includes(method)) {
      request = signSessionRequest(request, method, key, name);
    } else {
      request = JSON.stringify(request);
    }
  }

  options.start = {
    url: o => `${o.url}/session`,
    body: request,
    method: 'POST',
    headers: {},
    parseResponse: r => r.json(),
  };

  switch(method) {
    case 'token':
      options.start.headers['Authorization'] = key;
      // Fallthrough
    case undefined:
    case 'none':
      options.start.headers['Content-Type'] = 'application/json';
      break;
    case 'publickey':
    case 'hmac':
      options.start.headers['Content-Type'] = 'text/plain';
      break;
    default:
      throw new Error(`Method ${method} is not supported right now`);
  }

  const serverSession = new ServerSession(options);
  return serverSession.start();
}

/**
 * Sign a session request into a JWT, using the HMAC (HS256) or RSA (RS256) signing algorithm.
 * @param {Object} request Session request
 * @param {string} method authentication method (supported: undefined, none, token, hmac, publickey)
 * @param {*} key API token or JWT key
 * @param {string} name name of the requestor, only for hmac and publickey mode
 */
function signSessionRequest(request, method, key, name) {
  return import(/* webpackChunkName: "jwt" */ '@privacybydesign/irma-jwt').then(IrmaJwt => {
    const irmaJwt = new IrmaJwt(method, {
      secretKey: key,
      iss: name,
    });
    return irmaJwt.signSessionRequest(request);
  });
}

/**
 * Poll the status URL of an IRMA server until it indicates that
 * the status is no longer Initialized, i.e. Connected or Done. Rejects
 * on other states (Cancelled, Timeout).
 * @param {string} url
 */
function waitConnected(url) {
  return waitStatus(url, SessionStatus.Initialized, [SessionStatus.Connected, SessionStatus.Done]);
}

/**
 * Poll the status URL of an IRMA server until it indicates that the status
 * has changed from Connected to Done. Rejects on any other state.
 * @param {string} url
 */
function waitDone(url) {
  return waitStatus(url, SessionStatus.Initialized, [SessionStatus.Done])
}

function waitStatus(url, startingState, waitForStates) {
  const serverState = new ServerState(url, {
    serverSentEvents: {
      url:        o => `${o.url}/statusevents`,
      timeout:    2000,
    },

    polling: {
      url:        o => `${o.url}/status`,
      interval:   500,
      startState: startingState
    }
  });
  return new Promise(
    (resolve, reject) => {
      serverState.observe((status) => {
        if (waitForStates.includes(status))
          return resolve(status);
      }, reject);
    }
  ).finally(() => serverState.close());
}

module.exports = {
  SessionStatus,
  handleSession,
  startSession,
  signSessionRequest,
  waitConnected,
  waitDone,
  setLoggingState,
};
