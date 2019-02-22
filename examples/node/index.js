const irma = require('@privacybydesign/irmajs');

const server = 'http://localhost:8088';
const request = {
  'type': 'disclosing',
  'content': [{
    'label': 'Over 18',
    'attributes': [ 'irma-demo.MijnOverheid.ageLower.over18' ]
  }]
};

irma.startSession(server, request)
  .then(({ sessionPtr, token }) => irma.handleSession(sessionPtr, {server, token, method: 'console'}))
  .then(result => console.log('Done', result));
