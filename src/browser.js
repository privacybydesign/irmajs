import './style.scss';
import './irma.scss';
import './irma.png';
import popupHtml from './popup.html';
import { startSession, handleSession } from './index.js';

const btn = document.createElement('button');
btn.innerHTML = 'Click me';
document.body.appendChild(btn);

// const img = document.createElement('img');
// img.src = logo;
// img.width = 200;
// document.body.appendChild(img);

var request = {
  'type': 'disclosing',
  'content': [{
    'label': 'Over 21',
    'attributes': [ 'irma-demo.MijnOverheid.root.BSN' ]
  }]
};

const popup = document.createElement('div');
popup.id = 'irma-modal';
popup.innerHTML = popupHtml;
document.body.appendChild(popup);

const overlay = document.createElement('div');
overlay.classList.add('irma-overlay');
document.body.appendChild(overlay);

/* eslint-disable no-console */
btn.addEventListener('click', () => {
  const server = 'http://localhost:48680';
  startSession(server, request)
    .then((qr) => handleSession(server, qr))
    .then((result) => console.log('Done', result))
    .catch((err) => console.log(err));
});

document.getElementById('test').addEventListener('click', () => {
  const el = document.getElementById('irma-modal');
  el.classList.add('irma-show');
});

