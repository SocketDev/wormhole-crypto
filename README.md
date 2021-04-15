# wormhole-crypto [![ci][ci-image]][ci-url] [![npm][npm-image]][npm-url] [![downloads][downloads-image]][downloads-url] [![javascript style guide][standard-image]][standard-url]

[ci-image]: https://img.shields.io/github/workflow/status/SocketDev/wormhole-crypto/ci/master
[ci-url]: https://github.com/SocketDev/wormhole-crypto/actions
[npm-image]: https://img.shields.io/npm/v/wormhole-crypto.svg
[npm-url]: https://npmjs.org/package/wormhole-crypto
[downloads-image]: https://img.shields.io/npm/dm/wormhole-crypto.svg
[downloads-url]: https://npmjs.org/package/wormhole-crypto
[standard-image]: https://img.shields.io/badge/code_style-standard-brightgreen.svg
[standard-url]: https://standardjs.com

### Streaming encryption for Wormhole.app, based on [Encrypted Content-Encoding for HTTP (RFC 8188)](https://tools.ietf.org/html/rfc8188)

This package is used by [Wormhole.app](https://wormhole.app).

## Install

```bash
npm install wormhole-crypto
```

## Usage

Here's a quick example of how to use this package to turn a plaintext WHATWG
readable stream into an encrypted stream.

```js
import { Keychain } from 'wormhole-crypto'

// Create a new keychain. Since no arguments are specified, the key and salt
// are generated.
const keychain = new Keychain()

// Get a WHATWG stream somehow, from fetch(), from a Blob(), etc.
const stream = getStream()

// Create an encrypted version of that stream
const encryptedStream = await keychain.encryptStream(stream)

// Normally you'd now use `encryptedStream`, e.g. in fetch(), etc.
// However, for this example, we'll just decrypt the stream immediately
const plaintextStream = await keychain.decryptStream(encryptedStream)

// Now, you can use `plaintextStream` and it will be identical to if you had
// used `stream`.
```

## API

### `keychain = new Keychain([[key], salt])`

Create a new keychain.

#### `key`

Type: `Uint8Array | string | null`
Default: `null`

The main key. This should be 16 bytes in length. If a `string` is given,
then it should be a base64-encoded string. If the argument is `null`, then a
key will be generated.

#### `salt`

Type: `Uint8Array | string | null`
Default: `null`

The salt. This should be 16 bytes in length. If a `string` is given,
then it should be a base64-encoded string. If this argument is `null`, then a
key will be generated.

### `keychain.key`

Type: `Uint8Array`

The main key.

### `keychain.keyB64`

Type: `string`

The main key as a base64-encoded string.

### `keychain.salt`

Type: `Uint8Array`

The salt.

### `keychain.saltB64`

Type: `string`

The salt as a base64-encoded string.

### `keychain.authToken()`

Type: `Function`
Returns: `Promise[Uint8Array]`

### `keychain.authTokenB64()`

Type: `Function`
Returns: `Promise[string]`

### `keychain.authHeader()`

Type: `Function`
Returns: `Promise[string]`

### `keychain.setAuthToken(authToken)`

Type: 'Function`
Returns: `undefined`

#### `authToken`

Type: `Uint8Array | string | null`
Default: `null`

The authentication token. This should be 16 bytes in length. If a `string` is
given, then it should be a base64-encoded string. If this argument is `null`,
then a key will be generated.

### `encryptStream(stream)`

Type: `Function`
Returns: `Promise[ReadableStream]`

#### `stream`

Type: `ReadableStream`

### `decryptStream(encryptedStream)`

Type: `Function`
Returns: `Promise[ReadableStream]`

#### `encryptedStream`

Type: `ReadableStream`

### `encryptMeta(meta)`

Type: `Function`
Returns: `Promise[Uint8Array]`

#### `meta`

Type: `Uint8Array`

### `decryptMeta(encryptedMeta)`

Type: `Function`
Returns: `Promise[Uint8Array]`

#### `encryptedMeta`

Type: `Uint8Array`

## License

MIT. Copyright (c) [Socket Inc](https://socket.dev)
