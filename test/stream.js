/* eslint-env browser */

import test from 'tape'

import { Keychain } from '../index.js'

function arrayToStream (array) {
  return new ReadableStream({
    pull (controller) {
      controller.enqueue(array)
      controller.close()
    }
  })
}

async function streamToArray (stream) {
  const response = new Response(stream)
  return new Uint8Array(await response.arrayBuffer())
}

// Work around maximum supported size of crypto.getRandomValues
function getRandomValues (length) {
  const MAX_RANDOM = 65536

  const buffer = new Uint8Array(length)
  for (let i = 0; i < length; i += MAX_RANDOM) {
    crypto.getRandomValues(buffer.subarray(i, i + MAX_RANDOM))
  }

  return buffer
}

test('encrypt then decrypt stream', async t => {
  const keychain = new Keychain()

  const data = crypto.getRandomValues(new Uint8Array(65536))

  const stream = arrayToStream(data)
  const encryptedStream = await keychain.encryptStream(stream)

  const plaintextStream = await keychain.decryptStream(encryptedStream)
  const plaintext = await streamToArray(plaintextStream)

  t.deepEqual(plaintext, data)
})

test('decrypt ranges', async t => {
  const keychain = new Keychain()

  const data = getRandomValues(500000)

  const encryptedData = await streamToArray(await keychain.encryptStream(arrayToStream(data)))

  await t.test('range at the beginning of stream', async t => {
    const offset = 0
    const length = 1000
    const { ranges, decrypt } = await keychain.decryptStreamRange(offset, length, encryptedData.byteLength)

    const streams = ranges.map(({ offset, length }) => arrayToStream(encryptedData.slice(offset, offset + length)))

    const plaintext = await streamToArray(decrypt(streams))

    t.deepEqual(plaintext, data.slice(offset, offset + length))
  })

  await t.test('range in the middle of stream', async t => {
    const offset = 100000
    const length = 200000
    const { ranges, decrypt } = await keychain.decryptStreamRange(offset, length, encryptedData.byteLength)

    const streams = ranges.map(({ offset, length }) => arrayToStream(encryptedData.slice(offset, offset + length)))

    const plaintext = await streamToArray(decrypt(streams))

    t.deepEqual(plaintext, data.slice(offset, offset + length))
  })

  await t.test('range at the end of stream', async t => {
    const offset = 400000
    const length = data.byteLength - offset
    const { ranges, decrypt } = await keychain.decryptStreamRange(offset, length, encryptedData.byteLength)

    const streams = ranges.map(({ offset, length }) => arrayToStream(encryptedData.slice(offset, offset + length)))

    const plaintext = await streamToArray(decrypt(streams))

    t.deepEqual(plaintext, data.slice(offset, offset + length))
  })

  await t.test('range on record boundaries', async t => {
    // start exactly at the beginning of the second record
    const offset = 65536 - 17 /* chunk meta length */
    // end exactly at the end of the second record
    const length = 65536 - 17
    const { ranges, decrypt } = await keychain.decryptStreamRange(offset, length, encryptedData.byteLength)

    const streams = ranges.map(({ offset, length }) => arrayToStream(encryptedData.slice(offset, offset + length)))

    const plaintext = await streamToArray(decrypt(streams))

    t.deepEqual(plaintext, data.slice(offset, offset + length))
  })

  await t.test('range with extra chunk in encrypted stream', async t => {
    // start exactly at the beginning of the second record
    const offset = 65536 - 17 /* chunk meta length */
    // end exactly at the end of the third record
    const length = (65536 - 17) * 2
    const { ranges, decrypt } = await keychain.decryptStreamRange(offset, length, encryptedData.byteLength)

    const streams = [
      arrayToStream(encryptedData.slice(ranges[0].offset, ranges[0].offset + ranges[0].length)),
      // make data stream too long by one record
      arrayToStream(encryptedData.slice(ranges[1].offset, ranges[1].offset + ranges[1].length + 65536))
    ]

    // note that t.throws() doesn't work for promise rejections
    try {
      await streamToArray(decrypt(streams))
      t.fail('should have thrown')
    } catch (err) {
      t.ok(err, 'throws with short input')
    }
  })
})
