/* eslint-env browser */

/**
 * Encryption and decryption streams for "Encrypted Content-Encoding for HTTP"
 * specification. See: https://tools.ietf.org/html/rfc8188
 */

import { concatStreams } from './concat-streams.js'
import { transformStream } from './transform-stream.js'
import { ExtractTransformer } from './extract-transformer.js'
import { SliceTransformer } from './slice-transformer.js'

const MODE_ENCRYPT = 'encrypt'
const MODE_DECRYPT = 'decrypt'
const KEY_LENGTH = 16
const TAG_LENGTH = 16
const NONCE_LENGTH = 12
const RECORD_SIZE = 64 * 1024
const HEADER_LENGTH = KEY_LENGTH + 4 + 1 // salt + record size + idlen

const encoder = new TextEncoder()

/**
 * Given a plaintext size, return the corresponding encrypted size.
 *
 * plaintextSize: int containing plaintext size
 * rs:            int containing record size, optional
 */
export function encryptedSize (plaintextSize, rs = RECORD_SIZE) {
  if (!Number.isInteger(plaintextSize)) {
    throw new TypeError('plaintextSize')
  }
  if (!Number.isInteger(rs)) {
    throw new TypeError('rs')
  }

  const chunkMetaLength = TAG_LENGTH + 1 // Chunk metadata, tag and delimiter
  return (
    HEADER_LENGTH +
    plaintextSize +
    chunkMetaLength * Math.ceil(plaintextSize / (rs - chunkMetaLength))
  )
}

/**
 * Given an encrypted size, return the corresponding plaintext size.
 *
 * encryptedSize: int containing encrypted size
 * rs:            int containing record size, optional
 */
export function plaintextSize (encryptedSize, rs = RECORD_SIZE) {
  if (!Number.isInteger(encryptedSize)) {
    throw new TypeError('encryptedSize')
  }
  if (!Number.isInteger(rs)) {
    throw new TypeError('rs')
  }

  const chunkMetaLength = TAG_LENGTH + 1 // Chunk metadata, tag and delimiter
  const encryptedRecordsSize = encryptedSize - HEADER_LENGTH
  return (
    encryptedRecordsSize -
    chunkMetaLength * Math.ceil(encryptedRecordsSize / rs)
  )
}

/**
 * Given a plaintext stream `input`, return an encrypted stream.
 *
 * input:     a ReadableStream containing data to be transformed
 * secretKey: CryptoKey containing secret key of size KEY_LENGTH
 * rs:        int containing record size, optional
 * salt:      Uint8Array containing salt of KEY_LENGTH length, optional
 */
export function encryptStream (
  input,
  secretKey,
  rs = RECORD_SIZE,
  salt = generateSalt(KEY_LENGTH)
) {
  const stream = transformStream(
    input,
    new SliceTransformer(rs - TAG_LENGTH - 1)
  ).readable

  return transformStream(
    stream,
    new ECETransformer(MODE_ENCRYPT, secretKey, rs, salt)
  ).readable
}

/**
 * Given an encrypted stream `input`, return a plaintext stream.
 *
 * input:     a ReadableStream containing data to be transformed
 * secretKey: CryptoKey containing secret key of size KEY_LENGTH
 * rs:        int containing record size, optional
 */
export function decryptStream (input, secretKey, rs = RECORD_SIZE) {
  const stream = transformStream(input, new SliceTransformer(HEADER_LENGTH, rs)).readable

  return transformStream(
    stream,
    new ECETransformer(MODE_DECRYPT, secretKey, rs, null)
  ).readable
}

/**
 * Given a desired plaintext byte range specified by `offset` and `length`, and the
 * total size of the encrypted stream in `totalEncryptedLength`, provides a mechanism to
 * decrypt that range.
 *
 * To decrypt an arbitrary plaintext range, the client will need to supply multiple
 * (currently always two) ranges of encrypted data. `decryptStreamRange` returns a promise
 * that resolves to an object containing `ranges`, which is an array of { offset, length }
 * entries specifying the needed encrypted byte ranges, and `encrypt`, a callback function.
 *
 * Once the client has gathered an array `streams` of encrypted ReadableStreams, one for
 * each of these ranges, it should call `encrypt(streams)`. This will then return the final
 * plaintext ReadableStream.
 *
 * secretKey:             CryptoKey containing secret key of size KEY_LENGTH
 * offset:                int containing plaintext byte offset at which to start decryption
 * length:                int containing the number of plaintext bytes to decrypt
 * totalEncryptedLength:  The total number of bytes in the encrypted stream
 * rs:                    int containing record size, optional
 */
export function decryptStreamRange (secretKey, offset, length, totalEncryptedLength, rs = RECORD_SIZE) {
  if (!Number.isInteger(rs)) {
    throw new TypeError('rs')
  }

  // Chunk metadata, tag and delimiter
  const chunkMetaLength = TAG_LENGTH + 1

  // First record needed to decrypt the range
  const startRecord = Math.floor(offset / (rs - chunkMetaLength))
  const offsetInStartRecord = offset % (rs - chunkMetaLength)

  // Record after the last record needed to decrypt the range
  const endRecord = Math.ceil((offset + length) / (rs - chunkMetaLength))

  // Range needed for data (not header) stream
  const dataOffset = HEADER_LENGTH + startRecord * rs
  let dataEnd = HEADER_LENGTH + endRecord * rs // exclusive

  // Determine if the stream ends at the end of the encrypted file.
  // This is necessary to correctly validate the padding of the final record.
  const endsPrematurely = dataEnd < totalEncryptedLength
  if (!endsPrematurely) {
    dataEnd = totalEncryptedLength
  }

  return {
    ranges: [
      {
        offset: 0,
        length: HEADER_LENGTH
      }, {
        offset: dataOffset,
        length: dataEnd - dataOffset
      }
    ],
    decrypt: (streams) => {
      if (!(streams.every(stream => stream instanceof ReadableStream))) {
        throw new TypeError('stream')
      }

      // Combine the header and data streams, and then slice how ECETransformer expects
      const encryptedStream = transformStream(concatStreams(streams), new SliceTransformer(HEADER_LENGTH, rs)).readable

      // Plaintext stream of needed records
      const plaintextStream = transformStream(
        encryptedStream,
        new ECETransformer(MODE_DECRYPT, secretKey, rs, null, {
          startSeq: startRecord,
          endSeq: endRecord,
          endsPrematurely
        })
      ).readable

      // Extract the exact needed bytes from the plaintext stream
      return transformStream(plaintextStream, new ExtractTransformer(offsetInStartRecord, length)).readable
    }
  }
}

function checkSecretKey (secretKey) {
  if (secretKey.type !== 'secret') {
    throw new Error('Invalid key: type must be "secret"')
  }
  if (secretKey.algorithm.name !== 'HKDF') {
    throw new Error('Invalid key: algorithm must be HKDF')
  }
  if (!secretKey.usages.includes('deriveKey')) {
    throw new Error('Invalid key: usages must include deriveKey')
  }
  if (!secretKey.usages.includes('deriveBits')) {
    throw new Error('Invalid key: usages must include deriveBits')
  }
}

function generateSalt (len) {
  const salt = new Uint8Array(len)
  crypto.getRandomValues(salt)
  return salt
}

class ECETransformer {
  constructor (mode, secretKey, rs, salt, seekOpts = {}) {
    if (mode !== MODE_ENCRYPT && mode !== MODE_DECRYPT) {
      throw new Error('mode must be either encrypt or decrypt')
    }
    checkSecretKey(secretKey)
    if (salt != null && salt.byteLength !== KEY_LENGTH) {
      throw new Error('Invalid salt length')
    }
    this.mode = mode
    this.secretKey = secretKey
    this.rs = rs
    this.salt = salt

    // seekOpts can contain (for decryption only):
    // startSeq: first record sequence number
    // endSeq: last record sequence number + 1 (exclusive)
    // endsPrematurely: true if the last record should have non-final padding
    this.seekOpts = seekOpts

    // sequence number. -1 is the header, 0 is the first data chunk
    this.seq = -1
    this.prevChunk = null
    this.nonceBase = null
    this.key = null
  }

  async generateKey () {
    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: this.salt,
        info: encoder.encode('Content-Encoding: aes128gcm\0')
      },
      this.secretKey,
      {
        name: 'AES-GCM',
        length: KEY_LENGTH * 8
      },
      false,
      ['encrypt', 'decrypt']
    )
  }

  async generateNonceBase () {
    const nonceBaseBuf = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: this.salt,
        info: encoder.encode('Content-Encoding: nonce\0')
      },
      this.secretKey,
      NONCE_LENGTH * 8
    )
    return new Uint8Array(nonceBaseBuf)
  }

  generateNonce (seq) {
    if (seq > 0xffffffff) {
      throw new Error('record sequence number exceeds limit')
    }
    const nonce = this.nonceBase.slice()
    const dv = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength)
    const m = dv.getUint32(nonce.byteLength - 4)
    const xor = (m ^ seq) >>> 0 // forces unsigned int xor
    dv.setUint32(nonce.byteLength - 4, xor)
    return nonce
  }

  pad (data, isLast) {
    const len = data.byteLength
    if (len + TAG_LENGTH >= this.rs) {
      throw new Error('data too large for record size')
    }

    let padding
    if (isLast) {
      padding = Uint8Array.of(2)
    } else {
      padding = new Uint8Array(this.rs - len - TAG_LENGTH)
      padding[0] = 1
    }

    const result = new Uint8Array(data.byteLength + padding.byteLength)
    result.set(data, 0)
    result.set(padding, data.byteLength)
    return result
  }

  unpad (data, isLast) {
    for (let i = data.byteLength - 1; i >= 0; i -= 1) {
      if (data[i] !== 0) {
        if (isLast) {
          if (data[i] !== 2) {
            throw new Error('delimiter of final record is not 2')
          }
        } else {
          if (data[i] !== 1) {
            throw new Error('delimiter of not final record is not 1')
          }
        }
        return data.slice(0, i)
      }
    }
    throw new Error('no delimiter found')
  }

  createHeader () {
    const header = new Uint8Array(HEADER_LENGTH)
    header.set(this.salt)
    const dv = new DataView(header.buffer, header.byteOffset, header.byteLength)
    dv.setUint32(KEY_LENGTH, this.rs)
    return header
  }

  readHeader (buffer) {
    if (buffer.byteLength !== HEADER_LENGTH) {
      throw new Error('chunk is not expected header length')
    }
    const header = {}
    const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    header.salt = buffer.slice(0, KEY_LENGTH)
    header.rs = dv.getUint32(KEY_LENGTH)
    const idlen = dv.getUint8(KEY_LENGTH + 4)
    if (idlen !== 0) {
      throw new Error('Implementation does not support non-zero idlen')
    }
    return header
  }

  async encryptRecord (record, seq, isLast) {
    const nonce = this.generateNonce(seq)
    const paddedRecord = this.pad(record, isLast)
    const encryptedRecordBuf = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
        tagLength: TAG_LENGTH * 8
      },
      this.key,
      paddedRecord
    )

    return new Uint8Array(encryptedRecordBuf)
  }

  async decryptRecord (encryptedRecord, seq, isLast) {
    const nonce = this.generateNonce(seq)
    const paddedRecordBuf = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
        tagLength: TAG_LENGTH * 8
      },
      this.key,
      encryptedRecord
    )
    const paddedRecord = new Uint8Array(paddedRecordBuf)
    return this.unpad(paddedRecord, isLast)
  }

  async start (controller) {
    if (this.mode === MODE_ENCRYPT) {
      this.key = await this.generateKey()
      this.nonceBase = await this.generateNonceBase()
      controller.enqueue(this.createHeader())
      this.seq += 1
    }
  }

  async transformPrevChunk (isLast, controller) {
    if (this.mode === MODE_ENCRYPT) {
      controller.enqueue(
        await this.encryptRecord(this.prevChunk, this.seq, isLast)
      )
    } else {
      if (this.seq === -1) {
        // the first chunk during decryption contains only the header
        const header = this.readHeader(this.prevChunk)
        this.salt = header.salt
        if (this.rs != null && this.rs !== header.rs) {
          throw new Error(
            'Record size declared in constructor does not match record size in encrypted stream'
          )
        }
        this.rs = header.rs

        this.key = await this.generateKey()
        this.nonceBase = await this.generateNonceBase()

        const startSeq = this.seekOpts.startSeq
        if (startSeq != null && startSeq > 0) {
          // update the sequence number if decryption doesn't start
          // at seq = 0
          this.seq += startSeq
        }
      } else {
        let expectEndPadding = false
        if (isLast) {
          // verify encrypted stream length even when seeking
          const endSeq = this.seekOpts.endSeq
          if (endSeq != null && endSeq !== this.seq + 1) {
            throw new Error('Incorrect encrypted stream length')
          }

          // if the stream ends prematurely, expect a non-end padding byte
          expectEndPadding = !this.seekOpts.endsPrematurely
        }

        controller.enqueue(
          await this.decryptRecord(this.prevChunk, this.seq, expectEndPadding)
        )
      }
    }
    this.seq += 1
  }

  async transform (chunk, controller) {
    if (this.prevChunk) {
      await this.transformPrevChunk(false, controller)
    }
    this.prevChunk = chunk
  }

  async flush (controller) {
    if (this.prevChunk) {
      await this.transformPrevChunk(true, controller)
    }
  }
}
