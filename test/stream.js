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

test('encrypt then decrypt stream', async t => {
  const keychain = new Keychain()

  const data = crypto.getRandomValues(new Uint8Array(65536))

  const stream = arrayToStream(data)
  const encryptedStream = await keychain.encryptStream(stream)

  const plaintextStream = await keychain.decryptStream(encryptedStream)
  const plaintext = await streamToArray(plaintextStream)

  t.deepEqual(data, plaintext)
})
