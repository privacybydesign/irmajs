# irmajs

`irmajs` is a Javascript client of the RESTful JSON API offered by the [`irma server`](https://github.com/privacybydesign/irmago/tree/master/irma). It  allows you to use the `irma server` to:

 * Verify IRMA attributes. You specify which attributes, the library handles the user interaction and the communication with the `irma server` and the [IRMA app](https://github.com/privacybydesign/irma_mobile)).
 * Issue IRMA attributes.
 * Create IMRA attribute-based signatures: signature on a string to which IRMA attributes are verifiably attached.

## Building

Compile the library:

    npm build

This writes `irma.js` to the `dist` folder, which you can include in your website in a `<script>` tag

## Browser example

If you have included `irma.js` (e.g. `<script src="irma.js" defer></script>`) you can start an IRMA disclosure session as follows:

```javascript
const request = {
    'type': 'disclosing',
    'content': [{
        'label': 'Over 21',
        'attributes': [ 'irma-demo.MijnOverheid.ageLower.over18' ]
    }]
};

irma.startSession(urlToServer, request)
    .then(qr => irma.handleSession(server, qr, {method: 'popup', language: 'en'}))
    .then(result => console.log('Done', result));
```

This assumes you have an `irma server` listening at `urlToServer` that accepts unauthenticated requests.

For complete examples, see the `examples` folder.
