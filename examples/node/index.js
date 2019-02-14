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
  .then(qr => irma.handleSession(qr, {server, method: 'console'}))
  .then(result => console.log('Done', result));
