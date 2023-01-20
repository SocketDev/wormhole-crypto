/* eslint-env browser */

/**
 * Concatenates the array of ReadableStreams passed in `inputStreams` into a single
 * ReadableStream.
 *
 * @param {ReadableStream[]} inputStreams
 * @returns ReadableStream
 */
export function concatStreams (inputStreams) {
  let currentReader = null

  // Move to the next stream
  const nextStream = (controller) => {
    const stream = inputStreams.shift()
    if (stream !== undefined) {
      currentReader = stream.getReader()
    } else {
      currentReader = null
      controller.close()
    }
  }

  return new ReadableStream({
    start (controller) {
      nextStream(controller)
    },

    async pull (controller) {
      // eslint-disable-next-line no-unmodified-loop-condition
      while (currentReader !== null) {
        const { value, done } = await currentReader.read()
        if (done) {
          nextStream(controller)
        } else {
          controller.enqueue(value)
          break
        }
      }
    },

    async cancel (reason) {
      await Promise.all([
        currentReader && currentReader.cancel(reason),
        ...inputStreams.map(stream => stream.cancel(reason))
      ])
    }
  })
}
