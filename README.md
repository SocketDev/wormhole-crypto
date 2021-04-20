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

### `new Keychain([key, [salt]])`

Type: `Class`

Returns: `Keychain`

Create a new keychain object. The keychain can be used to create encryption streams, decryption streams, and to encrypt or decrypt a "metadata" buffer.

#### `key`

Type: `Uint8Array | string | null`

Default: `null`

The main key. This should be 16 bytes in length. If a `string` is given,
then it should be a base64-encoded string. If the argument is `null`, then a
key will be automatically generated.

#### `salt`

Type: `Uint8Array | string | null`

Default: `null`

The salt. This should be 16 bytes in length. If a `string` is given,
then it should be a base64-encoded string. If this argument is `null`, then a
salt will be automatically generated.

### `keychain.key`

Type: `Uint8Array`

The main key.

### `keychain.keyB64`

Type: `string`

The main key as a base64-encoded string.

### `keychain.salt`

Type: `Uint8Array`

The salt.

Implementation note: The salt is used to derive the (internal) metadata key and
authentication token.

### `keychain.saltB64`

Type: `string`

The salt as a base64-encoded string.

### `keychain.authToken()`

Type: `Function`

Returns: `Promise[Uint8Array]`

Returns a `Promise` which resolves to the authentication token. By default, the
authentication token is automatically derived from the main key using
HKDF SHA-256.

In Wormhole, the authentication token is used to communicate with the server and
prove that the client has permission to fetch data for a room. Without a valid
authentication token, the server will not return the encrypted room metadata or
allow downloading the encrypted file data.

Since the authentication token is derived from the main key, the client presents
it to the Wormhole server as a "reader token" to prove that it is in possession
of the main key without revealing the main key to the server.

For destructive operations, like modifying the room, the client instead presents
a "writer token", which is not derived from the main key but is provided by the
server to the room creator who overrides the keychain authentication token by
calling `keychain.setAuthToken(authToken)` with the "writer token".

### `keychain.authTokenB64()`

Type: `Function`

Returns: `Promise[string]`

Returns a `Promise` that resolves to the authentication token as a
base64-encoded string.

### `keychain.authHeader()`

Type: `Function`

Returns: `Promise[string]`

Returns a `Promise` that resolves to the HTTP header value to be provided to the
Wormhole server. It contains the authentication token.

### `keychain.setAuthToken(authToken)`

Type: `Function`

Returns: `undefined`

Update the keychain authentication token to `authToken`.

#### `authToken`

Type: `Uint8Array | string | null`

Default: `null`

The authentication token. This should be 16 bytes in length. If a `string` is
given, then it should be a base64-encoded string. If this argument is `null`,
then an authentication token will be automatically generated.

### `keychain.encryptStream(stream)`

Type: `Function`

Returns: `Promise[ReadableStream]`

Returns a `Promise` that resolves to a `ReadableStream` encryption stream that
consumes the data in `stream` and returns an encrypted version. Data is
encrypted with [Encrypted Content-Encoding for HTTP (RFC 8188)](https://tools.ietf.org/html/rfc8188).

#### `stream`

Type: `ReadableStream`

A WHATWG readable stream used as a data source for the encrypted stream.

### `keychain.decryptStream(encryptedStream)`

Type: `Function`

Returns: `Promise[ReadableStream]`

Returns a `Promise` that resolves to a `ReadableStream` decryption stream that
consumes the data in `encryptedStream` and returns a plaintext version.

#### `encryptedStream`

Type: `ReadableStream`

A WHATWG readable stream used as a data source for the plaintext stream.

### `keychain.encryptMeta(meta)`

Type: `Function`

Returns: `Promise[Uint8Array]`

Returns a `Promise` that resolves to an encrypted version of `meta`. The
metadata is encrypted with AES-GCM.

Implementation note: The metadata key is automatically derived from the main
key using HKDF SHA-256. The value is not user-controlled.

Implementation note: The initialization vector (IV) is automatically generated
and included in the encrypted output. No need to generate it or to manage it
separately from the encrypted output.

#### `meta`

Type: `Uint8Array`

The metadata buffer to encrypt.

### `keychain.decryptMeta(encryptedMeta)`

Type: `Function`

Returns: `Promise[Uint8Array]`

Returns a `Promise` that resolves to a decrypted version of `encryptedMeta`.

#### `encryptedMeta`

Type: `Uint8Array`

The encrypted metadata buffer to decrypt.

### `plaintextSize(encryptedSize)`

Type: `Function`

Returns: `Number`

Given an encrypted size, return the corresponding plaintext size.

### `encryptedSize(plaintextSize)`

Type: `Function`

Returns: `Number`

Given a plaintext size, return the corresponding encrypted size.

## License

MIT. Copyright (c) [Socket Inc](https://socket.dev)
