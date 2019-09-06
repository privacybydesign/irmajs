const irma = require('@privacybydesign/irmajs');

const server = 'http://localhost:8088';
const request = {
  '@context': 'https://irma.app/ld/request/disclosure/v2',
  'disclose': [
    [
      [ 'irma-demo.MijnOverheid.ageLower.over18' ]
    ]
  ]
};

irma.startSession(server, request)
  .then(({ sessionPtr, token }) => irma.handleSession(sessionPtr, {server, token, method: 'console'}))
  .then(result => console.log('Done', result));
