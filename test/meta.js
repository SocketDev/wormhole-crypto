/* eslint-env browser */

import test from 'tape'

import { Keychain } from '../index.js'

test('encrypt then decrypt metadata', async t => {
  const keychain = new Keychain()
  const meta = crypto.getRandomValues(new Uint8Array(1000))
  const encryptedMeta = await keychain.encryptMeta(meta)
  const plaintextMeta = await keychain.decryptMeta(encryptedMeta)
  t.deepEqual(meta, plaintextMeta)
})
