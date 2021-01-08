_Only use this package for backwards compatibility reasons. If you are new to IRMA, please use the
[`irma-frontend-packages`](https://github.com/privacybydesign/irma-frontend-packages) instead._

# irmajs

`irmajs` is a Javascript client of the RESTful JSON API offered by the [`irma server`](https://github.com/privacybydesign/irmago/tree/master/irma).
It allows you to use the `irma server` to:

 * Verify IRMA attributes. You specify which attributes, the library handles the user interaction and the communication
   with the `irma server` and the [IRMA app](https://github.com/privacybydesign/irma_mobile)).
 * Issue IRMA attributes.
 * Create IMRA attribute-based signatures: signature on a string to which IRMA attributes are verifiably attached.

`irmajs` supports all major browsers (Firefox, Chrome, Safari, Edge, Internet Explorer 11).

## Deprecated API features
Due to technical changes in IRMA, we had to make breaking changes when introducing version 0.2.0.
All changes are related to the function call `handleSession`.
* Method `canvas` is not supported anymore. Please use the module `irma-frontend` instead or make
  your own composition of plugins and layouts using `irma-core`.
  This also means the canvas related options `element` and `showConnectedIcon` are deprecated.
* Method `mobile` has the same behaviour as method `popup` now. On mobile devices, the popup
  mode automatically detects whether a mobile device is used and then shows the user the option to open
  the IRMA app installed on the mobile device itself. It is now an explicit choice, so users can also get
  a QR on mobile devices instead (useful for tablets).
* The option `disableMobile` is not useful anymore and therefore deprecated. This module does not have
  automatic redirects to other apps anymore without explicit user interaction.
* Because the explicit methods for mobile devices are deprecated, the undocumented exported function
  `detectUserAgent` and the undocumented exported struct `UserAgent` are also deprecated. An explicit
  distinction based on user agent is not necessary anymore. This is all handled internally now.
* The option `returnStatus` is deprecated. Instead you can use the functions `waitConnected` and `waitDone`
  to detect yourself whether the session reached a certain status.

If you experience problems concerning the backwards compatibility other than the ones mentioned above,
please contact us. It might be something we were not aware of. Then we can maybe fix it.

## Documentation

Technical documentation of `irmajs` can be found at [irma.app/docs](https://irma.app/docs/irmajs).

## Building

Compile the library:

    npm install
    npm run build

This writes `irma.js` and `irma.node.js` to the `dist` folder. `irma.js` is the browser variant,
which you can include in your website in a `<script>` tag. `irma.node.js` is the library variant
for usage in node.js. To reduce the module size, the JWT support is split off in the separate files
`jwt.js` and `vendors~jwt.js`. When you want to use the function `signSessionRequest`, these
files must be available in the same directory as `irma.js` or `irma.node.js`.

## Code sample for browsers

If you have included `irma.js` (e.g. `<script src="irma.js" defer></script>`) you can start an IRMA disclosure session as follows:

```javascript
const request = {
  '@context': 'https://irma.app/ld/request/disclosure/v2',
  'disclose': [
    [
      [ 'irma-demo.MijnOverheid.ageLower.over18' ]
    ]
  ]
};

irma.startSession(server, request)
    .then(({ sessionPtr, token }) => irma.handleSession(sessionPtr, {server, token}))
    .then(result => console.log('Done', result));
```

The example assumes you have an `irma server` that is configured to accept unauthenticated session requests listening
at the URL indicated by `server`. More information about the format of session requests can be found in
the [documentation](https://irma.app/docs/session-requests/).

## Examples

For complete examples, see the `examples` folder. To make the examples work, first perform the [building steps](#building).

### Browser example
After building, you can simply run the browser example by hosting the `examples/browser` directory using an HTTP server.

In case you don't have tooling to run an HTTP server, you can use the Node tool `http-server`.
```bash
npm install -g http-server
```

Then you can start the example by doing:
```bash
http-server ./examples/browser
```

### Node example
After building, you can simply run the Node example by doing:
```bash
cd examples/node
npm install
npm run start
```
