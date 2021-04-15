/* eslint-env browser */
/* global TransformStream */

/**
 * Pipe a readable stream through a transformer. Return the readable end of the
 * TransformStream.
 * Includes a shim for environments where TransformStream is not available.
 */
export function transformStream (readable, transformer, onEnd = () => {}) {
  // Chrome, Edge, Safari TP
  if (typeof TransformStream !== 'undefined') {
    const transform = new TransformStream(transformer)

    readable.pipeTo(transform.writable).then(() => onEnd(null), onEnd)
    return transform.readable
  }

  // Firefox, Safari 14 and older
  return new ReadableStream(
    new TransformStreamSource(readable, transformer, onEnd)
  )
}

class TransformStreamSource {
  constructor (readable, transformer, onEnd) {
    this.readable = readable
    this.transformer = transformer
    this.onEnd = err => {
      onEnd(err)
      this.onEnd = () => {}
    }
    this.reader = readable.getReader()
  }

  async start (controller) {
    if (this.transformer?.start) {
      try {
        return await this.transformer.start(controller)
      } catch (err) {
        this.onEnd(err)
        throw err
      }
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
    try {
      // eslint-disable-next-line no-unmodified-loop-condition
      while (!enqueued) {
        const data = await this.reader.read()
        if (data.done) {
          if (this.transformer?.flush) {
            await this.transformer.flush(controller)
          }
          controller.close()
          this.onEnd(null)
          return
        }
        if (this.transformer) {
          await this.transformer.transform(data.value, wrappedController)
        } else {
          wrappedController.enqueue(data.value)
        }
      }
    } catch (err) {
      this.onEnd(err)
      throw err
    }
  }

  async cancel (reason) {
    try {
      return await this.reader.cancel(reason)
    } finally {
      this.onEnd(reason)
    }
  }
}
