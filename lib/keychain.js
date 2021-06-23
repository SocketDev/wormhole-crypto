/* eslint-env browser */

import {
  decryptStream,
  decryptStreamRange,
  encryptStream
} from './ece.js'

import base64 from 'base64-js'

export {
  encryptedSize,
  plaintextSize
} from './ece.js'

const IV_LENGTH = 16

const encoder = new TextEncoder()

function arrayToB64 (array) {
  return base64.fromByteArray(array)
}

function arrayToB64Url (array) {
  return base64
    .fromByteArray(array)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function b64ToArray (str) {
  return base64.toByteArray(str + '==='.slice((str.length + 3) % 4))
}

function decodeBits (bitsB64) {
  let result
  if (bitsB64 instanceof Uint8Array) {
    result = bitsB64
  } else if (typeof bitsB64 === 'string') {
    result = b64ToArray(bitsB64)
  } else if (bitsB64 == null) {
    result = crypto.getRandomValues(new Uint8Array(16))
  } else {
    throw new Error('Must be Uint8Array, string, or nullish')
  }

  if (result.byteLength !== 16) {
    throw new Error('Invalid byteLength: must be 16 bytes')
  }
  return result
}

export class Keychain {
  constructor (key, salt) {
    this.key = decodeBits(key)
    this.salt = decodeBits(salt)

    this.mainKeyPromise = crypto.subtle.importKey(
      'raw',
      this.key,
      'HKDF',
      false,
      ['deriveBits', 'deriveKey']
    )

    this.metaKeyPromise = this.mainKeyPromise
      .then(mainKey =>
        crypto.subtle.deriveKey(
          {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: this.salt,
            info: encoder.encode('metadata')
          },
          mainKey,
          {
            name: 'AES-GCM',
            length: 128
          },
          false,
          ['encrypt', 'decrypt']
        )
      )

    this.authTokenPromise = this.mainKeyPromise
      .then(mainKey =>
        crypto.subtle.deriveBits(
          {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: this.salt,
            info: encoder.encode('authentication')
          },
          mainKey,
          128
        )
      )
      .then(authTokenBuf => new Uint8Array(authTokenBuf))
  }

  get keyB64 () {
    return arrayToB64Url(this.key)
  }

  get saltB64 () {
    return arrayToB64(this.salt)
  }

  async authToken () {
    return await this.authTokenPromise
  }

  async authTokenB64 () {
    const authToken = await this.authToken()
    return arrayToB64(authToken)
  }

  async authHeader () {
    const authTokenB64 = await this.authTokenB64()
    return `Bearer sync-v1 ${authTokenB64}`
  }

  setAuthToken (authToken) {
    this.authTokenPromise = Promise.resolve(decodeBits(authToken))
  }

  async encryptStream (stream) {
    if (!(stream instanceof ReadableStream)) {
      throw new TypeError('stream')
    }
    const mainKey = await this.mainKeyPromise
    return encryptStream(stream, mainKey)
  }

  async decryptStream (encryptedStream) {
    if (!(encryptedStream instanceof ReadableStream)) {
      throw new TypeError('encryptedStream')
    }
    const mainKey = await this.mainKeyPromise
    return decryptStream(encryptedStream, mainKey)
  }

  async decryptStreamRange (offset, length, totalEncryptedLength) {
    if (!Number.isInteger(offset)) {
      throw new TypeError('offset')
    }
    if (!Number.isInteger(length)) {
      throw new TypeError('length')
    }
    if (!Number.isInteger(totalEncryptedLength)) {
      throw new TypeError('totalEncryptedLength')
    }

    const mainKey = await this.mainKeyPromise
    return decryptStreamRange(mainKey, offset, length, totalEncryptedLength)
  }

  async encryptMeta (meta) {
    if (!(meta instanceof Uint8Array)) {
      throw new TypeError('meta')
    }

    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
    const metaKey = await this.metaKeyPromise

    const encryptedMetaBuf = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        tagLength: 128
      },
      metaKey,
      meta
    )

    const encryptedMeta = new Uint8Array(encryptedMetaBuf)

    const ivEncryptedMeta = new Uint8Array(IV_LENGTH + encryptedMeta.byteLength)
    ivEncryptedMeta.set(iv, 0)
    ivEncryptedMeta.set(encryptedMeta, IV_LENGTH)

    return ivEncryptedMeta
  }

  async decryptMeta (ivEncryptedMeta) {
    if (!(ivEncryptedMeta instanceof Uint8Array)) {
      throw new Error('ivEncryptedMeta')
    }

    const iv = ivEncryptedMeta.slice(0, IV_LENGTH)
    const encryptedMeta = ivEncryptedMeta.slice(IV_LENGTH)

    const metaKey = await this.metaKeyPromise
    const metaBuf = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        tagLength: 128
      },
      metaKey,
      encryptedMeta
    )
    const meta = new Uint8Array(metaBuf)
    return meta
  }
}
