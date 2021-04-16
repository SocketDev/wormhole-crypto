/* eslint-env browser */
/* global TransformStream */

/**
 * Pipe a readable stream through a transformer. Return the readable end of the
 * TransformStream.
 * Includes a shim for environments where TransformStream is not available.
 */
export function transformStream (readable, transformer) {
  // Chrome, Edge, Safari TP
  if (typeof TransformStream !== 'undefined') {
    return readable.pipeThrough(new TransformStream(transformer))
  }

  // Firefox, Safari 14 and older
  return new ReadableStream(new TransformStreamSource(readable, transformer))
}

class TransformStreamSource {
  constructor (readable, transformer) {
    this.readable = readable
    this.transformer = transformer
    this.reader = readable.getReader()
  }

  async start (controller) {
    if (this.transformer.start) {
      return await this.transformer.start(controller)
    }
  }

  async pull (controller) {
    let enqueued = false
    const wrappedController = {
      enqueue (d) {
        enqueued = true
        controller.enqueue(d)
      }
    }

    // eslint-disable-next-line no-unmodified-loop-condition
    while (!enqueued) {
      const data = await this.reader.read()
      if (data.done) {
        if (this.transformer.flush) {
          await this.transformer.flush(controller)
        }
        controller.close()
        return
      }
      await this.transformer.transform(data.value, wrappedController)
    }
  }

  async cancel (reason) {
    return await this.reader.cancel(reason)
  }
}
